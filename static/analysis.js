const sidebar = document.getElementById("impactedPathsSidebar");
const sidebarHeader = document.getElementById("sidebarHeader");
const sidebarContent = document.getElementById("sidebarContent");
const sidebarHeaderText = document.getElementById("sidebarHeaderText");
const sidebarCollapseButton = document.getElementById("sidebarCollapseButton");
const analysisWorkspace = document.getElementById("analysisWorkspace");
const pathOptions = Array.from(document.querySelectorAll(".path-option"));
const detailPanels = Array.from(document.querySelectorAll(".path-detail-panel"));
const detailsDataNode = document.getElementById("analysis-details-data");
const visualizationShells = Array.from(document.querySelectorAll("[data-visualization-shell]"));
const SVG_NS = "http://www.w3.org/2000/svg";
const desktopSidebarQuery = window.matchMedia("(min-width: 1280px)");
const graphStateByPanel = new WeakMap();
const inspectorVisibilityByShell = new WeakMap();
let sidebarCollapsed = false;
let analysisDetails = [];
let pinnedNodeId = null;

if (detailsDataNode) {
    try {
        const parsed = JSON.parse(detailsDataNode.textContent || "[]");
        analysisDetails = Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.error("Failed to parse analysis details:", error);
    }
}

function parseNodeLabel(rawLabel) {
    const parts = rawLabel.split(":");
    const file = parts[0]?.trim() || "Unknown file";
    const cleanedSegments = parts
        .slice(1)
        .map((segment) => segment.trim())
        .filter(Boolean);

    const joined = cleanedSegments.join(" ");
    const symbol = joined || rawLabel;
    const isGlobal = symbol.toUpperCase().includes("GLOBAL");
    const isClass = symbol.toUpperCase().includes("CLASS");

    return {
        raw: rawLabel,
        file,
        symbol,
        type: isGlobal ? "global" : isClass ? "class" : "function"
    };
}

function buildGraphModel(detail) {
    const nodesById = new Map();
    const edgeMap = new Map();

    const allPaths = [{ path: [detail.impact_root], tags: [] }, ...(detail.downstream || [])];

    allPaths.forEach((entry, pathIndex) => {
        const pathNodes = entry.path || [];

        pathNodes.forEach((nodeId, depth) => {
            if (!nodesById.has(nodeId)) {
                nodesById.set(nodeId, {
                    id: nodeId,
                    ...parseNodeLabel(nodeId),
                    depth,
                    occurrences: 0,
                    pathRefs: []
                });
            }

            const node = nodesById.get(nodeId);
            node.depth = Math.min(node.depth, depth);
            node.occurrences += 1;
            node.pathRefs.push(pathIndex);
        });

        for (let index = 0; index < pathNodes.length - 1; index += 1) {
            const source = pathNodes[index];
            const target = pathNodes[index + 1];
            const edgeId = `${source}=>${target}`;

            if (!edgeMap.has(edgeId)) {
                edgeMap.set(edgeId, {
                    id: edgeId,
                    source,
                    target,
                    tags: new Set(),
                    pathRefs: new Set()
                });
            }

            const edge = edgeMap.get(edgeId);
            (entry.tags || []).forEach((tag) => edge.tags.add(tag));
            edge.pathRefs.add(pathIndex);
        }
    });

    const depthBuckets = new Map();
    Array.from(nodesById.values()).forEach((node) => {
        if (!depthBuckets.has(node.depth)) {
            depthBuckets.set(node.depth, []);
        }
        depthBuckets.get(node.depth).push(node);
    });

    depthBuckets.forEach((bucket) => {
        bucket.sort((a, b) => a.id.localeCompare(b.id));
        bucket.forEach((node, rowIndex) => {
            node.row = rowIndex;
        });
    });

    const nodes = Array.from(nodesById.values()).map((node) => {
        const symbolLines = wrapNodeLabel(node.symbol, 18);
        const lineCount = Math.max(symbolLines.length, 1);
        const nodeHeight = 34 + (lineCount * 13) + 14;

        return {
            ...node,
            symbolLines,
            nodeHeight,
            x: 90 + (node.depth * 230),
            y: 70 + (node.row * 130)
        };
    });

    const nodeLookup = new Map(nodes.map((node) => [node.id, node]));
    const edges = Array.from(edgeMap.values()).map((edge) => ({
        ...edge,
        tags: Array.from(edge.tags),
        pathRefs: Array.from(edge.pathRefs),
        sourceNode: nodeLookup.get(edge.source),
        targetNode: nodeLookup.get(edge.target)
    }));

    return { nodes, edges };
}

