const state = {
    chunks: window.__ANALYSIS_DATA__.chunks,
    currentIndex: 0,
    cy: null
};

// ---------------- INIT ----------------
document.addEventListener("DOMContentLoaded", () => {
    bindSidebar();
    bindKeyboard();
    setupFullscreenModal();
    renderChunk(0);
});

// ---------------- SIDEBAR ----------------
function bindSidebar() {
    document.querySelectorAll(".chunk-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            selectChunk(Number(btn.dataset.index));
        });
    });
}

function selectChunk(index) {
    if (index < 0 || index >= state.chunks.length) return;

    state.currentIndex = index;
    highlightActiveChunk();
    renderChunk(index);
}

function highlightActiveChunk() {
    document.querySelectorAll(".chunk-btn").forEach((btn, i) => {
        btn.classList.toggle("bg-blue-50", i === state.currentIndex);
    });
}

// ---------------- KEYBOARD ----------------
function bindKeyboard() {
    document.addEventListener("keydown", (e) => {
        if (e.target.tagName === "INPUT") return;

        if (e.key === "j") selectChunk(state.currentIndex + 1);
        if (e.key === "k") selectChunk(state.currentIndex - 1);
    });
}

// ---------------- MAIN RENDER ----------------
function renderChunk(index) {
    const chunk = state.chunks[index];

    renderDiff(chunk);
    renderImpact(chunk);
    renderContext(chunk);
    renderGraph(chunk);
}

// ---------------- DIFF ----------------
function renderDiff(chunk) {
    const container = document.getElementById("diffContainer");

    container.innerHTML = `
        <div class="mb-4">
            <div class="text-sm text-gray-500">${chunk.file}</div>
            <div class="font-mono text-sm">${chunk.header}</div>
        </div>

        <div class="border rounded overflow-hidden">
            ${chunk.diff.map((line, i) => {
                let color = "text-gray-700";

                if (line.startsWith("+")) color = "text-green-600 bg-green-50";
                else if (line.startsWith("-")) color = "text-red-600 bg-red-50";

                return `
                    <div class="flex font-mono text-sm">
                        <div class="w-10 text-gray-400 text-right pr-2">${i + 1}</div>
                        <div class="flex-1 px-2 ${color} whitespace-pre">${escapeHtml(line)}</div>
                    </div>
                `;
            }).join("")}
        </div>
    `;
}

// ---------------- IMPACT ----------------
function renderImpact(chunk) {
    const container = document.getElementById("impactContainer");
    container.innerHTML = "";

    chunk.impact.forEach(impact => {
        const block = document.createElement("div");
        block.className = "mb-3";

        block.innerHTML = `
            <div class="text-xs text-gray-500">Root</div>
            <div class="font-mono text-xs mb-2">${impact.root}</div>
        `;

        impact.impact.downstream.forEach(pathObj => {
            const el = document.createElement("div");

            el.className = "path-item border rounded px-2 py-1 mb-1 cursor-pointer hover:bg-gray-100";
            el.textContent = pathObj.path.join(" → ");

            el.addEventListener("click", () => {
                highlightPath(pathObj.path);
            });

            el.addEventListener("mouseenter", () => {
                highlightPath(pathObj.path);
            });

            el.addEventListener("mouseenter", () => {
                highlightPath(pathObj.path);

                const last = pathObj.path[pathObj.path.length - 1];
                const node = state.cy.getElementById(last);

                if (node) node.emit('tap'); // 🔥 triggers inspector
            });

            block.appendChild(el);
        });

        container.appendChild(block);
    });
}

// ---------------- CONTEXT ----------------
function renderContext(chunk) {
    const container = document.getElementById("contextContainer");
    const ctx = chunk.code_context;

    if (!ctx || Object.keys(ctx).length === 0) {
        container.innerHTML = "<div class='text-gray-400'>No context</div>";
        return;
    }

    container.innerHTML = Object.entries(ctx).map(([fn, code]) => `
        <div class="border rounded p-2 bg-gray-50">
            <div class="font-bold text-xs mb-1">${fn}</div>
            <pre class="overflow-auto">${escapeHtml(code)}</pre>
        </div>
    `).join("");
}

