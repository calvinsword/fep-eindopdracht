// github pages extra github setup
let token = localStorage.getItem("githubToken");
if (!token) {
    token = prompt("Voer je GitHub Personal Access Token in:");
    if (!token) {
        document.getElementById("error-message").textContent = "Geen token opgegeven, dashboard kan niet laden.";
        throw new Error("Token missing");
    } else {
        localStorage.setItem("githubToken", token);
    }
}

const urlParams = new URLSearchParams(window.location.search);
const owner = urlParams.get("owner");
const repo = urlParams.get("repo");

if (!owner || !repo) {
    document.getElementById("error-message").textContent = "Geen owner of repo opgegeven in de URL.";
    throw new Error("Owner or repo missing");
}

const repoNameEl = document.getElementById("repo-name");
const createdAtEl = document.getElementById("created-at");
const contributorsEl = document.getElementById("contributors");
const fileTypesEl = document.getElementById("file-types");
const errorMessage = document.getElementById("error-message");

function decodeBase64(content) {
    try {
        return atob(content.replace(/\n/g, ""));
    } catch {
        return "";
    }
}

async function loadRepoInfo() {
    try {
        const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
            headers: { Authorization: `token ${token}` },
        });
        if (!response.ok) throw new Error("Repository niet gevonden of token ongeldig.");
        const data = await response.json();

        repoNameEl.textContent = data.full_name;
        createdAtEl.textContent = `Aangemaakt op: ${new Date(data.created_at).toLocaleDateString()}`;
    } catch (err) {
        errorMessage.textContent = err.message;
    }
}

async function loadContributors() {
    try {
        const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contributors`, {
            headers: { Authorization: `token ${token}` },
        });
        if (!response.ok) throw new Error("Kon contributors niet ophalen.");
        const data = await response.json();

        contributorsEl.innerHTML = "";
        data.forEach(user => {
            const li = document.createElement("li");
            li.textContent = `${user.login} (${user.contributions} commits)`;
            contributorsEl.appendChild(li);
        });
    } catch (err) {
        errorMessage.textContent = err.message;
    }
}

async function getRepoFiles() {
    const repoResp = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: { Authorization: `token ${token}` },
    });
    const repoData = await repoResp.json();
    const branch = repoData.default_branch;

    const treeResp = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
        { headers: { Authorization: `token ${token}` } }
    );
    if (!treeResp.ok) throw new Error("Kon bestandenlijst niet ophalen.");

    const treeData = await treeResp.json();
    const files = treeData.tree.filter(item => item.type === "blob").slice(0, 100); // limit 100 files
    const fileStats = {};

    for (const file of files) {
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

async function getAllFileChangesFromCommits() {
    const perPage = 50;
    const maxPages = 4;
    let allCommits = [];

    for (let page = 1; page <= maxPages; page++) {
        const commitsResp = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/commits?per_page=${perPage}&page=${page}`,
            { headers: { Authorization: `token ${token}` } }
        );
        const commits = await commitsResp.json();
        if (!commits || commits.length === 0) break;
        allCommits = allCommits.concat(commits);
    }

    const fileChanges = {};
    for (const commit of allCommits) {
        try {
            const commitResp = await fetch(
                `https://api.github.com/repos/${owner}/${repo}/commits/${commit.sha}`,
                { headers: { Authorization: `token ${token}` } }
            );
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
        fileTypesEl.textContent = "Bezig met ophalen van bestanden...";

        const [repoFiles, commitChanges] = await Promise.all([getRepoFiles(), getAllFileChangesFromCommits()]);

        for (const [filename, stats] of Object.entries(repoFiles)) {
            if (commitChanges[filename]) {
                stats.additions = commitChanges[filename].additions;
                stats.deletions = commitChanges[filename].deletions;
            }
        }

        fileTypesEl.innerHTML = Object.entries(repoFiles)
            .map(([path, stats]) => `
                <div class="file-card">
                    <p><strong>${path}</strong></p>
                    <p>Type: .${stats.type}</p>
                    <p>Regels: ${stats.lines}</p>
                    <p>Toegevoegd: +${stats.additions} / Verwijderd: -${stats.deletions}</p>
                </div>
            `)
            .join("");
    } catch (err) {
        console.error(err);
        fileTypesEl.textContent = "Fout bij laden van bestandsdetails.";
    }
}

//main
loadRepoInfo();
loadContributors();
loadFileDetails();
