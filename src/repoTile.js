// --- URL & Token setup ---
const urlParams = new URLSearchParams(window.location.search);
const owner = localStorage.getItem('selectedRepoOwner');
const repo = localStorage.getItem('selectedRepoName');
if (!owner || !repo) {
    document.getElementById('error-message').textContent = 'No repository selected. Go back to the dashboard.';
    throw new Error('No repository selected');
}
const token = localStorage.getItem("githubToken");

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
    } catch (error) {
        errorMessage.textContent = error.message;
    }
}

// --- Fetch contributors ---
async function loadContributors() {
    try {
        const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contributors`, {
            headers: { Authorization: `token ${token}` },
        });

        if (!response.ok) throw new Error("Kon contributors niet ophalen.");
        const data = await response.json();

        contributorsEl.innerHTML = "";
        data.forEach((user) => {
            const li = document.createElement("li");
            li.textContent = `${user.login} (${user.contributions} commits)`;
            contributorsEl.appendChild(li);
        });
    } catch (error) {
        errorMessage.textContent = error.message;
    }
}

// --- Fetch all repo files and their line counts ---
async function getRepoFiles() {
    const repoResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: { Authorization: `token ${token}` },
    });
    const repoData = await repoResponse.json();
    const branch = repoData.default_branch;

    const treeResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
        { headers: { Authorization: `token ${token}` } }
    );

    if (!treeResponse.ok) throw new Error("Kon bestandenlijst niet ophalen.");
    const treeData = await treeResponse.json();

    const files = treeData.tree.filter((item) => item.type === "blob");
    const fileStats = {};

    let index = 0;
    // een counter voor het ophalen van data!!!
    // EXTRA TOEVOEGING VOOR WAT EEN GITHUBPAGINA ZOU MOETEN HEBBEN
    for (const file of files.slice(0, 100)) {
        index++;
        fileTypesEl.textContent = `Analyseren van bestanden (${index}/${files.length})`;

        const extMatch = file.path.match(/\.([a-zA-Z0-9]+)$/);
        const ext = extMatch ? extMatch[1].toLowerCase() : "unknown";

        const contentResponse = await fetch(file.url, {
            headers: { Authorization: `token ${token}` },
        });
        const contentData = await contentResponse.json();

        let lineCount = 0;
        if (contentData.content) {
            const decoded = decodeBase64(contentData.content);
            lineCount = decoded.split("\n").length;
        }

        fileStats[file.path] = {
            type: ext,
            lines: lineCount,
            additions: 0,
            deletions: 0,
        };
    }

    return fileStats;
}

async function getAllFileChangesFromCommits() {
    let allCommits = [];
    let page = 1;
    const perPage = 50;
    const maxPages = 4;

    while (page <= maxPages) {
        const commitsResponse = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/commits?per_page=${perPage}&page=${page}`,
            { headers: { Authorization: `token ${token}` } }
        );
        const commits = await commitsResponse.json();
        if (commits.length === 0) break;
        allCommits = allCommits.concat(commits);
        page++;
    }

    const fileChanges = {};

    for (const commit of allCommits) {
        const commitResponse = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/commits/${commit.sha}`,
            { headers: { Authorization: `token ${token}` } }
        );
        const commitData = await commitResponse.json();

        if (!commitData.files) continue;

        for (const file of commitData.files) {
            if (!fileChanges[file.filename]) {
                fileChanges[file.filename] = { additions: 0, deletions: 0 };
            }
            fileChanges[file.filename].additions += file.additions;
            fileChanges[file.filename].deletions += file.deletions;
        }
    }

    return fileChanges;
}

async function loadFileDetails() {
    try {
        fileTypesEl.textContent = "Bezig met ophalen van bestandsinformatie";

        const [repoFiles, commitChanges] = await Promise.all([
            getRepoFiles(),
            getAllFileChangesFromCommits(),
        ]);

        // Merge commit data into repo file info
        for (const [filename, stats] of Object.entries(repoFiles)) {
            if (commitChanges[filename]) {
                stats.additions = commitChanges[filename].additions;
                stats.deletions = commitChanges[filename].deletions;
            }
        }

        // Display each file
        fileTypesEl.innerHTML = Object.entries(repoFiles)
            .map(
                ([path, stats]) => `
        <div class="file-card">
          <p><strong>${path}</strong></p>
          <p>Type: .${stats.type}</p>
          <p>Regels: ${stats.lines}</p>
          <p>Toegevoegd: +${stats.additions} / Verwijderd: -${stats.deletions}</p>
        </div>
      `
            )
            .join("");
    } catch (error) {
        console.error(error);
        fileTypesEl.textContent = "Fout bij laden van bestandsdetails.";
    }
}

// main
if (!token) {
    errorMessage.textContent = "Geen GitHub token gevonden. Ga terug naar de startpagina.";
} else {
    loadRepoInfo();
    loadContributors();
    loadFileDetails();
}
