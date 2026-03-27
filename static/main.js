// Read server-rendered data from the template in a way that keeps editor diagnostics happy.
const repoUrl = document.body?.dataset?.repoUrl || "";
const initialCommitsNode = document.getElementById("initial-commits-data");
const initialCommitMetaNode = document.getElementById("initial-commit-meta");

let commits = [];
if (initialCommitsNode) {
    try {
        const parsedCommits = JSON.parse(initialCommitsNode.textContent || "[]");
        commits = Array.isArray(parsedCommits) ? parsedCommits : [];
    } catch (error) {
        console.error("Failed to parse initial commits:", error);
    }
}

let commitMeta = {
    has_more: false
};
if (initialCommitMetaNode) {
    try {
        const parsedMeta = JSON.parse(initialCommitMetaNode.textContent || "{}");
        commitMeta = {
            has_more: Boolean(parsedMeta?.has_more)
        };
    } catch (error) {
        console.error("Failed to parse initial commit meta:", error);
    }
}

let selectedCommitOrder = [];
let currentCommitPage = 1;
let isLoadingMoreCommits = false;

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

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

function renderCommitCard(commit) {
    return `
        <label
          class="commit-card group mb-3 flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-blue-300 hover:shadow last:mb-0"
          data-sha="${escapeHtml(commit.sha)}"
        >
          <input
            type="checkbox"
            class="commit-checkbox mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            value="${escapeHtml(commit.sha)}"
            data-date="${escapeHtml(commit.date || "")}"
          >
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <p class="text-sm font-semibold text-gray-900 break-words">${escapeHtml(commit.message || "Unknown commit")}</p>
              <code class="rounded bg-gray-100 px-2 py-1 text-xs text-gray-600">${escapeHtml(commit.sha.slice(0, 7))}</code>
            </div>
            <div class="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <span class="rounded-full bg-gray-100 px-2.5 py-1">${escapeHtml(commit.author || "Unknown")}</span>
              <span class="rounded-full bg-gray-100 px-2.5 py-1">${escapeHtml(commit.date || "Unknown date")}</span>
            </div>
          </div>
        </label>
    `;
}

function appendCommits(newCommits) {
    const commitList = document.getElementById("commitList");

    if (!commitList || !Array.isArray(newCommits) || newCommits.length === 0) {
        return;
    }

    const existingShas = new Set(commits.map((commit) => commit.sha));
    const uniqueCommits = newCommits.filter((commit) => commit?.sha && !existingShas.has(commit.sha));

    if (uniqueCommits.length === 0) {
        return;
    }

    const emptyState = commitList.querySelector("p");
    if (emptyState && emptyState.textContent?.includes("No commits")) {
        emptyState.remove();
    }

    commitList.insertAdjacentHTML("beforeend", uniqueCommits.map(renderCommitCard).join(""));
    commits = commits.concat(uniqueCommits);

    document.querySelectorAll(".commit-checkbox").forEach((checkbox) => {
        checkbox.checked = selectedCommitOrder.includes(checkbox.value);
        setCardSelectedState(checkbox);
    });

    updateCommitCount();
}

function updateCommitCount() {
    const shownCommitCount = document.getElementById("shownCommitCount");
    if (shownCommitCount) {
        shownCommitCount.textContent = `${commits.length} shown`;
    }
}

function updateLoadMoreButton() {
    const loadMoreButton = document.getElementById("loadMoreCommitsButton");
    const loadMoreHint = document.getElementById("loadMoreHint");

    if (!loadMoreButton) {
        return;
    }

    if (isLoadingMoreCommits) {
        loadMoreButton.disabled = true;
        loadMoreButton.textContent = "Loading...";
        return;
    }

    loadMoreButton.disabled = !commitMeta.has_more;
    loadMoreButton.textContent = commitMeta.has_more ? "Load More" : "No More Commits";

    if (loadMoreHint) {
        loadMoreHint.textContent = commitMeta.has_more
            ? "Load older commits if the one you need is not in the first batch."
            : "You have reached the end of the available commit history.";
    }
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

async function loadMoreCommits() {
    if (!repoUrl || isLoadingMoreCommits || !commitMeta.has_more) {
        return;
    }

    isLoadingMoreCommits = true;
    updateLoadMoreButton();

    try {
        const res = await fetch("/commits", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                repo_url: repoUrl,
                page: currentCommitPage + 1,
                per_page: 20
            })
        });

        const data = await res.json();

        if (!res.ok || !Array.isArray(data.commits)) {
            alert(data.error || "Unable to load more commits.");
            return;
        }

        currentCommitPage += 1;
        commitMeta.has_more = Boolean(data.has_more);
        appendCommits(data.commits);
    } catch (error) {
        console.error("Failed to load more commits:", error);
        alert("Unable to load more commits.");
    } finally {
        isLoadingMoreCommits = false;
        updateLoadMoreButton();
    }
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
updateCommitCount();
updateLoadMoreButton();

const loadMoreCommitsButton = document.getElementById("loadMoreCommitsButton");
if (loadMoreCommitsButton) {
    loadMoreCommitsButton.addEventListener("click", loadMoreCommits);
}