function getNodeColor(type) {
    if (type === "global") {
        return "#f59e0b";
    }
    if (type === "class") {
        return "#8b5cf6";
    }
    return "#2563eb";
}

function wrapNodeLabel(text, maxCharsPerLine = 18) {
    const value = (text || "").trim();
    if (!value) {
        return [""];
    }

    const words = value.split(/\s+/);
    const lines = [];
    let currentLine = "";

    words.forEach((word) => {
        if (word.length > maxCharsPerLine) {
            if (currentLine) {
                lines.push(currentLine);
                currentLine = "";
            }

            for (let index = 0; index < word.length; index += maxCharsPerLine) {
                lines.push(word.slice(index, index + maxCharsPerLine));
            }
            return;
        }

        const nextLine = currentLine ? `${currentLine} ${word}` : word;
        if (nextLine.length <= maxCharsPerLine) {
            currentLine = nextLine;
        } else {
            lines.push(currentLine);
            currentLine = word;
        }
    });

    if (currentLine) {
        lines.push(currentLine);
    }

    return lines.length ? lines : [value];
}

function updateFullscreenButtonState(shell, isFullscreen) {
    if (!shell) {
        return;
    }

    const button = shell.querySelector("[data-fullscreen-toggle]");
    const label = shell.querySelector("[data-fullscreen-label]");

    if (!button || !label) {
        return;
    }

    button.setAttribute(
        "aria-label",
        isFullscreen ? "Exit full screen visualization" : "Open visualization in full screen"
    );
    button.setAttribute("title", isFullscreen ? "Exit full screen" : "Open full screen");
    label.textContent = isFullscreen ? "Exit Full Screen" : "Full Screen";
}

function setInspectorVisibility(shell, shouldShow) {
    if (!shell) {
        return;
    }

    const inspector = shell.querySelector("[data-node-inspector]");
    const layout = shell.querySelector("[data-visualization-layout]");
    const label = shell.querySelector("[data-inspector-label]");
    const toggleButton = shell.querySelector("[data-inspector-toggle]");
    const isFullscreen = document.fullscreenElement === shell;
    const visible = isFullscreen ? shouldShow : true;

    inspectorVisibilityByShell.set(shell, visible);

    if (toggleButton) {
        toggleButton.classList.toggle("hidden", !isFullscreen);
        toggleButton.classList.toggle("inline-flex", isFullscreen);
    }

    if (inspector) {
        inspector.classList.toggle("hidden", !visible);
    }

    if (layout) {
        layout.classList.toggle("xl:grid-cols-1", isFullscreen || !visible);
        layout.style.gridTemplateColumns = isFullscreen || !visible
            ? "minmax(0, 1fr)"
            : "";
    }

    if (label) {
        label.textContent = visible ? "Hide Inspector" : "Show Inspector";
    }
}

function clampGraphScale(scale) {
    return Math.min(2.5, Math.max(0.35, scale));
}

function getPanelForShell(shell) {
    return shell?.closest(".path-detail-panel") || null;
}

function updateZoomReadout(panel) {
    const state = graphStateByPanel.get(panel);
    const readout = panel?.querySelector("[data-zoom-readout]");

    if (state && readout) {
        readout.textContent = `${Math.round(state.scale * 100)}%`;
    }
}

function applyGraphTransform(panel) {
    const state = graphStateByPanel.get(panel);
    if (!state?.viewportGroup) {
        return;
    }

    state.viewportGroup.setAttribute(
        "transform",
        `translate(${state.translateX} ${state.translateY}) scale(${state.scale})`
    );
    updateZoomReadout(panel);
}

