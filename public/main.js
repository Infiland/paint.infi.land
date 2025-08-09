import { state } from "./js/state.js";
import { setupCanvases } from "./js/canvas.js";
import { requestRender, renderCursors } from "./js/render.js";
import { socket, setupSocketHandlers, emitCursor, startDrawInterval, stopDrawInterval } from "./js/socket.js";
import { onPointerDown, onPointerMove, onPointerUp } from "./js/tools.js";

const strokesCanvas = document.getElementById("strokesCanvas");
const cursorsCanvas = document.getElementById("cursorsCanvas");
const toolbar = document.getElementById("toolbar");
const colorPicker = document.getElementById("colorPicker");
const joinOverlay = document.getElementById("joinOverlay");
const joinForm = document.getElementById("joinForm");
const usernameInput = document.getElementById("usernameInput");
const colorInput = document.getElementById("colorInput");

setupCanvases(strokesCanvas, cursorsCanvas, () => {
  // On resize, re-render shapes and cursors
  requestRender();
  renderCursors();
});
setupSocketHandlers();

// Pointer listeners
// Use capture so middle-button panning doesn't get blocked by other listeners
strokesCanvas.addEventListener("pointerdown", onPointerDown, { capture: true, passive: false });
strokesCanvas.addEventListener("pointermove", onPointerMove, { capture: true, passive: false });
window.addEventListener("pointerup", onPointerUp, { capture: true });
// Ensure we end strokes on cancellation or lost capture (mobile)
strokesCanvas.addEventListener("pointercancel", onPointerUp, { capture: true });
strokesCanvas.addEventListener("lostpointercapture", onPointerUp, { capture: true });
// Wheel zoom (Ctrl+wheel). Use non-passive to be able to preventDefault
import { onWheelZoom } from "./js/tools.js";
strokesCanvas.addEventListener("wheel", onWheelZoom, { passive: false });

// Join + UI
import { setupUI } from "./js/ui.js";
setupUI({ joinOverlay, joinForm, usernameInput, colorInput, toolbar, colorPicker });
import { setupViewControls } from "./js/ui.js";
const zoomInBtn = document.getElementById("zoomInBtn");
const zoomOutBtn = document.getElementById("zoomOutBtn");
const resetViewBtn = document.getElementById("resetViewBtn");
setupViewControls({ zoomInBtn, zoomOutBtn, resetViewBtn });

// Initialize colors with random color from state
if (colorPicker) colorPicker.value = state.color;
if (colorInput) colorInput.value = state.color;

// Undo / Redo (Ctrl+Z / Ctrl+Shift+Z)
window.addEventListener("keydown", (e) => {
  const isCtrl = e.ctrlKey || e.metaKey;
  if (!isCtrl) return;
  const key = typeof e.key === "string" ? e.key.toLowerCase() : "";
  if (key === "z" && !e.shiftKey) {
    e.preventDefault();
    // Undo last action
    const last = state.undoStack.pop();
    if (last) {
      state.redoStack.push(last);
      if (last.type === 'add') {
        socket.emit("shapeDelete", { id: last.shape.id });
      } else if (last.type === 'delete') {
        const s = last.shape;
        socket.emit("shapeAdd", { id: s.id, type: s.type, data: s.data, color: s.color });
      }
    }
  } else if ((key === "z" && e.shiftKey) || key === "y") {
    e.preventDefault();
    // Redo last undone action
    const next = state.redoStack.pop();
    if (next) {
      state.undoStack.push(next);
      if (next.type === 'add') {
        const s = next.shape;
        socket.emit("shapeAdd", { id: s.id, type: s.type, data: s.data, color: s.color });
      } else if (next.type === 'delete') {
        socket.emit("shapeDelete", { id: next.shape.id });
      }
    }
  }
});


