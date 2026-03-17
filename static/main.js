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

        const formattedDate = formatDate(c.date);

        div.innerHTML = `
            <input type="checkbox" class="mt-1" onchange="toggleSelect('${c.sha}')">
            <div>
                <p class="text-sm font-medium">${c.message}</p>
                <p class="text-xs text-gray-500">${c.author}</p>
                <p class="text-xs text-gray-400">${formattedDate}</p>
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

    const selectedCommits = commits.filter(c => selected.includes(c.sha));

    // Sort by date → oldest first
    selectedCommits.sort((a, b) => {
        return new Date(a.date) - new Date(b.date);
    });

    const commit1 = selectedCommits[0].sha; // older
    const commit2 = selectedCommits[1].sha; // newer

    sendCompare(repoUrl, commit1, commit2);
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


function formatDate(dateString) {
    if (!dateString) {
        return "Unknown date";
    }

    const d = new Date(dateString);

    if (isNaN(d.getTime())) {
        return "Invalid date";
    }

    return d.toLocaleString();
}
