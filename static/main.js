// Read server-rendered data from the template in a way that keeps editor diagnostics happy.
const repoUrl = document.body?.dataset?.repoUrl || "";
const initialCommitsNode = document.getElementById("initial-commits-data");

let commits = [];
if (initialCommitsNode) {
    try {
        const parsedCommits = JSON.parse(initialCommitsNode.textContent || "[]");
        commits = Array.isArray(parsedCommits) ? parsedCommits : [];
    } catch (error) {
        console.error("Failed to parse initial commits:", error);
    }
}

function getSelectedCommits() {
    // Read the current checkbox state from the server-rendered markup.
    const checkedBoxes = Array.from(document.querySelectorAll(".commit-checkbox:checked"));
    return checkedBoxes
        .map((checkbox) => commits.find((commit) => commit.sha === checkbox.value))
        .filter(Boolean);
}

async function compareLatest() {
    if (commits.length < 2) {
        alert("Not enough commits");
        return;
    }

    const currentRepoUrl = repoUrl || document.getElementById("repoInput")?.value?.trim() || "";
    const commit1 = commits[0].sha;
    const commit2 = commits[1].sha;

    sendCompare(currentRepoUrl, commit1, commit2);
}

async function compareSelected() {
    const selectedCommits = getSelectedCommits();

    if (selectedCommits.length !== 2) {
        alert("Select exactly 2 commits");
        return;
    }

    // Sort by date → oldest first
    selectedCommits.sort((a, b) => {
        return new Date(a.date) - new Date(b.date);
    });

    const commit1 = selectedCommits[0].sha; // older
    const commit2 = selectedCommits[1].sha; // newer

    sendCompare(repoUrl || document.getElementById("repoInput")?.value?.trim() || "", commit1, commit2);
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

document.addEventListener("change", (event) => {
    // Keep selection limited to two commits so the compare action stays predictable.
    if (!event.target.classList.contains("commit-checkbox")) {
        return;
    }

    const checkedBoxes = document.querySelectorAll(".commit-checkbox:checked");
    if (checkedBoxes.length > 2) {
        event.target.checked = false;
        alert("Select only 2 commits");
    }
});
