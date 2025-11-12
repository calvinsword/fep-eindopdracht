const tokenInput = document.getElementById('token');
const repoInput = document.getElementById('repo');
const saveBtn = document.getElementById('saveBtn');
const errorMessage = document.getElementById('error-message');
const tilesContainer = document.getElementById('tiles');

const limitSpan = document.getElementById('limit');
const remainingSpan = document.getElementById('remaining');

async function updateRateLimit(token) {
    if (!token) return;
    try {
        const response = await fetch('https://api.github.com/rate_limit', {
            headers: { Authorization: `token ${token}` },
        });

        const limit = response.headers.get('X-RateLimit-Limit');
        const remaining = response.headers.get('X-RateLimit-Remaining');

        if (response.status === 401) {
            limitSpan.textContent = '-';
            remainingSpan.textContent = '-';
            errorMessage.textContent = 'Ongeldig GitHub token.';
            return;
        }

        limitSpan.textContent = limit || 'Onbekend';
        remainingSpan.textContent = remaining || 'Onbekend';
    } catch (e) {
        console.warn('Rate limit kon niet worden opgehaald:', e);
        limitSpan.textContent = '-';
        remainingSpan.textContent = '-';
    }
}

async function addRepoTile(token, repoUrl) {
    const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!match) {
        errorMessage.textContent = 'Ongeldige repository URL.';
        return;
    }

    const owner = match[1];
    const repo = match[2];
    const repoFullName = `${owner}/${repo}`;

    const existingTiles = Array.from(tilesContainer.getElementsByClassName('tile'));
    const duplicate = existingTiles.find(tile => tile.dataset.repo === repoFullName);

    if (duplicate) {
        errorMessage.textContent = `Repository "${repoFullName}" is al toegevoegd.`;
        return;
    }

    try {
        const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
            headers: { Authorization: `token ${token}` },
        });

        if (response.status === 401) {
            errorMessage.textContent = 'Ongeldig GitHub token.';
            return;
        }
        if (response.status === 404) {
            errorMessage.textContent = 'Repository niet gevonden.';
            return;
        }
        if (!response.ok) {
            errorMessage.textContent = `Foutmelding: ${response.status}`;
            return;
        }

        const data = await response.json();

        // Clone template
        const template = document.getElementById('tile-template');
        const tile = template.content.cloneNode(true).querySelector('.tile');

        tile.dataset.repo = repoFullName; // Store identifier
        tile.querySelector('h2').textContent = data.full_name;
        tile.querySelector('p').textContent = data.description || 'Geen beschrijving beschikbaar.';

        tile.addEventListener('click', () => {
            localStorage.setItem('selectedRepoOwner', owner);
            localStorage.setItem('selectedRepoName', repo);
            window.location.href = 'src/repoTile.html';
        });

        tilesContainer.appendChild(tile);

        repoInput.value = '';
        errorMessage.textContent = '';

        await updateRateLimit(token);
    } catch (error) {
        errorMessage.textContent = 'Er is iets misgegaan. Zie console.';
        console.error(error);
    }
}

saveBtn.addEventListener('click', async () => {
    const token = tokenInput.value.trim();
    const repoUrl = repoInput.value.trim();
    errorMessage.textContent = '';

    if (!token || !repoUrl) {
        errorMessage.textContent = 'Vul zowel token als repository URL in.';
        return;
    }

    localStorage.setItem('githubToken', token);
    localStorage.setItem('githubRepo', repoUrl);

    await addRepoTile(token, repoUrl);
});

const savedToken = localStorage.getItem('githubToken');
if (savedToken) {
    tokenInput.value = savedToken;
    updateRateLimit(savedToken);
}

// update max request (to github) every minute
setInterval(() => {
    const token = localStorage.getItem('githubToken');
    if (token) updateRateLimit(token);
}, 60000);