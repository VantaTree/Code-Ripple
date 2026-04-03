const state = {
    chunks: window.__ANALYSIS_DATA__.chunks,
    currentIndex: 0,
    cy: null,
    activeTagFilters: [],
    visibleChunkIndices: []
};

// ---------------- INIT ----------------
document.addEventListener("DOMContentLoaded", () => {
    state.visibleChunkIndices = state.chunks.map((_, index) => index);
    bindSidebar();
    bindKeyboard();
    bindGlobalTagFilters();
    renderGlobalTagFilters();
    applyChunkFilter();
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
    if (!state.visibleChunkIndices.includes(index)) return;

    state.currentIndex = index;
    highlightActiveChunk();
    renderChunk(index);
}

function highlightActiveChunk() {
    document.querySelectorAll(".chunk-btn").forEach((btn, i) => {
        btn.classList.toggle("bg-blue-50", i === state.currentIndex);
        btn.classList.toggle("ring-1", i === state.currentIndex);
        btn.classList.toggle("ring-blue-200", i === state.currentIndex);
    });
}

// ---------------- KEYBOARD ----------------
function bindKeyboard() {
    document.addEventListener("keydown", (e) => {
        if (e.target.tagName === "INPUT") return;

        if (e.key === "j") moveSelection(1);
        if (e.key === "k") moveSelection(-1);
    });
}

function moveSelection(direction) {
    const currentVisibleIndex = state.visibleChunkIndices.indexOf(state.currentIndex);
    if (currentVisibleIndex === -1) return;

    const nextVisibleIndex = currentVisibleIndex + direction;
    if (nextVisibleIndex < 0 || nextVisibleIndex >= state.visibleChunkIndices.length) {
        return;
    }

    selectChunk(state.visibleChunkIndices[nextVisibleIndex]);
}

// ---------------- MAIN RENDER ----------------
function renderChunk(index) {
    const chunk = state.chunks[index];
    if (!chunk) return;

    renderDiff(chunk);
    renderImpact(chunk);
    renderContext(chunk);
    renderGraph(chunk);
}

function bindGlobalTagFilters() {
    document.getElementById("tagFilterContainer")?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-tag-filter]");
        if (!button) return;

        toggleTagFilter(button.dataset.tagFilter);
    });

    document.getElementById("clearTagFilter")?.addEventListener("click", () => {
        state.activeTagFilters = [];
        renderGlobalTagFilters();
        applyChunkFilter();
    });
}

function getChunkTags(chunk) {
    const tags = new Set();

    chunk.impact.forEach((impact) => {
        ["downstream", "upstream"].forEach((direction) => {
            (impact.impact[direction] || []).forEach((pathObj) => {
                (pathObj.tags || []).forEach((tag) => tags.add(tag));
            });
        });
    });

    return Array.from(tags).sort();
}

function getAllTags() {
    const allTags = new Set();

    state.chunks.forEach((chunk) => {
        getChunkTags(chunk).forEach((tag) => allTags.add(tag));
    });

    return Array.from(allTags).sort();
}

function renderGlobalTagFilters() {
    const container = document.getElementById("tagFilterContainer");
    const status = document.getElementById("tagFilterStatus");
    if (!container) return;

    const allTags = getAllTags();

    if (allTags.length === 0) {
        container.innerHTML = "<div class='text-xs text-gray-400'>No tags available in this analysis.</div>";
        if (status) {
            status.textContent = "No ML or semantic tags were detected for the current comparison.";
        }
        return;
    }

    container.innerHTML = allTags.map((tag) => {
        const selected = state.activeTagFilters.includes(tag);
        const classes = selected
            ? "border-blue-600 bg-blue-600 text-white shadow-sm"
            : "border-gray-300 bg-white text-gray-700 hover:border-blue-300 hover:text-blue-700";

        return `
            <button
                type="button"
                data-tag-filter="${escapeHtml(tag)}"
                class="rounded-full border px-3 py-1.5 text-xs font-medium transition ${classes}"
            >
                ${escapeHtml(tag)}
            </button>
        `;
    }).join("");

    if (status) {
        status.textContent = state.activeTagFilters.length === 0
            ? `Showing all ${state.chunks.length} changes. Select tags to narrow the full analysis.`
            : `Filtering ${state.chunks.length} changes by: ${state.activeTagFilters.join(", ")}`;
    }
}

