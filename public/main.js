import { initTheme, setupCanvases } from "./js/canvas.js";
import { getRequiredCanvas, getRequiredElement, isTextInputElement } from "./js/dom.js";
import { renderCursors, requestRender } from "./js/render.js";
import { setupSocketHandlers, socket } from "./js/socket.js";
import { createPlayfulUsernameSuggestion, generateRandomColor, state, USERNAME_STORAGE_KEY } from "./js/state.js";
import { onPointerDown, onPointerMove, onPointerUp, onWheelZoom } from "./js/tools.js";
import { requestUiSync } from "./js/ui-events.js";
import { setupUI, setupViewControls } from "./js/ui.js";
function hydrateJoinDefaults(usernameInput, colorInput, colorPicker) {
    let storedName = "";
    try {
        storedName = localStorage.getItem(USERNAME_STORAGE_KEY) ?? "";
    }
    catch {
        storedName = "";
    }
    usernameInput.value = storedName.trim().slice(0, 20) || createPlayfulUsernameSuggestion();
    state.color = generateRandomColor();
    colorInput.value = state.color;
    colorPicker.value = state.color;
}
function sendShapeAdd(shape) {
    socket.emit("shapeAdd", { id: shape.id, type: shape.type, data: shape.data, color: shape.color });
}
function registerUndoRedoShortcuts() {
    window.addEventListener("keydown", (event) => {
        if (isTextInputElement(event.target)) {
            return;
        }
        const isPrimaryModifier = event.ctrlKey || event.metaKey;
        if (!isPrimaryModifier) {
            return;
        }
        const key = event.key.toLowerCase();
        if (key === "z" && !event.shiftKey) {
            event.preventDefault();
            const lastEntry = state.undoStack.pop();
            if (!lastEntry) {
                return;
            }
            state.redoStack.push(lastEntry);
            if (lastEntry.type === "add") {
                socket.emit("shapeDelete", { id: lastEntry.shape.id });
            }
            else {
                sendShapeAdd(lastEntry.shape);
            }
            return;
        }
        if ((key === "z" && event.shiftKey) || key === "y") {
            event.preventDefault();
            const nextEntry = state.redoStack.pop();
            if (!nextEntry) {
                return;
            }
            state.undoStack.push(nextEntry);
            if (nextEntry.type === "add") {
                sendShapeAdd(nextEntry.shape);
            }
            else {
                socket.emit("shapeDelete", { id: nextEntry.shape.id });
            }
        }
    });
}
const strokesCanvas = getRequiredCanvas("strokesCanvas");
const cursorsCanvas = getRequiredCanvas("cursorsCanvas");
const joinOverlay = getRequiredElement("joinOverlay");
const joinForm = getRequiredElement("joinForm");
const joinMessage = getRequiredElement("joinMessage");
const usernameInput = getRequiredElement("usernameInput");
const colorInput = getRequiredElement("colorInput");
const toolbar = getRequiredElement("toolbar");
const colorPicker = getRequiredElement("colorPicker");
const smoothingToggle = getRequiredElement("smoothingToggle");
const themeToggle = getRequiredElement("themeToggle");
const zoomLevel = getRequiredElement("zoomLevel");
const zoomInBtn = getRequiredElement("zoomInBtn");
const zoomOutBtn = getRequiredElement("zoomOutBtn");
const resetViewBtn = getRequiredElement("resetViewBtn");
hydrateJoinDefaults(usernameInput, colorInput, colorPicker);
initTheme();
setupCanvases(strokesCanvas, cursorsCanvas, () => {
    requestRender();
    renderCursors();
});
setupSocketHandlers();
strokesCanvas.addEventListener("pointerdown", onPointerDown, { capture: true, passive: false });
strokesCanvas.addEventListener("pointermove", onPointerMove, { capture: true, passive: false });
window.addEventListener("pointerup", onPointerUp, { capture: true });
strokesCanvas.addEventListener("pointercancel", onPointerUp, { capture: true });
strokesCanvas.addEventListener("lostpointercapture", onPointerUp, { capture: true });
strokesCanvas.addEventListener("wheel", onWheelZoom, { passive: false });
setupUI({
    joinOverlay,
    joinForm,
    joinMessage,
    usernameInput,
    colorInput,
    toolbar,
    colorPicker,
    smoothingToggle,
    themeToggle,
    zoomLevel,
}, {
    joinSession: ({ username, color }) => {
        socket.emit("join", { username, color });
        socket.emit("requestState");
    },
    updateColor: (color) => {
        socket.emit("updateColor", { color });
    },
    isConnected: () => socket.connected,
});
setupViewControls({ zoomInBtn, zoomOutBtn, resetViewBtn });
registerUndoRedoShortcuts();
requestUiSync();
//# sourceMappingURL=main.js.map