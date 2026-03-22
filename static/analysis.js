async function runAnalysis() {
    const repo = document.getElementById("repo").value;
    const c1 = document.getElementById("c1").value;
    const c2 = document.getElementById("c2").value;

    const loading = document.getElementById("loading");
    const results = document.getElementById("results");

    loading.classList.remove("hidden");
    results.classList.add("hidden");

    const res = await fetch("/analyze", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            repo_url: repo,
            commit1: c1,
            commit2: c2
        })
    });

    const data = await res.json();

    loading.classList.add("hidden");
    results.classList.remove("hidden");

    renderSummary(data.data.report.summary);
    renderDetails(data.data.report.details);
}

function renderSummary(summary) {
    const container = document.getElementById("summary");
    container.innerHTML = "";

    summary.forEach(item => {
        const div = document.createElement("div");

        div.className = "bg-gray-800 p-3 rounded flex justify-between";

        div.innerHTML = `
            <span>${item.node}</span>
            <span class="text-red-400">Severity: ${item.severity}</span>
        `;

        container.appendChild(div);
    });
}

function renderDetails(details) {
    const container = document.getElementById("details");
    container.innerHTML = "";

    details.forEach(d => {
        const block = document.createElement("div");
        block.className = "bg-gray-900 p-4 rounded";

        let html = `<div class="font-bold mb-2">${d.impact_root}</div>`;

        d.downstream.forEach(path => {
            html += `
                <div class="text-sm text-gray-300 mb-2">
                    ${path.path.join(" → ")}
                </div>
            `;

            if (path.tags.length > 0) {
                html += `
                    <div class="text-xs text-yellow-400 mb-2">
                        ${path.tags.join(", ")}
                    </div>
                `;
            }
        });

        block.innerHTML = html;
        container.appendChild(block);
    });
}