function toggleTagFilter(tag) {
    if (!tag) return;

    if (state.activeTagFilters.includes(tag)) {
        state.activeTagFilters = state.activeTagFilters.filter((item) => item !== tag);
    } else {
        state.activeTagFilters = [...state.activeTagFilters, tag];
    }

    renderGlobalTagFilters();
    applyChunkFilter();
}

function chunkMatchesActiveFilters(chunk) {
    if (state.activeTagFilters.length === 0) {
        return true;
    }

    const chunkTags = new Set(getChunkTags(chunk));
    return state.activeTagFilters.every((tag) => chunkTags.has(tag));
}

function applyChunkFilter() {
    const buttons = document.querySelectorAll(".chunk-btn");
    state.visibleChunkIndices = [];

    buttons.forEach((button, index) => {
        const visible = chunkMatchesActiveFilters(state.chunks[index]);
        button.classList.toggle("hidden", !visible);

        if (visible) {
            state.visibleChunkIndices.push(index);
        }
    });

    const status = document.getElementById("tagFilterStatus");
    if (status && state.activeTagFilters.length > 0) {
        status.textContent = state.visibleChunkIndices.length === 0
            ? `No changes match: ${state.activeTagFilters.join(", ")}`
            : `Showing ${state.visibleChunkIndices.length} matching change${state.visibleChunkIndices.length === 1 ? "" : "s"} for: ${state.activeTagFilters.join(", ")}`;
    }

    if (state.visibleChunkIndices.length === 0) {
        state.currentIndex = 0;
        renderEmptyFilteredState();
        highlightActiveChunk();
        return;
    }

    if (!state.visibleChunkIndices.includes(state.currentIndex)) {
        state.currentIndex = state.visibleChunkIndices[0];
    }

    highlightActiveChunk();
    renderChunk(state.currentIndex);
}

function renderEmptyFilteredState() {
    document.getElementById("diffContainer").innerHTML = "<div class='text-sm text-gray-400'>No changes match the selected tags.</div>";
    document.getElementById("impactContainer").innerHTML = "<div class='text-xs text-gray-400'>No impact paths available for the current filter.</div>";
    document.getElementById("contextContainer").innerHTML = "<div class='text-gray-400'>No context</div>";

    const graphContainer = document.getElementById("graphContainer");
    if (graphContainer) {
        graphContainer.innerHTML = "<div class='flex h-full items-center justify-center text-sm text-gray-400'>No graph nodes match the selected tags.</div>";
    }

    const inspector = document.getElementById("nodeInspector");
    if (inspector) {
        inspector.innerHTML = "Select a matching change to inspect graph nodes.";
    }
}

function pathMatchesActiveFilters(pathObj) {
    if (state.activeTagFilters.length === 0) {
        return true;
    }

    const tags = pathObj.tags || [];
    return state.activeTagFilters.every((tag) => tags.includes(tag));
}

