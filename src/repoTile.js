// --- Setup token, owner, repo ---
let token = localStorage.getItem("githubToken");
if (!token) {
    token = prompt("Voer je GitHub Personal Access Token in:");
    if (!token) {
        document.getElementById("error-message").textContent = "Geen token opgegeven, dashboard kan niet laden.";
        throw new Error("Token missing");
    }
    localStorage.setItem("githubToken", token);
}

let urlParams = new URLSearchParams(window.location.search);
let owner = urlParams.get("owner");
let repo = urlParams.get("repo");

if (!owner) owner = prompt("Voer de GitHub owner in:");
if (!repo) repo = prompt("Voer de repository naam in:");

if (!owner || !repo) {
    document.getElementById("error-message").textContent = "Owner of repo ontbreekt.";
    throw new Error("Owner/repo missing");
}

const repoNameEl = document.getElementById("repo-name");
const createdAtEl = document.getElementById("created-at");
const contributorsEl = document.getElementById("contributors");
const summaryEl = document.getElementById("summary");
const fileTypesEl = document.getElementById("file-types");
const progressEl = document.getElementById("progress");
const errorMessage = document.getElementById("error-message");

// --- Helper to decode Base64 ---
function decodeBase64(content) {
    try { return atob(content.replace(/\n/g, "")); }
    catch { return ""; }
}

async function loadRepoInfo() {
    try {
        const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
            headers: { Authorization: `token ${token}` }
        });
        if (!resp.ok) throw new Error("Repository niet gevonden of token ongeldig.");
        const data = await resp.json();
        repoNameEl.textContent = data.full_name;
        createdAtEl.textContent = `Aangemaakt op: ${new Date(data.created_at).toLocaleDateString()}`;
    } catch(err) { errorMessage.textContent = err.message; }
}

async function loadContributors() {
    try {
        const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/contributors`, {
            headers: { Authorization: `token ${token}` }
        });
        if (!resp.ok) throw new Error("Kon contributors niet ophalen.");
        const data = await resp.json();
        contributorsEl.innerHTML = "";
        data.forEach(user => {
            const li = document.createElement("li");
            li.textContent = `${user.login} (${user.contributions} commits)`;
            contributorsEl.appendChild(li);
        });
    } catch(err) { errorMessage.textContent = err.message; }
}

async function getRepoFiles() {
    const repoResp = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: { Authorization: `token ${token}` }
    });
    const repoData = await repoResp.json();
    const branch = repoData.default_branch;

    const treeResp = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, {
        headers: { Authorization: `token ${token}` }
    });
    if (!treeResp.ok) throw new Error("Kon bestandenlijst niet ophalen.");

    const treeData = await treeResp.json();
    const files = treeData.tree.filter(item => item.type === "blob").slice(0, 100); // limit 100 files
    const fileStats = {};

    let index = 0;
    for (const file of files) {
        index++;
        progressEl.textContent = `Analyseren bestanden (${index}/${files.length})`;

        const extMatch = file.path.match(/\.([a-zA-Z0-9]+)$/);
        const ext = extMatch ? extMatch[1].toLowerCase() : "unknown";

        try {
            const contentResp = await fetch(file.url, { headers: { Authorization: `token ${token}` } });
            const contentData = await contentResp.json();
            let lines = 0;
            if (contentData.content) {
                const decoded = decodeBase64(contentData.content);
                lines = decoded.split("\n").length;
            }
            fileStats[file.path] = { type: ext, lines, additions: 0, deletions: 0 };
        } catch {
            fileStats[file.path] = { type: ext, lines: 0, additions: 0, deletions: 0 };
        }
    }
    return fileStats;
}

async function getFileChangesFromCommits() {
    const perPage = 50;
    const maxPages = 4;
    let allCommits = [];

    for (let page = 1; page <= maxPages; page++) {
        const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=${perPage}&page=${page}`, {
            headers: { Authorization: `token ${token}` }
        });
        const commits = await resp.json();
        if (!commits || commits.length === 0) break;
        allCommits = allCommits.concat(commits);
    }

    const fileChanges = {};
    for (const commit of allCommits) {
        try {
            const commitResp = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits/${commit.sha}`, {
                headers: { Authorization: `token ${token}` }
            });
            const commitData = await commitResp.json();
            if (!commitData.files) continue;

            for (const file of commitData.files) {
                if (!fileChanges[file.filename]) fileChanges[file.filename] = { additions: 0, deletions: 0 };
                fileChanges[file.filename].additions += file.additions;
                fileChanges[file.filename].deletions += file.deletions;
            }
        } catch {}
    }
    return fileChanges;
}

async function loadFileDetails() {
    try {
        fileTypesEl.textContent = "";
        summaryEl.textContent = "";
        progressEl.textContent = "Bezig met ophalen...";

        const [repoFiles, commitChanges] = await Promise.all([getRepoFiles(), getFileChangesFromCommits()]);

        for (const [filename, stats] of Object.entries(repoFiles)) {
            if (commitChanges[filename]) {
                stats.additions = commitChanges[filename].additions;
                stats.deletions = commitChanges[filename].deletions;
            }
        }

        const summary = {};
        for (const stats of Object.values(repoFiles)) {
            if (!summary[stats.type]) summary[stats.type] = { count: 0, totalLines: 0, totalAdd: 0, totalDel: 0 };
            summary[stats.type].count++;
            summary[stats.type].totalLines += stats.lines;
            summary[stats.type].totalAdd += stats.additions;
            summary[stats.type].totalDel += stats.deletions;
        }

        summaryEl.innerHTML = "<h2>Samenvatting per bestandstype</h2>" +
            Object.entries(summary).map(([ext, data]) => `
                <div class="summary-card">
                    <strong>.${ext}</strong>: ${data.count} bestanden | ${data.totalLines} regels | 🟢 +${data.totalAdd} | 🔴 -${data.totalDel}
                </div>
            `).join("");

        fileTypesEl.innerHTML = Object.entries(repoFiles).map(([path, stats]) => `
            <div class="file-card">
                <p><strong>${path}</strong></p>
                <p>Type: .${stats.type}</p>
                <p>Regels: ${stats.lines}</p>
                <p>Toegevoegd: +${stats.additions} / Verwijderd: -${stats.deletions}</p>
            </div>
        `).join("");

        progressEl.textContent = "Klaar!";
    } catch(err) {
        console.error(err);
        fileTypesEl.textContent = "Fout bij laden van bestandsdetails.";
    }
}

// main
loadRepoInfo();
loadContributors();
loadFileDetails();