// ---------------- GRAPH ----------------
function renderGraph(chunk, containerId = "graphContainer") {
    const container = document.getElementById(containerId);

    if (!container) return;

    container.innerHTML = "";

    const graphData = buildGraphData(chunk);

    const cyInstance = cytoscape({
        container,
        elements: [...graphData.nodes, ...graphData.edges],

        minZoom: 0.3,
        maxZoom: 2,
        wheelSensitivity: 0.2,

        style: [
            {
                selector: 'node',
                style: {
                    'label': 'data(label)',
                    'background-color': '#3974f2',
                    'color': '#303030',
                    'text-valign': 'center',
                    'text-halign': 'center',
                    'font-size': 16,
                    'width': 50,
                    'height': 50,
                    'text-wrap':'wrap',
                    'text-max-width': 80,
                }
            },
            {
                selector: 'edge',
                style: {
                    'width': 2,
                    'line-color': '#94a3b8',
                    'target-arrow-shape': 'triangle',
                    'target-arrow-color': '#94a3b8',
                    'curve-style': 'bezier'
                }
            },
            {
                selector: '.highlighted',
                style: {
                    'background-color': '#ef4444',
                    'line-color': '#ef4444',
                    'target-arrow-color': '#ef4444',
                    // 'width': 4
                }
            },
            {
                selector: '.node-selected',
                style: {
                    'border-width': 2,
                    'border-color': '#f76060', // orange highlight
                    'background-color': '#5e8df2'
                }
            }
        ],

        layout: {
            name: 'breadthfirst',
            directed: true,
            spacingFactor: 1.8,
            padding: 30,
            animate: false
        }
    });

    // ✅ Only assign main graph to global state
    if (containerId === "graphContainer") {
        state.cy = cyInstance;
        attachNodeInspector(cyInstance);
    }

    // ✅ Fit AFTER render (important)
    setTimeout(() => {
        cyInstance.fit();
        cyInstance.center();
    }, 50);

    return cyInstance; // ← future-proof (useful later)
}

// ---------------- GRAPH HELPERS ----------------
function buildGraphData(chunk) {
    const nodes = new Map();
    const edges = [];

    // 🔥 NEW: collect tags per node
    const nodeTagsMap = new Map();

    chunk.impact.forEach(impact => {
        const allPaths = [
            ...(impact.impact.downstream || []),
            ...(impact.impact.upstream || [])
        ];

        allPaths.forEach(d => {
            const path = d.path;
            const tags = d.tags || [];

            for (let i = 0; i < path.length; i++) {
                const nodeId = path[i];

                // -------- NODE --------
                if (!nodes.has(nodeId)) {
                    nodes.set(nodeId, {
                        data: {
                            id: nodeId,
                            label: nodeId.split("::").pop(),
                            full: nodeId
                        }
                    });
                }

                // -------- TAG AGGREGATION --------
                if (!nodeTagsMap.has(nodeId)) {
                    nodeTagsMap.set(nodeId, new Set());
                }

                tags.forEach(tag => {
                    nodeTagsMap.get(nodeId).add(tag);
                });

                // -------- EDGE --------
                if (i < path.length - 1) {
                    edges.push({
                        data: {
                            id: `${path[i]}->${path[i + 1]}`,
                            source: path[i],
                            target: path[i + 1]
                        }
                    });
                }
            }
        });
    });

    // 🔥 attach aggregated tags to nodes
    nodes.forEach((node, nodeId) => {
        node.data.tags = Array.from(nodeTagsMap.get(nodeId) || []);
    });

    return {
        nodes: Array.from(nodes.values()),
        edges
    };
}

function highlightPath(path) {
    if (!state.cy) return;

    // 🔥 reset everything
    state.cy.elements().removeClass("highlighted");
    state.cy.nodes().removeClass("node-selected");

    for (let i = 0; i < path.length; i++) {
        const node = state.cy.getElementById(path[i]);

        if (node) {
            node.addClass("highlighted");

            // 🔥 ALSO mark last node as selected (focus)
            if (i === path.length - 1) {
                node.addClass("node-selected");
            }
        }

        if (i < path.length - 1) {
            const edge = state.cy.getElementById(`${path[i]}->${path[i+1]}`);
            if (edge) edge.addClass("highlighted");
        }
    }
}

// ---------------- NODE INSPECTOR ----------------
function attachNodeInspector(cy) {
    const inspector = document.getElementById("nodeInspector");

    cy.on('tap', 'node', (evt) => {
        const node = evt.target;

        // 🔥 CLEAR previous selection
        cy.nodes().removeClass('node-selected');

        // 🔥 SELECT current node
        node.addClass('node-selected');

        const tags = node.data('tags') || [];

        inspector.innerHTML = `
            <div class="text-xs text-gray-500 mb-1">Node</div>
            <div class="font-mono text-sm break-all mb-2">
                ${node.data('full')}
            </div>

            <div class="text-xs text-gray-500 mb-1">Impact Signals</div>

            ${
                tags.length === 0
                ? `<div class="text-gray-400">No signals detected</div>`
                : `
                    <div class="flex flex-wrap gap-1">
                        ${tags.map(tag => `
                            <span class="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
                                ${tag}
                            </span>
                        `).join("")}
                    </div>
                `
            }
        `;
    });
}

// ---------------- FULLSCREEN GRAPH ----------------
function setupFullscreenModal() {
    const modal = document.getElementById("graphModal");
    const openBtn = document.getElementById("expandGraph");
    const closeBtn = document.getElementById("closeGraph");

    openBtn?.addEventListener("click", () => {
        modal.classList.remove("hidden");

        setTimeout(() => {
            const cyModal = renderGraph(
                state.chunks[state.currentIndex],
                "graphModalContainer"
            );

            // Optional: better zoom for modal
            setTimeout(() => {
                cyModal.zoom(1);
                cyModal.center();
            }, 50);

        }, 50);
    });

    closeBtn?.addEventListener("click", () => {
        modal.classList.add("hidden");
    });
}

// ---------------- UTIL ----------------
function escapeHtml(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}
