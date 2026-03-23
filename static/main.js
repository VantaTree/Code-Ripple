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

let selectedCommitOrder = [];

function findCommitBySha(sha) {
    return commits.find((commit) => commit.sha === sha) || null;
}

function getSelectedCommits() {
    return selectedCommitOrder.map(findCommitBySha).filter(Boolean);
}

function truncateCommitMessage(message) {
    if (!message) {
        return "Unknown commit";
    }

    return message.length > 72 ? `${message.slice(0, 69)}...` : message;
}

function setCardSelectedState(checkbox) {
    const card = checkbox.closest(".commit-card");
    if (!card) {
        return;
    }

    if (checkbox.checked) {
        card.classList.remove("border-gray-200", "bg-white");
        card.classList.add("border-blue-500", "bg-blue-50");
    } else {
        card.classList.remove("border-blue-500", "bg-blue-50");
        card.classList.add("border-gray-200", "bg-white");
    }
}

function updateSelectionSummary() {
    const selectedCommits = getSelectedCommits();
    const firstSlot = document.getElementById("selectedCommitOne");
    const secondSlot = document.getElementById("selectedCommitTwo");
    const selectionHint = document.getElementById("selectionHint");
    const compareSelectedButton = document.getElementById("compareSelectedButton");

    if (firstSlot) {
        firstSlot.textContent = selectedCommits[0]
            ? `${truncateCommitMessage(selectedCommits[0].message)} (${selectedCommits[0].sha.slice(0, 7)})`
            : "None selected";
    }

    if (secondSlot) {
        secondSlot.textContent = selectedCommits[1]
            ? `${truncateCommitMessage(selectedCommits[1].message)} (${selectedCommits[1].sha.slice(0, 7)})`
            : "None selected";
    }

    if (selectionHint) {
        if (selectedCommits.length === 0) {
            selectionHint.textContent = "Choose two commits to enable comparison.";
        } else if (selectedCommits.length === 1) {
            selectionHint.textContent = "Pick one more commit to build your comparison pair.";
        } else {
            selectionHint.textContent = "Ready to compare. If you select another commit, the oldest choice will be replaced.";
        }
    }

    if (compareSelectedButton) {
        compareSelectedButton.disabled = selectedCommits.length !== 2;
    }
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

    // Sort by date so the older commit is sent first.
    selectedCommits.sort((a, b) => {
        return new Date(a.date) - new Date(b.date);
    });

    const commit1 = selectedCommits[0].sha; // older
    const commit2 = selectedCommits[1].sha; // newer

    sendCompare(repoUrl || document.getElementById("repoInput")?.value?.trim() || "", commit1, commit2);
}

async function sendCompare(repoUrl, commit1, commit2) {
    // Ask the server to compute or reuse a cached analysis, then redirect to the Jinja results page.
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

    if (!res.ok || data.status !== "ok" || !data.redirect_url) {
        alert(data.message || data.error || "Unable to run comparison.");
        return;
    }

    window.location.href = data.redirect_url;
}

document.addEventListener("change", (event) => {
    if (!event.target.classList.contains("commit-checkbox")) {
        return;
    }

    const changedCheckbox = event.target;
    const changedSha = changedCheckbox.value;

    if (changedCheckbox.checked) {
        selectedCommitOrder = selectedCommitOrder.filter((sha) => sha !== changedSha);
        selectedCommitOrder.push(changedSha);

        if (selectedCommitOrder.length > 2) {
            const removedSha = selectedCommitOrder.shift();
            const removedCheckbox = document.querySelector(`.commit-checkbox[value="${removedSha}"]`);
            if (removedCheckbox) {
                removedCheckbox.checked = false;
                setCardSelectedState(removedCheckbox);
            }
        }
    } else {
        selectedCommitOrder = selectedCommitOrder.filter((sha) => sha !== changedSha);
    }

    setCardSelectedState(changedCheckbox);
    updateSelectionSummary();
});

document.querySelectorAll(".commit-checkbox").forEach((checkbox) => {
    setCardSelectedState(checkbox);
});
updateSelectionSummary();