function fitGraphToCanvas(panel, focusNodeId = null) {
    const state = graphStateByPanel.get(panel);
    if (!state?.canvas) {
        return;
    }

    const canvasRect = state.canvas.getBoundingClientRect();
    const availableWidth = Math.max(canvasRect.width - 48, 240);
    const availableHeight = Math.max(canvasRect.height - 48, 220);
    const nextScale = clampGraphScale(Math.min(availableWidth / state.width, availableHeight / state.height));

    state.scale = nextScale;

    if (focusNodeId) {
        const focusNode = state.graph.nodes.find((node) => node.id === focusNodeId);
        if (focusNode) {
            state.translateX = (canvasRect.width / 2) - (focusNode.x * nextScale);
            state.translateY = (canvasRect.height / 2) - (focusNode.y * nextScale);
            applyGraphTransform(panel);
            return;
        }
    }

    state.translateX = (canvasRect.width - (state.width * nextScale)) / 2;
    state.translateY = (canvasRect.height - (state.height * nextScale)) / 2;
    applyGraphTransform(panel);
}

function resetGraphView(panel) {
    fitGraphToCanvas(panel);
}

function zoomGraph(panel, factor) {
    const state = graphStateByPanel.get(panel);
    if (!state?.canvas) {
        return;
    }

    const canvasRect = state.canvas.getBoundingClientRect();
    const centerX = canvasRect.width / 2;
    const centerY = canvasRect.height / 2;
    const graphX = (centerX - state.translateX) / state.scale;
    const graphY = (centerY - state.translateY) / state.scale;
    const nextScale = clampGraphScale(state.scale * factor);

    state.scale = nextScale;
    state.translateX = centerX - (graphX * nextScale);
    state.translateY = centerY - (graphY * nextScale);
    applyGraphTransform(panel);
}

function attachGraphInteractions(panel, canvas) {
    if (!panel || !canvas || canvas.dataset.graphInteractionsBound === "true") {
        return;
    }

    canvas.dataset.graphInteractionsBound = "true";
    canvas.addEventListener("wheel", (event) => {
        if (!graphStateByPanel.get(panel)) {
            return;
        }

        event.preventDefault();
        zoomGraph(panel, event.deltaY < 0 ? 1.1 : 0.9);
    }, { passive: false });

    canvas.addEventListener("mousedown", (event) => {
        const state = graphStateByPanel.get(panel);
        if (!state || event.button !== 0) {
            return;
        }

        const interactiveTarget = event.target.closest?.("[data-node-interactive='true']");
        if (interactiveTarget) {
            return;
        }

        state.dragging = true;
        state.dragStartX = event.clientX;
        state.dragStartY = event.clientY;
        canvas.style.cursor = "grabbing";
    });

    document.addEventListener("mousemove", (event) => {
        const state = graphStateByPanel.get(panel);
        if (!state?.dragging) {
            return;
        }

        state.translateX += event.clientX - state.dragStartX;
        state.translateY += event.clientY - state.dragStartY;
        state.dragStartX = event.clientX;
        state.dragStartY = event.clientY;
        applyGraphTransform(panel);
    });

    document.addEventListener("mouseup", () => {
        const state = graphStateByPanel.get(panel);
        if (!state?.dragging) {
            return;
        }

        state.dragging = false;
        canvas.style.cursor = "grab";
    });
}

