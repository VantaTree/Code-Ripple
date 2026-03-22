const sidebar = document.getElementById("impactedPathsSidebar");
const sidebarContent = document.getElementById("sidebarContent");
const sidebarHeaderText = document.getElementById("sidebarHeaderText");
const sidebarCollapseButton = document.getElementById("sidebarCollapseButton");
const sidebarExpandRail = document.getElementById("sidebarExpandRail");
const analysisContent = document.getElementById("analysisContent");
const pathOptions = Array.from(document.querySelectorAll(".path-option"));
const detailPanels = Array.from(document.querySelectorAll(".path-detail-panel"));
let sidebarCollapsed = false;

function setActivePath(targetId) {
    detailPanels.forEach((panel) => {
        panel.classList.toggle("hidden", panel.id !== targetId);
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
