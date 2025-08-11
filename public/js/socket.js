import { state } from "./state.js";
import { requestRender, renderCursors, invalidateShapeCache, invalidateAllShapeCache } from "./render.js";

export const socket = io();

export function setupSocketHandlers() {
  socket.on("connect", () => {
    state.selfId = socket.id;
  });

  socket.on("presence", (msg) => {
    if (msg.type === "join") {
      state.remoteCursors.set(msg.id, {
        username: msg.username,
        color: msg.color,
        x: null,
        y: null,
        down: false,
      });
    } else if (msg.type === "leave") {
      state.remoteCursors.delete(msg.id);
      renderCursors();
    }
  });

  socket.on("cursor", (payload) => {
    console.log('Received cursor:', payload);
    const entry = state.remoteCursors.get(payload.id) || {};
    entry.x = payload.x;
    entry.y = payload.y;
    entry.down = Boolean(payload.down);
    entry.username = payload.username || entry.username;
    entry.color = payload.color || entry.color || "#00e5ff";
    state.remoteCursors.set(payload.id, entry);
    console.log('Remote cursors count:', state.remoteCursors.size);
    renderCursors();
  });

  socket.on("draw", (stroke) => {
    const entry = state.activeStrokes.get(stroke.id) || { type: "pen", color: stroke.color, points: [] };
    if (stroke.points && stroke.points.length > 0) {
      if (entry.points.length === 0 && stroke.points.length === 1) {
        // single dot handled in render
      } else {
        entry.points.push(...stroke.points);
        entry.color = stroke.color || entry.color;
        state.activeStrokes.set(stroke.id, entry);
        requestRender();
      }
    }
  });

  socket.on("drawEnd", ({ id }) => {
    if (id) {
      state.activeStrokes.delete(id);
      requestRender();
    }
  });

  socket.on("state", ({ cursors, shapes }) => {
    state.activeStrokes.clear();
    state.allShapes.clear();
    invalidateAllShapeCache();
    if (Array.isArray(shapes)) {
      for (const s of shapes) state.allShapes.set(s.id, s);
    }
    requestRender();
    state.remoteCursors.clear();
    for (const c of cursors) state.remoteCursors.set(c.id, c);
    renderCursors();
  });

  socket.on("shapeAdd", (shape) => {
    state.allShapes.set(shape.id, shape);
    invalidateShapeCache(shape.id);
    // If it's my shape and I didn't manually push to undoStack (e.g., redo or remote sync),
    // ensure the top of redo/undo is consistent. We won't auto-push here to avoid double entries.
    requestRender();
  });

  socket.on("shapeDelete", ({ id }) => {
    if (id) {
      state.allShapes.delete(id);
      invalidateShapeCache(id);
      // Likewise, we only render here; undo/redo stacks are managed on the action origin.
      requestRender();
    }
  });

  socket.on("removeUserShapes", ({ id }) => {
    if (!id) return;
    let dirty = false;
    for (const [sid, shape] of Array.from(state.allShapes.entries())) {
      if (shape.userId === id) {
        state.allShapes.delete(sid);
        invalidateShapeCache(sid);
        dirty = true;
      }
    }
    if (dirty) requestRender();
  });
}

export function emitCursor() {
  if (state.localCursorFrameReq) return;
  state.localCursorFrameReq = requestAnimationFrame(() => {
    state.localCursorFrameReq = null;
    socket.volatile.emit("cursor", {
      x: state.lastPointer.x,
      y: state.lastPointer.y,
      down: state.isPointerDown,
    });
  });
}

export function startDrawInterval() {
  if (state.drawIntervalId) return;
  state.drawIntervalId = setInterval(() => {
    if (state.pointsBuffer.length === 0) return;
    socket.emit("draw", { points: state.pointsBuffer.splice(0, state.pointsBuffer.length) });
  }, 40);
}

export function stopDrawInterval() {
  if (!state.drawIntervalId) return;
  clearInterval(state.drawIntervalId);
  state.drawIntervalId = null;
}


