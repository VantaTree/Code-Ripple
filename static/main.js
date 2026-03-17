let commits = [];
let selected = [];

async function fetchCommits() {
    const repoUrl = document.getElementById("repoInput").value;

    const res = await fetch("/commits", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ repo_url: repoUrl })
    });

    const data = await res.json();

    commits = data.commits;
    renderCommits();
}

function renderCommits() {
    const list = document.getElementById("commitList");
    list.innerHTML = "";

    commits.forEach((c) => {
        const div = document.createElement("div");

        div.className = "flex items-start gap-2 p-2 border-b last:border-none";

        div.innerHTML = `
      <input type="checkbox" class="mt-1" onchange="toggleSelect('${c.sha}')">
      <div>
        <p class="text-sm font-medium">${c.message}</p>
        <p class="text-xs text-gray-500">${c.author}</p>
      </div>
    `;

        list.appendChild(div);
    });
}

function toggleSelect(sha) {
    if (selected.includes(sha)) {
        selected = selected.filter(s => s !== sha);
    } else {
        if (selected.length >= 2) {
            alert("Select only 2 commits");
            return;
        }
        selected.push(sha);
    }
}

async function compareLatest() {
    if (commits.length < 2) {
        alert("Not enough commits");
        return;
    }

    const repoUrl = document.getElementById("repoInput").value;

    const commit1 = commits[0].sha;
    const commit2 = commits[1].sha;

    sendCompare(repoUrl, commit1, commit2);
}

async function compareSelected() {
    if (selected.length !== 2) {
        alert("Select exactly 2 commits");
        return;
    }

    const repoUrl = document.getElementById("repoInput").value;

    sendCompare(repoUrl, selected[0], selected[1]);
}

async function sendCompare(repoUrl, commit1, commit2) {
    const res = await fetch("/compare", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            repo_url: repoUrl,
            commit1,
            commit2
        })
    });

    const data = await res.json();
    console.log(data);

    alert("Comparison sent! Check backend.");
}