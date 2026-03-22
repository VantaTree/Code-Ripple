const sidebar = document.getElementById("impactedPathsSidebar");
const sidebarContent = document.getElementById("sidebarContent");
const sidebarHeaderText = document.getElementById("sidebarHeaderText");
const sidebarCollapseButton = document.getElementById("sidebarCollapseButton");
const sidebarExpandRail = document.getElementById("sidebarExpandRail");
const analysisContent = document.getElementById("analysisContent");
const pathOptions = Array.from(document.querySelectorAll(".path-option"));
const detailPanels = Array.from(document.querySelectorAll(".path-detail-panel"));
const detailsDataNode = document.getElementById("analysis-details-data");
const SVG_NS = "http://www.w3.org/2000/svg";
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
                <p class="text-sm wrap-break-words">${relatedTags.length ? relatedTags.join(", ") : "No tags on connected edges"}</p>
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

    svg.appendChild(edgeGroup);
    svg.appendChild(nodeGroup);
    canvas.appendChild(svg);

    pinnedNodeId = graph.nodes[0]?.id || null;
    if (pinnedNodeId) {
        const initialNode = graph.nodes.find((node) => node.id === pinnedNodeId);
        highlightNode(pinnedNodeId);
        renderInspector(inspector, detail, initialNode, graph);
    } else {
        highlightNode(null);
        renderInspector(inspector, detail, null, graph);
    }
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

    if (sidebarCollapsed) {
        sidebar.classList.add("hidden");
        if (sidebarContent) {
            sidebarContent.classList.add("hidden");
        }
        if (sidebarHeaderText) {
            sidebarHeaderText.classList.add("hidden");
        }
        if (sidebarCollapseButton) {
            sidebarCollapseButton.textContent = ">";
            sidebarCollapseButton.setAttribute("aria-label", "Expand sidebar");
        }
        if (sidebarExpandRail) {
            sidebarExpandRail.classList.remove("hidden");
        }
        if (analysisContent) {
            analysisContent.classList.remove("lg:pl-[22rem]");
            analysisContent.classList.add("pl-0");
        }
    } else {
        sidebar.classList.remove("hidden");
        if (sidebarContent) {
            sidebarContent.classList.remove("hidden");
        }
        if (sidebarHeaderText) {
            sidebarHeaderText.classList.remove("hidden");
        }
        if (sidebarCollapseButton) {
            sidebarCollapseButton.textContent = "<";
            sidebarCollapseButton.setAttribute("aria-label", "Collapse sidebar");
        }
        if (sidebarExpandRail) {
            sidebarExpandRail.classList.add("hidden");
        }
        if (analysisContent) {
            analysisContent.classList.remove("pl-0");
            analysisContent.classList.add("lg:pl-[22rem]");
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

if (sidebarExpandRail) {
    sidebarExpandRail.addEventListener("click", () => {
        sidebarCollapsed = false;
        applySidebarState();
    });
}

if (pathOptions.length > 0) {
    setActivePath(pathOptions[0].dataset.target);
}

applySidebarState();
