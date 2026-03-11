import { TOOL_ORDER } from "../shared/protocol.js";
import { getTheme, setTheme } from "./canvas.js";
import { isTextInputElement } from "./dom.js";
import { invalidateAllShapeCache, requestRender } from "./render.js";
import { state, USERNAME_STORAGE_KEY } from "./state.js";
import { commitActiveTextEditor } from "./tools.js";
import { UI_ERROR_EVENT, UI_SYNC_EVENT, requestUiSync } from "./ui-events.js";
function syncToolButtons(toolbar, activeTool) {
    for (const button of toolbar.querySelectorAll(".tool-btn[data-tool]")) {
        button.classList.toggle("active", button.dataset.tool === activeTool);
    }
}
function toggleTheme() {
    setTheme(getTheme() === "dark" ? "light" : "dark");
    requestRender();
}
function applySmoothingPreference(enabled) {
    state.smoothingEnabled = enabled;
    invalidateAllShapeCache();
    requestRender();
    requestUiSync();
}
function syncStatus(elements) {
    syncToolButtons(elements.toolbar, state.tool);
    elements.colorPicker.value = state.color;
    elements.colorInput.value = state.color;
    elements.zoomLevel.textContent = `${Math.round(state.viewScale * 100)}%`;
    elements.smoothingToggle.setAttribute("aria-pressed", String(state.smoothingEnabled));
}
function updateViewScale(nextScale) {
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    const worldX = (centerX - state.viewOffsetX) / state.viewScale;
    const worldY = (centerY - state.viewOffsetY) / state.viewScale;
    state.viewScale = Math.max(state.minScale, Math.min(nextScale, state.maxScale));
    state.viewOffsetX = centerX - worldX * state.viewScale;
    state.viewOffsetY = centerY - worldY * state.viewScale;
    requestRender();
    requestUiSync();
}
function setActiveTool(tool) {
    if (state.tool !== tool && state.textEditor) {
        commitActiveTextEditor();
    }
    state.tool = tool;
    requestUiSync();
}
export function setupUI(elements, actions) {
    const showMessage = (message) => {
        elements.joinMessage.textContent = message;
    };
    const sync = () => syncStatus(elements);
    elements.joinForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const username = elements.usernameInput.value.trim().slice(0, 20);
        const color = elements.colorInput.value;
        if (!username) {
            showMessage("Pick a name before entering.");
            return;
        }
        state.username = username;
        state.color = color;
        try {
            localStorage.setItem(USERNAME_STORAGE_KEY, username);
        }
        catch {
            // Ignore storage issues.
        }
        elements.joinOverlay.classList.add("is-hidden");
        showMessage("");
        actions.joinSession({ username, color });
        requestUiSync();
    });
    elements.usernameInput.addEventListener("input", () => {
        showMessage("");
        try {
            localStorage.setItem(USERNAME_STORAGE_KEY, elements.usernameInput.value.slice(0, 20));
        }
        catch {
            // Ignore storage issues.
        }
    });
    elements.colorInput.addEventListener("input", () => {
        state.color = elements.colorInput.value;
        elements.colorPicker.value = state.color;
        if (state.username) {
            actions.updateColor(state.color);
        }
        requestUiSync();
    });
    elements.colorPicker.addEventListener("input", () => {
        state.color = elements.colorPicker.value;
        elements.colorInput.value = state.color;
        if (state.username) {
            actions.updateColor(state.color);
        }
        requestUiSync();
    });
    elements.smoothingToggle.addEventListener("click", () => {
        applySmoothingPreference(!state.smoothingEnabled);
    });
    elements.themeToggle.addEventListener("click", () => {
        toggleTheme();
    });
    elements.toolbar.addEventListener("click", (event) => {
        if (!(event.target instanceof Element)) {
            return;
        }
        const button = event.target.closest(".tool-btn[data-tool]");
        const tool = button?.dataset.tool;
        if (!tool) {
            return;
        }
        setActiveTool(tool);
    });
    window.addEventListener("keydown", (event) => {
        if (isTextInputElement(event.target)) {
            return;
        }
        const key = event.key.toLowerCase();
        // Toggle smoothing with S
        if (key === "s" && !event.ctrlKey && !event.metaKey && !event.altKey) {
            applySmoothingPreference(!state.smoothingEnabled);
            return;
        }
        // Toggle dark mode with D
        if (key === "d" && !event.ctrlKey && !event.metaKey && !event.altKey) {
            toggleTheme();
            return;
        }
        // Tool shortcuts: 1-5
        if (!event.ctrlKey && !event.metaKey && !event.altKey) {
            const toolIndex = parseInt(key, 10) - 1;
            if (toolIndex >= 0 && toolIndex < TOOL_ORDER.length) {
                setActiveTool(TOOL_ORDER[toolIndex]);
            }
        }
    });
    window.addEventListener(UI_SYNC_EVENT, sync);
    window.addEventListener(UI_ERROR_EVENT, (event) => {
        const detail = event.detail;
        elements.joinOverlay.classList.remove("is-hidden");
        showMessage(detail);
        requestUiSync();
    });
    sync();
}
export function setupViewControls({ zoomInBtn, zoomOutBtn, resetViewBtn }) {
    zoomInBtn.addEventListener("click", () => {
        updateViewScale(state.viewScale * 1.2);
    });
    zoomOutBtn.addEventListener("click", () => {
        updateViewScale(state.viewScale / 1.2);
    });
    resetViewBtn.addEventListener("click", () => {
        state.viewScale = 1;
        state.viewOffsetX = 0;
        state.viewOffsetY = 0;
        requestRender();
        requestUiSync();
    });
}
//# sourceMappingURL=ui.js.map