function applyVisualizationFullscreenState(shell, isFullscreen) {
    if (!shell) {
        return;
    }

    const layout = shell.querySelector("[data-visualization-layout]");
    const graphShell = shell.querySelector("[data-graph-shell]");
    const canvas = shell.querySelector("[data-graph-canvas]");
    const inspector = shell.querySelector("[data-node-inspector]");

    shell.classList.toggle("bg-white", !isFullscreen);
    shell.classList.toggle("fixed", isFullscreen);
    shell.classList.toggle("inset-0", isFullscreen);
    shell.classList.toggle("z-[100]", isFullscreen);
    shell.classList.toggle("m-0", isFullscreen);
    shell.classList.toggle("min-h-screen", isFullscreen);
    shell.classList.toggle("rounded-none", isFullscreen);
    shell.classList.toggle("border-0", isFullscreen);
    shell.classList.toggle("p-6", isFullscreen);
    shell.classList.toggle("overflow-auto", isFullscreen);
    shell.style.background = "";
    shell.style.backdropFilter = "";

    if (layout) {
        layout.style.gridTemplateColumns = "";
    }

    if (graphShell) {
        graphShell.style.minHeight = isFullscreen ? "calc(100vh - 10rem)" : "";
        graphShell.style.boxShadow = isFullscreen ? "0 20px 60px rgba(15, 23, 42, 0.25)" : "";
    }

    if (canvas) {
        canvas.style.height = isFullscreen ? "calc(100vh - 13.5rem)" : "";
        canvas.style.cursor = "grab";
    }

    if (inspector) {
        inspector.style.maxHeight = isFullscreen ? "calc(100vh - 13.5rem)" : "";
        inspector.style.overflowY = isFullscreen ? "auto" : "";
        inspector.style.position = "";
        inspector.style.top = "";
        inspector.style.alignSelf = "";
        inspector.style.boxShadow = "";
    }

    updateFullscreenButtonState(shell, isFullscreen);
    setInspectorVisibility(shell, isFullscreen ? false : true);

    if (isFullscreen) {
        const panel = getPanelForShell(shell);
        window.requestAnimationFrame(() => {
            fitGraphToCanvas(panel, pinnedNodeId);
        });
    }
}

async function toggleVisualizationFullscreen(button) {
    const shell = button.closest("[data-visualization-shell]");
    if (!shell) {
        return;
    }

    const isFullscreen = document.fullscreenElement === shell;

    try {
        if (isFullscreen) {
            await document.exitFullscreen();
        } else if (shell.requestFullscreen) {
            await shell.requestFullscreen();
        }
    } catch (error) {
        console.error("Failed to toggle full screen visualization:", error);
    }
}

function syncVisualizationFullscreenState() {
    visualizationShells.forEach((shell) => {
        applyVisualizationFullscreenState(shell, document.fullscreenElement === shell);
    });
}

function renderInspector(inspector, detail, node, graph) {
    if (!inspector) {
        return;
    }

    if (!node) {
        inspector.innerHTML = `
            <p class="text-sm font-medium text-gray-700">Node Inspector</p>
            <p class="text-sm text-gray-500 mt-2">
                Hover or click a node in the graph to inspect its file, type, and related downstream tags.
            </p>
        `;
        return;
    }

    const outgoingEdges = graph.edges.filter((edge) => edge.source === node.id);
    const incomingEdges = graph.edges.filter((edge) => edge.target === node.id);
    const relatedTags = Array.from(new Set(
        [...outgoingEdges, ...incomingEdges].flatMap((edge) => edge.tags)
    ));

    inspector.innerHTML = `
        <p class="text-sm font-medium text-gray-700">Node Inspector</p>
        <div class="mt-3 space-y-3">
            <div>
                <p class="text-xs text-gray-500">Symbol</p>
                <p class="text-sm font-semibold break-all">${node.symbol}</p>
            </div>
            <div>
                <p class="text-xs text-gray-500">File</p>
                <p class="text-sm break-all ">${node.file}</p>
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
                <div>
                    <p class="text-xs text-gray-500">Type</p>
                    <p class="text-sm capitalize">${node.type}</p>
                </div>
                <div>
                    <p class="text-xs text-gray-500">Occurrences</p>
                    <p class="text-sm">${node.occurrences}</p>
                </div>
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
                <div>
                    <p class="text-xs text-gray-500">Incoming</p>
                    <p class="text-sm">${incomingEdges.length}</p>
                </div>
                <div>
                    <p class="text-xs text-gray-500">Outgoing</p>
                    <p class="text-sm">${outgoingEdges.length}</p>
                </div>
            </div>
            <div>
                <p class="text-xs text-gray-500">Related Tags</p>
                <p class="text-sm break-words">${relatedTags.length ? relatedTags.join(", ") : "No tags on connected edges"}</p>
            </div>
            <div>
                <p class="text-xs text-gray-500">Impact Root</p>
                <p class="text-sm break-all">${detail.impact_root}</p>
            </div>
        </div>
    `;
}

