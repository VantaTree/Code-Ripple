
const state = {
    chunks: window.__ANALYSIS_DATA__.chunks,
    currentIndex: 0
};

// ---------------- INIT ----------------
document.addEventListener("DOMContentLoaded", () => {
    bindSidebar();
    bindKeyboard();
    renderChunk(0);
});

// ---------------- SIDEBAR ----------------
function bindSidebar() {
    document.querySelectorAll(".chunk-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const index = Number(btn.dataset.index);
            selectChunk(index);
        });
    });
}

function selectChunk(index) {
    if (index < 0 || index >= state.chunks.length) return;

    state.currentIndex = index;

    highlightActiveChunk();
    scrollIntoView();
    renderChunk(index);
}

function highlightActiveChunk() {
    document.querySelectorAll(".chunk-btn").forEach((btn, i) => {
        btn.classList.toggle("bg-blue-50", i === state.currentIndex);
    });
}

function scrollIntoView() {
    const active = document.querySelectorAll(".chunk-btn")[state.currentIndex];
    active?.scrollIntoView({ block: "nearest" });
}

// ---------------- KEYBOARD ----------------
function bindKeyboard() {
    document.addEventListener("keydown", (e) => {
        if (e.target.tagName === "INPUT") return;

        if (e.key === "j") selectChunk(state.currentIndex + 1);
        if (e.key === "k") selectChunk(state.currentIndex - 1);
    });
}

// ---------------- RENDER ----------------
function renderChunk(index) {
    const chunk = state.chunks[index];

    renderDiff(chunk);
    renderImpact(chunk);
    renderContext(chunk);
}

// ---------------- DIFF ----------------
function renderDiff(chunk) {
    const container = document.getElementById("diffContainer");

    const lines = chunk.diff.map((line, i) => {
        let color = "text-gray-700";

        if (line.startsWith("+")) color = "text-green-600 bg-green-50";
        else if (line.startsWith("-")) color = "text-red-600 bg-red-50";

        return `
            <div class="flex font-mono text-sm">
                <div class="w-10 text-gray-400 text-right pr-2">${i + 1}</div>
                <div class="flex-1 px-2 ${color} whitespace-pre">${escapeHtml(line)}</div>
            </div>
        `;
    }).join("");

    container.innerHTML = `
        <div class="mb-4">
            <div class="text-sm text-gray-500">${chunk.file}</div>
            <div class="font-mono text-sm">${chunk.header}</div>
        </div>

        <div class="border rounded overflow-hidden">
            ${lines}
        </div>
    `;
}

// ---------------- IMPACT ----------------
function renderImpact(chunk) {
    const container = document.getElementById("impactContainer");

    if (!chunk.impact || chunk.impact.length === 0) {
        container.innerHTML = "<div class='text-gray-400'>No impact</div>";
        return;
    }

    container.innerHTML = chunk.impact.map((i, idx) => {
        return `
            <div class="border rounded p-2 bg-gray-50 cursor-pointer"
                 onclick="toggleImpact(${idx})">

                <div class="font-medium text-xs">${i.root}</div>
                <div class="text-xs text-gray-500">
                    ↓ ${i.impact.downstream.length} downstream
                </div>

                <div id="impact-${idx}" class="hidden mt-2 space-y-1 text-xs">
                    ${i.impact.downstream.map(p => `
                        <div class="bg-white border rounded px-2 py-1">
                            ${p.path.join(" → ")}
                        </div>
                    `).join("")}
                </div>

            </div>
        `;
    }).join("");
}

function toggleImpact(i) {
    const el = document.getElementById(`impact-${i}`);
    el.classList.toggle("hidden");
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

// ---------------- UTIL ----------------
function escapeHtml(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}