// ---------------- DIFF ----------------
function renderDiff(chunk) {
    const container = document.getElementById("diffContainer");

    container.innerHTML = `
        <div class="mb-4">
            <div class="text-sm text-gray-500">${escapeHtml(chunk.file)}</div>
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
    let visiblePathCount = 0;

    chunk.impact.forEach(impact => {
        const matchingDownstream = (impact.impact.downstream || []).filter(pathMatchesActiveFilters);
        const matchingUpstream = (impact.impact.upstream || []).filter(pathMatchesActiveFilters);

        if (matchingDownstream.length === 0 && matchingUpstream.length === 0) {
            return;
        }

        const block = document.createElement("div");
        block.className = "mb-3";

        block.innerHTML = `
            <div class="text-xs text-gray-500">Root</div>
            <div class="font-mono text-xs mb-2">${impact.root}</div>
        `;

        [...matchingDownstream, ...matchingUpstream].forEach(pathObj => {
            const el = document.createElement("div");
            const tags = pathObj.tags || [];

            el.className = "path-item border rounded px-2 py-2 mb-1 cursor-pointer hover:bg-gray-100";
            el.innerHTML = `
                <div class="font-mono text-[11px] break-all">${escapeHtml(pathObj.path.join(" → "))}</div>
                <div class="mt-2 flex flex-wrap gap-1">
                    ${
                        tags.length === 0
                        ? "<span class='text-[11px] text-gray-400'>No tags</span>"
                        : tags.map((tag) => `
                            <span class="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">${escapeHtml(tag)}</span>
                        `).join("")
                    }
                </div>
            `;

            el.addEventListener("click", () => {
                highlightPath(impact.root, pathObj.path);
            });

            el.addEventListener("mouseenter", () => {
                highlightPath(impact.root, pathObj.path);
                const inspectNodeId = pathObj.path[pathObj.path.length - 1];
                const inspectRelativeLevel = pathObj.path.length - 1 - getPathRootIndex(impact.root, pathObj.path);
                const node = getDisplayNodeByCanonical(state.cy, impact.root, inspectNodeId, inspectRelativeLevel);

                if (node) node.emit('tap');
            });

            block.appendChild(el);
            visiblePathCount += 1;
        });

        container.appendChild(block);
    });

    if (visiblePathCount === 0) {
        container.innerHTML = "<div class='text-xs text-gray-400'>No impact paths match the selected tags.</div>";
    }
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
    const layoutOptions = getGraphLayout(graphData);

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
                    'color': '#1f2937',
                    'text-valign': 'center',
                    'text-halign': 'center',
                    'font-size': 14,
                    'font-weight': 600,
                    'width': 60,
                    'height': 60,
                    'text-wrap': 'wrap',
                    'text-max-width': 120,
                    'border-width': 2,
                    'border-color': '#dbe4ff'
                }
            },
            {
                selector: 'edge',
                style: {
                    'width': 2.5,
                    'line-color': '#94a3b8',
                    'target-arrow-shape': 'triangle',
                    'target-arrow-color': '#94a3b8',
                    'curve-style': 'bezier',
                    'arrow-scale': 0.85,
                    'opacity': 0.85
                }
            },
            {
                selector: '.root-node',
                style: {
                    'background-color': '#0f172a',
                    'color': '#ffffff',
                    'width': 74,
                    'height': 74,
                    'font-size': 15,
                    'border-color': '#cbd5e1',
                    'border-width': 3
                }
            },
            {
                selector: '.upstream-node',
                style: {
                    'background-color': '#e0f2fe',
                    'color': '#0f172a',
                    'border-color': '#7dd3fc'
                }
            },
            {
                selector: '.downstream-node',
                style: {
                    'background-color': '#dbeafe',
                    'color': '#0f172a',
                    'border-color': '#93c5fd'
                }
            },
            {
                selector: '.highlighted',
                style: {
                    'background-color': '#ef4444',
                    'line-color': '#ef4444',
                    'target-arrow-color': '#ef4444',
                    'opacity': 1
                }
            },
            {
                selector: '.node-selected',
                style: {
                    'border-width': 2,
                    'border-color': '#f76060',
                    'background-color': '#5e8df2'
                }
            },
            {
                selector: '.tag-filter-match',
                style: {
                    'border-width': 5,
                    'border-color': '#0f172a',
                    'underlay-color': '#fbbf24',
                    'underlay-opacity': 0.95,
                    'underlay-padding': 14,
                    'underlay-shape': 'ellipse',
                    'z-compound-depth': 'top'
                }
            }
        ],

        layout: layoutOptions
    });

    if (containerId === "graphContainer") {
        state.cy = cyInstance;
        attachNodeInspector(cyInstance);
    }

    applyTagRingHighlights(cyInstance);

    setTimeout(() => {
        cyInstance.fit();
        cyInstance.center();
    }, 50);

    return cyInstance;
}

// ---------------- GRAPH HELPERS ----------------
function buildGraphData(chunk) {
    const nodes = new Map();
    const edges = new Map();
    const rootOrderMap = new Map();

    chunk.impact.forEach((impact, rootOrder) => {
        rootOrderMap.set(impact.root, rootOrder);

        const allPaths = [
            ...(impact.impact.downstream || []).map((entry) => ({ ...entry, direction: "downstream" })),
            ...(impact.impact.upstream || []).map((entry) => ({ ...entry, direction: "upstream" }))
        ];

        allPaths.forEach(d => {
            const path = d.path || [];
            const tags = d.tags || [];
            const rootIndex = d.direction === "upstream" ? path.length - 1 : 0;

            for (let i = 0; i < path.length; i++) {
                const canonicalId = path[i];
                const relativeLevel = i - rootIndex;
                const nodeId = getDisplayNodeId(impact.root, canonicalId, relativeLevel);

                if (!nodes.has(nodeId)) {
                    nodes.set(nodeId, {
                        data: {
                            id: nodeId,
                            canonicalId,
                            rootId: impact.root,
                            rootOrder,
                            relativeLevel,
                            label: canonicalId.split("::").pop(),
                            full: canonicalId
                        }
                    });
                }

                const node = nodes.get(nodeId);
                const nodeTags = new Set(node.data.tags || []);
                tags.forEach((tag) => nodeTags.add(tag));
                node.data.tags = Array.from(nodeTags);

                if (!node.data.meta) {
                    node.data.meta = {
                        isRoot: false
                    };
                }

                const meta = node.data.meta;
                if (relativeLevel === 0 && canonicalId === impact.root) meta.isRoot = true;

                if (i < path.length - 1) {
                    const nextRelativeLevel = i + 1 - rootIndex;
                    const sourceDisplayId = getDisplayNodeId(impact.root, path[i], relativeLevel);
                    const targetDisplayId = getDisplayNodeId(impact.root, path[i + 1], nextRelativeLevel);
                    const edgeId = getDisplayEdgeId(impact.root, path[i], relativeLevel, path[i + 1], nextRelativeLevel);

                    if (!edges.has(edgeId)) {
                        edges.set(edgeId, {
                            data: {
                                id: edgeId,
                                source: sourceDisplayId,
                                target: targetDisplayId,
                                rootId: impact.root
                            }
                        });
                    }
                }
            }
        });
    });

    nodes.forEach((node) => {
        const meta = node.data.meta || { isRoot: false };
        const preferredLevel = Number(node.data.relativeLevel || 0);

        node.data.level = preferredLevel;
        node.data.orderGroup = meta.isRoot ? "root" : preferredLevel < 0 ? "upstream" : "downstream";
        node.classes = [
            meta.isRoot ? "root-node" : "",
            preferredLevel < 0 ? "upstream-node" : "",
            preferredLevel > 0 ? "downstream-node" : ""
        ].filter(Boolean).join(" ");
        delete node.data.meta;
    });

    return {
        nodes: Array.from(nodes.values()),
        edges: Array.from(edges.values()),
        rootOrderMap
    };
}

function getGraphLayout(graphData) {
    if (graphData.nodes.length === 0) {
        return {
            name: "grid",
            padding: 30,
            animate: false
        };
    }

    const rootNodes = new Map();
    graphData.nodes.forEach((node) => {
        const rootId = node.data.rootId;
        if (!rootNodes.has(rootId)) {
            rootNodes.set(rootId, []);
        }
        rootNodes.get(rootId).push(node);
    });

    const levelSpacing = 170;
    const columnSpacing = 190;
    const rootPadding = 220;
    let currentRootCenterX = 0;

    Array.from(rootNodes.entries())
        .sort((a, b) => (graphData.rootOrderMap.get(a[0]) || 0) - (graphData.rootOrderMap.get(b[0]) || 0))
        .forEach(([rootId, nodes], rootIndex) => {
            const lanes = buildRootLanes(nodes);
            const laneOrders = minimizeRootCrossings(rootId, lanes, graphData.edges);
            const rootHalfWidth = getRootHalfWidth(laneOrders, columnSpacing);

            if (rootIndex > 0) {
                currentRootCenterX += rootHalfWidth + rootPadding;
            }

            laneOrders.forEach((lane, level) => {
                const offset = (lane.length - 1) / 2;
                lane.forEach((node, index) => {
                    node.position = {
                        x: currentRootCenterX + (index - offset) * columnSpacing,
                        y: level * levelSpacing
                    };
                });
            });

            currentRootCenterX += rootHalfWidth + rootPadding;
        });

    return {
        name: "preset",
        padding: 60,
        animate: false,
        fit: true
    };
}

function buildRootLanes(nodes) {
    const lanes = new Map();

    nodes.forEach((node) => {
        const level = Number(node.data.level || 0);
        if (!lanes.has(level)) {
            lanes.set(level, []);
        }
        lanes.get(level).push(node);
    });

    lanes.forEach((lane) => {
        lane.sort(compareLaneNodes);
    });

    return lanes;
}

function minimizeRootCrossings(rootId, lanes, edges) {
    const laneOrders = new Map();
    const levels = Array.from(lanes.keys()).sort((a, b) => a - b);

    levels.forEach((level) => {
        laneOrders.set(level, [...(lanes.get(level) || [])]);
    });

    const adjacency = buildRootAdjacency(rootId, edges);

    for (let pass = 0; pass < 4; pass++) {
        for (let i = 1; i < levels.length; i++) {
            const level = levels[i];
            const previousLevel = levels[i - 1];
            reorderLaneByNeighbors(
                laneOrders,
                level,
                previousLevel,
                adjacency.incoming
            );
        }

        for (let i = levels.length - 2; i >= 0; i--) {
            const level = levels[i];
            const nextLevel = levels[i + 1];
            reorderLaneByNeighbors(
                laneOrders,
                level,
                nextLevel,
                adjacency.outgoing
            );
        }
    }

    return laneOrders;
}

function buildRootAdjacency(rootId, edges) {
    const incoming = new Map();
    const outgoing = new Map();

    edges.forEach((edge) => {
        if (edge.data.rootId !== rootId) {
            return;
        }

        if (!outgoing.has(edge.data.source)) {
            outgoing.set(edge.data.source, []);
        }
        outgoing.get(edge.data.source).push(edge.data.target);

        if (!incoming.has(edge.data.target)) {
            incoming.set(edge.data.target, []);
        }
        incoming.get(edge.data.target).push(edge.data.source);
    });

    return { incoming, outgoing };
}

function reorderLaneByNeighbors(laneOrders, level, anchorLevel, adjacencyMap) {
    const lane = laneOrders.get(level);
    const anchorLane = laneOrders.get(anchorLevel);

    if (!lane || !anchorLane || lane.length <= 1) {
        return;
    }

    const anchorIndex = new Map();
    anchorLane.forEach((node, index) => {
        anchorIndex.set(node.data.id, index);
    });

    lane.sort((a, b) => {
        const aScore = computeNodeBarycenter(a, adjacencyMap, anchorIndex);
        const bScore = computeNodeBarycenter(b, adjacencyMap, anchorIndex);

        if (aScore !== bScore) {
            return aScore - bScore;
        }

        return compareLaneNodes(a, b);
    });
}

function computeNodeBarycenter(node, adjacencyMap, anchorIndex) {
    const neighbors = adjacencyMap.get(node.data.id) || [];

    if (neighbors.length === 0) {
        return Number.MAX_SAFE_INTEGER;
    }

    let sum = 0;
    let count = 0;

    neighbors.forEach((neighborId) => {
        if (!anchorIndex.has(neighborId)) {
            return;
        }
        sum += anchorIndex.get(neighborId);
        count += 1;
    });

    if (count === 0) {
        return Number.MAX_SAFE_INTEGER;
    }

    return sum / count;
}

function compareLaneNodes(a, b) {
    if (a.data.orderGroup !== b.data.orderGroup) {
        return a.data.orderGroup.localeCompare(b.data.orderGroup);
    }

    return a.data.full.localeCompare(b.data.full);
}

function getRootHalfWidth(laneOrders, columnSpacing) {
    let maxLaneSize = 1;

    laneOrders.forEach((lane) => {
        maxLaneSize = Math.max(maxLaneSize, lane.length);
    });

    return ((maxLaneSize - 1) * columnSpacing) / 2;
}

function getDisplayNodeId(rootId, canonicalId, relativeLevel) {
    return `${rootId}::DISPLAY::L${relativeLevel}::${canonicalId}`;
}

function getDisplayEdgeId(rootId, sourceId, sourceLevel, targetId, targetLevel) {
    return `${rootId}::EDGE::L${sourceLevel}::${sourceId}->L${targetLevel}::${targetId}`;
}

function getPathRootIndex(rootId, path) {
    const index = path.indexOf(rootId);
    return index === -1 ? 0 : index;
}

function getDisplayNodeByCanonical(cy, rootId, canonicalId, relativeLevel) {
    if (!cy) {
        return null;
    }

    return cy.getElementById(getDisplayNodeId(rootId, canonicalId, relativeLevel));
}

function getDisplayEdgeByCanonical(cy, rootId, sourceId, sourceLevel, targetId, targetLevel) {
    if (!cy) {
        return null;
    }

    return cy.getElementById(getDisplayEdgeId(rootId, sourceId, sourceLevel, targetId, targetLevel));
}

function nodeMatchesActiveFilters(node) {
    if (state.activeTagFilters.length === 0) {
        return false;
    }

    const tags = node.data("tags") || [];
    return state.activeTagFilters.every((tag) => tags.includes(tag));
}

function applyTagRingHighlights(cyInstance) {
    if (!cyInstance) return;

    cyInstance.nodes().removeClass("tag-filter-match");

    if (state.activeTagFilters.length === 0) {
        return;
    }

    cyInstance.nodes().forEach((node) => {
        if (nodeMatchesActiveFilters(node)) {
            node.addClass("tag-filter-match");
        }
    });
}

function highlightPath(rootId, path) {
    if (!state.cy) return;

    state.cy.elements().removeClass("highlighted");
    state.cy.nodes().removeClass("node-selected");
    applyTagRingHighlights(state.cy);
    const rootIndex = getPathRootIndex(rootId, path);

    for (let i = 0; i < path.length; i++) {
        const relativeLevel = i - rootIndex;
        const node = getDisplayNodeByCanonical(state.cy, rootId, path[i], relativeLevel);

        if (node) {
            node.addClass("highlighted");

            if (i === path.length - 1) {
                node.addClass("node-selected");
            }
        }

        if (i < path.length - 1) {
            const nextRelativeLevel = i + 1 - rootIndex;
            const edge = getDisplayEdgeByCanonical(
                state.cy,
                rootId,
                path[i],
                relativeLevel,
                path[i + 1],
                nextRelativeLevel
            );
            if (edge) edge.addClass("highlighted");
        }
    }
}

// ---------------- NODE INSPECTOR ----------------
function attachNodeInspector(cy) {
    const inspector = document.getElementById("nodeInspector");

    cy.on('tap', 'node', (evt) => {
        const node = evt.target;

        cy.nodes().removeClass('node-selected');
        applyTagRingHighlights(cy);
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