function renderGraph(panel) {
    if (!panel) {
        return;
    }

    const detailIndex = Number(panel.dataset.detailIndex || "-1");
    const detail = analysisDetails[detailIndex];
    const canvas = panel.querySelector("[data-graph-canvas]");
    const inspector = panel.querySelector("[data-node-inspector]");

    if (!detail || !canvas || !inspector) {
        return;
    }

    const graph = buildGraphModel(detail);
    const maxX = Math.max(...graph.nodes.map((node) => node.x), 0);
    const maxY = Math.max(...graph.nodes.map((node) => node.y), 0);
    const width = Math.max(maxX + 180, 720);
    const height = Math.max(maxY + 120, 360);

    canvas.innerHTML = "";

    if (!graph.nodes.length) {
        canvas.innerHTML = '<p class="p-4 text-sm text-gray-500">No nodes available for this impacted path.</p>';
        renderInspector(inspector, detail, null, graph);
        return;
    }

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("width", String(width));
    svg.setAttribute("height", String(height));
    svg.classList.add("block", "min-w-full");
    svg.style.userSelect = "none";

    const viewportGroup = document.createElementNS(SVG_NS, "g");
    const edgeGroup = document.createElementNS(SVG_NS, "g");
    const nodeGroup = document.createElementNS(SVG_NS, "g");

    const edgeElements = new Map();
    const nodeElements = new Map();

    graph.edges.forEach((edge) => {
        const line = document.createElementNS(SVG_NS, "path");
        const sourceX = edge.sourceNode.x + 78;
        const sourceY = edge.sourceNode.y;
        const targetX = edge.targetNode.x - 78;
        const targetY = edge.targetNode.y;
        const controlX = (sourceX + targetX) / 2;
        const pathData = `M ${sourceX} ${sourceY} C ${controlX} ${sourceY}, ${controlX} ${targetY}, ${targetX} ${targetY}`;

        line.setAttribute("d", pathData);
        line.setAttribute("fill", "none");
        line.setAttribute("stroke", "#cbd5e1");
        line.setAttribute("stroke-width", "2");
        line.dataset.edgeId = edge.id;
        edgeGroup.appendChild(line);
        edgeElements.set(edge.id, line);
    });

    function highlightNode(nodeId) {
        graph.nodes.forEach((node) => {
            const nodeGroupElement = nodeElements.get(node.id);
            if (!nodeGroupElement) {
                return;
            }

            const active = node.id === nodeId;
            nodeGroupElement.setAttribute("opacity", active || !nodeId ? "1" : "0.45");
        });

        graph.edges.forEach((edge) => {
            const edgeElement = edgeElements.get(edge.id);
            if (!edgeElement) {
                return;
            }

            const active = !nodeId || edge.source === nodeId || edge.target === nodeId;
            edgeElement.setAttribute("stroke", active ? "#60a5fa" : "#d1d5db");
            edgeElement.setAttribute("stroke-width", active ? "3" : "2");
            edgeElement.setAttribute("opacity", active ? "1" : "0.35");
        });
    }

    graph.nodes.forEach((node) => {
        const group = document.createElementNS(SVG_NS, "g");
        group.setAttribute("transform", `translate(${node.x}, ${node.y})`);
        group.style.cursor = "pointer";
        group.dataset.nodeInteractive = "true";

        const rect = document.createElementNS(SVG_NS, "rect");
        rect.setAttribute("x", "-78");
        rect.setAttribute("y", String(-(node.nodeHeight / 2)));
        rect.setAttribute("rx", "16");
        rect.setAttribute("width", "156");
        rect.setAttribute("height", String(node.nodeHeight));
        rect.setAttribute("fill", "#ffffff");
        rect.setAttribute("stroke", getNodeColor(node.type));
        rect.setAttribute("stroke-width", "2");

        const title = document.createElementNS(SVG_NS, "title");
        title.textContent = `${node.symbol} (${node.file})`;

        const text = document.createElementNS(SVG_NS, "text");
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("font-size", "12");
        text.setAttribute("fill", "#1f2937");

        const typeLabel = document.createElementNS(SVG_NS, "tspan");
        typeLabel.setAttribute("x", "0");
        typeLabel.setAttribute("dy", String(-(node.symbolLines.length * 6)));
        typeLabel.setAttribute("font-size", "10");
        typeLabel.setAttribute("fill", "#6b7280");
        typeLabel.textContent = node.type.toUpperCase();

        text.appendChild(typeLabel);

        node.symbolLines.forEach((line, index) => {
            const symbolLabel = document.createElementNS(SVG_NS, "tspan");
            symbolLabel.setAttribute("x", "0");
            symbolLabel.setAttribute("dy", index === 0 ? "16" : "13");
            symbolLabel.textContent = line;
            text.appendChild(symbolLabel);
        });

        group.appendChild(rect);
        group.appendChild(text);
        group.appendChild(title);

        group.addEventListener("mouseenter", () => {
            highlightNode(node.id);
            renderInspector(inspector, detail, node, graph);
        });

        group.addEventListener("mouseleave", () => {
            if (pinnedNodeId && graph.nodes.some((entry) => entry.id === pinnedNodeId)) {
                const pinnedNode = graph.nodes.find((entry) => entry.id === pinnedNodeId);
                highlightNode(pinnedNodeId);
                renderInspector(inspector, detail, pinnedNode, graph);
                return;
            }

            highlightNode(null);
            renderInspector(inspector, detail, null, graph);
        });

        group.addEventListener("click", () => {
            pinnedNodeId = node.id;
            highlightNode(node.id);
            renderInspector(inspector, detail, node, graph);
        });

        nodeGroup.appendChild(group);
        nodeElements.set(node.id, group);
    });

    viewportGroup.appendChild(edgeGroup);
    viewportGroup.appendChild(nodeGroup);
    svg.appendChild(viewportGroup);
    canvas.appendChild(svg);

    graphStateByPanel.set(panel, {
        panel,
        canvas,
        graph,
        svg,
        viewportGroup,
        width,
        height,
        scale: 1,
        translateX: 0,
        translateY: 0,
        dragging: false,
        dragStartX: 0,
        dragStartY: 0
    });
    attachGraphInteractions(panel, canvas);

    pinnedNodeId = graph.nodes[0]?.id || null;
    if (pinnedNodeId) {
        const initialNode = graph.nodes.find((node) => node.id === pinnedNodeId);
        highlightNode(pinnedNodeId);
        renderInspector(inspector, detail, initialNode, graph);
    } else {
        highlightNode(null);
        renderInspector(inspector, detail, null, graph);
    }

    fitGraphToCanvas(panel, pinnedNodeId);
}

function setActivePath(targetId) {
    detailPanels.forEach((panel) => {
        const isActive = panel.id === targetId;
        panel.classList.toggle("hidden", !isActive);
        if (isActive) {
            renderGraph(panel);
        }
    });

    pathOptions.forEach((option) => {
        const isActive = option.dataset.target === targetId;
        option.classList.toggle("border-blue-300", isActive);
        option.classList.toggle("bg-blue-50", isActive);
        option.classList.toggle("bg-gray-50", !isActive);
    });
}

function applySidebarState() {
    if (!sidebar) {
        return;
    }

    if (!desktopSidebarQuery.matches) {
        if (analysisWorkspace) {
            analysisWorkspace.classList.remove("xl:grid-cols-[4rem,minmax(0,1fr)]");
            analysisWorkspace.classList.add("xl:grid-cols-[18rem,minmax(0,1fr)]");
        }
        sidebar.classList.remove("xl:w-16");
        if (sidebarContent) {
            sidebarContent.classList.remove("hidden");
        }
        if (sidebarHeaderText) {
            sidebarHeaderText.classList.remove("hidden");
        }
        if (sidebarHeader) {
            sidebarHeader.classList.remove("justify-center");
            sidebarHeader.classList.add("justify-between");
        }
        if (sidebarCollapseButton) {
            sidebarCollapseButton.textContent = "<";
            sidebarCollapseButton.setAttribute("aria-label", "Collapse sidebar");
        }
        return;
    }

    if (sidebarCollapsed) {
        if (analysisWorkspace) {
            analysisWorkspace.classList.remove("xl:grid-cols-[18rem,minmax(0,1fr)]");
            analysisWorkspace.classList.add("xl:grid-cols-[4rem,minmax(0,1fr)]");
        }
        sidebar.classList.add("xl:w-16");
        if (sidebarContent) {
            sidebarContent.classList.add("hidden");
        }
        if (sidebarHeaderText) {
            sidebarHeaderText.classList.add("hidden");
        }
        if (sidebarHeader) {
            sidebarHeader.classList.remove("justify-between");
            sidebarHeader.classList.add("justify-center");
        }
        if (sidebarCollapseButton) {
            sidebarCollapseButton.textContent = ">";
            sidebarCollapseButton.setAttribute("aria-label", "Expand sidebar");
        }
    } else {
        if (analysisWorkspace) {
            analysisWorkspace.classList.remove("xl:grid-cols-[4rem,minmax(0,1fr)]");
            analysisWorkspace.classList.add("xl:grid-cols-[18rem,minmax(0,1fr)]");
        }
        sidebar.classList.remove("xl:w-16");
        if (sidebarContent) {
            sidebarContent.classList.remove("hidden");
        }
        if (sidebarHeaderText) {
            sidebarHeaderText.classList.remove("hidden");
        }
        if (sidebarHeader) {
            sidebarHeader.classList.remove("justify-center");
            sidebarHeader.classList.add("justify-between");
        }
        if (sidebarCollapseButton) {
            sidebarCollapseButton.textContent = "<";
            sidebarCollapseButton.setAttribute("aria-label", "Collapse sidebar");
        }
    }
}

pathOptions.forEach((option) => {
    option.addEventListener("click", () => {
        setActivePath(option.dataset.target);
    });
});

if (sidebarCollapseButton) {
    sidebarCollapseButton.addEventListener("click", () => {
        sidebarCollapsed = !sidebarCollapsed;
        applySidebarState();
    });
}

if (pathOptions.length > 0) {
    setActivePath(pathOptions[0].dataset.target);
}

document.addEventListener("click", (event) => {
    const fullscreenButton = event.target.closest("[data-fullscreen-toggle]");
    if (fullscreenButton) {
        toggleVisualizationFullscreen(fullscreenButton);
        return;
    }

    const inspectorToggleButton = event.target.closest("[data-inspector-toggle]");
    if (inspectorToggleButton) {
        const shell = inspectorToggleButton.closest("[data-visualization-shell]");
        const current = inspectorVisibilityByShell.get(shell);
        setInspectorVisibility(shell, current === undefined ? false : !current);
        const panel = getPanelForShell(shell);
        window.requestAnimationFrame(() => {
            fitGraphToCanvas(panel, pinnedNodeId);
        });
        return;
    }

    const graphActionButton = event.target.closest("[data-graph-action]");
    if (!graphActionButton) {
        return;
    }

    const shell = graphActionButton.closest("[data-visualization-shell]");
    const panel = getPanelForShell(shell);
    const action = graphActionButton.dataset.graphAction;

    if (action === "fit") {
        fitGraphToCanvas(panel, pinnedNodeId);
    } else if (action === "zoom-in") {
        zoomGraph(panel, 1.15);
    } else if (action === "zoom-out") {
        zoomGraph(panel, 0.87);
    } else if (action === "reset") {
        resetGraphView(panel);
    }
});

document.addEventListener("fullscreenchange", () => {
    syncVisualizationFullscreenState();
});

document.addEventListener("keydown", (event) => {
    const fullscreenShell = document.fullscreenElement?.matches?.("[data-visualization-shell]")
        ? document.fullscreenElement
        : null;
    const panel = getPanelForShell(fullscreenShell);

    if (!panel) {
        return;
    }

    if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        fitGraphToCanvas(panel, pinnedNodeId);
    } else if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        zoomGraph(panel, 1.15);
    } else if (event.key === "-") {
        event.preventDefault();
        zoomGraph(panel, 0.87);
    } else if (event.key === "0") {
        event.preventDefault();
        resetGraphView(panel);
    }
});

if (desktopSidebarQuery.addEventListener) {
    desktopSidebarQuery.addEventListener("change", applySidebarState);
} else if (desktopSidebarQuery.addListener) {
    desktopSidebarQuery.addListener(applySidebarState);
}

applySidebarState();
syncVisualizationFullscreenState();
