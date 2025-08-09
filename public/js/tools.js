import { state } from "./state.js";
import { requestRender } from "./render.js";
import { socket, startDrawInterval, stopDrawInterval, emitCursor } from "./socket.js";

function toCanvasPoint(event) {
  // Convert screen to canvas world coords considering current pan/scale
  const x = (event.clientX - state.viewOffsetX) / state.viewScale;
  const y = (event.clientY - state.viewOffsetY) / state.viewScale;
  return { x, y };
}

function distance(a, b) {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.hypot(dx, dy);
}

function screenToWorld({ clientX, clientY }) {
  return {
    x: (clientX - state.viewOffsetX) / state.viewScale,
    y: (clientY - state.viewOffsetY) / state.viewScale,
  };
}

function setScaleAroundWorldPoint(newScale, worldPoint, screenPoint) {
  const clamped = Math.max(state.minScale, Math.min(newScale, state.maxScale));
  const { x: wx, y: wy } = worldPoint;
  const { clientX: sx, clientY: sy } = screenPoint;
  // Solve for offsets so worldPoint stays under screenPoint
  state.viewOffsetX = sx - wx * clamped;
  state.viewOffsetY = sy - wy * clamped;
  state.viewScale = clamped;
  requestRender();
}

export function onPointerDown(e) {
  if (!state.username) return;
  if (e.cancelable) e.preventDefault();

  // Track active pointers for pinch handling
  state.activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
  if (state.activePointers.size === 2) {
    const [a, b] = Array.from(state.activePointers.values());
    state.isPinchZooming = true;
    state.pinchStartDistance = distance(a, b);
    state.pinchStartScale = state.viewScale;
    const centerScreen = { clientX: (a.clientX + b.clientX) / 2, clientY: (a.clientY + b.clientY) / 2 };
    state.pinchStartCenterScreen = centerScreen;
    state.pinchStartWorldCenter = screenToWorld(centerScreen);
  }

  // Middle mouse or pan tool: start panning instead of drawing
  if (e.button === 1 || state.tool === "pan") {
    state.isPanning = true;
    state.panStart = { x: e.clientX, y: e.clientY };
    state.panOrigin = { x: state.viewOffsetX, y: state.viewOffsetY };
    emitCursor();
    state.sc.setPointerCapture(e.pointerId);
    return;
  }

  const { x, y } = toCanvasPoint(e);
  state.isPointerDown = true;
  state.lastPointer = { x, y };
  if (state.tool === "pen") {
    state.lastDrawPoint = [x, y];
    state.pointsBuffer.push([x, y]);
    if (state.selfId) {
      state.activeStrokes.set(state.selfId, { type: "pen", color: state.color, points: [[x, y]] });
      requestRender();
    }
    startDrawInterval();
  } else if (state.tool === "rect") {
    if (state.selfId) {
      state.activeStrokes.set(state.selfId, { type: "rect", color: state.color, points: [[x, y]] });
      requestRender();
    }
  } else if (state.tool === "circle") {
    if (state.selfId) {
      state.activeStrokes.set(state.selfId, { type: "circle", color: state.color, points: [[x, y]] });
      requestRender();
    }
  } else if (state.tool === "select" || state.tool === "eraser") {
    handleSelectAtPoint(x, y);
  }
  emitCursor();
  state.sc.setPointerCapture(e.pointerId);
}

export function onPointerMove(e) {
  if (!state.username) return;
  if (e.cancelable) e.preventDefault();

  // Update pointer record for pinch zooming
  if (state.activePointers.has(e.pointerId)) {
    const rec = state.activePointers.get(e.pointerId);
    rec.clientX = e.clientX;
    rec.clientY = e.clientY;
    state.activePointers.set(e.pointerId, rec);
  }

  // Pinch zoom with two pointers
  if (state.isPinchZooming && state.activePointers.size >= 2) {
    const [a, b] = Array.from(state.activePointers.values());
    const newDist = distance(a, b);
    const scale = state.pinchStartScale * (newDist / Math.max(1, state.pinchStartDistance));
    setScaleAroundWorldPoint(scale, state.pinchStartWorldCenter, state.pinchStartCenterScreen);
    return;
  }

  if (state.isPanning) {
    // Update view offsets by raw screen deltas
    const dx = e.clientX - state.panStart.x;
    const dy = e.clientY - state.panStart.y;
    state.viewOffsetX = state.panOrigin.x + dx;
    state.viewOffsetY = state.panOrigin.y + dy;
    requestRender();
    return;
  }

  const coalesced = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : null;
  const eventsToProcess = coalesced && coalesced.length ? coalesced : [e];

  for (const ev of eventsToProcess) {
    const { x, y } = toCanvasPoint(ev);
    state.lastPointer = { x, y };
    if (state.isPointerDown) {
      if (state.tool === "pen") {
        state.pointsBuffer.push([x, y]);
        if (state.selfId) {
          const entry = state.activeStrokes.get(state.selfId) || { type: "pen", color: state.color, points: [] };
          if (state.lastDrawPoint && entry.points.length === 0) {
            entry.points.push(state.lastDrawPoint);
          }
          entry.points.push([x, y]);
          entry.color = state.color;
          state.activeStrokes.set(state.selfId, entry);
          requestRender();
        }
        state.lastDrawPoint = [x, y];
        if (state.pointsBuffer.length > 64) {
          socket.emit("draw", { points: state.pointsBuffer.splice(0, state.pointsBuffer.length) });
        }
      } else if (state.tool === "rect") {
        if (state.selfId) {
          const entry = state.activeStrokes.get(state.selfId) || { type: "rect", color: state.color, points: [] };
          const [sx, sy] = entry.points[0] || [x, y];
          entry.points = [[sx, sy], [x, y]];
          entry.color = state.color;
          state.activeStrokes.set(state.selfId, entry);
          requestRender();
        }
      } else if (state.tool === "circle") {
        if (state.selfId) {
          const entry = state.activeStrokes.get(state.selfId) || { type: "circle", color: state.color, points: [] };
          const [cx0, cy0] = entry.points[0] || [x, y];
          entry.points = [[cx0, cy0], [x, y]];
          entry.color = state.color;
          state.activeStrokes.set(state.selfId, entry);
          requestRender();
        }
      }
    }
  }
  emitCursor();
}

export function onPointerUp(e) {
  if (!state.username) return;
  if (e.cancelable) e.preventDefault();
  // Remove from active pointer set
  if (state.activePointers.has(e.pointerId)) {
    state.activePointers.delete(e.pointerId);
  }
  if (state.isPinchZooming && state.activePointers.size < 2) {
    state.isPinchZooming = false;
  }

  if (state.isPanning && (e.button === 1 || state.tool === "pan")) {
    state.isPanning = false;
    return;
  }
  const { x, y } = toCanvasPoint(e);
  state.isPointerDown = false;
  state.lastPointer = { x, y };
  state.lastDrawPoint = null;
  if (state.tool === "pen") {
    if (state.pointsBuffer.length > 0) {
      socket.emit("draw", { points: state.pointsBuffer.splice(0, state.pointsBuffer.length) });
    }
    stopDrawInterval();
    emitCursor();
    const entry = state.activeStrokes.get(state.selfId);
    if (entry && entry.points.length > 1) {
      const shape = {
        id: `${state.selfId}:${Date.now()}:pen:${Math.random().toString(36).slice(2,8)}`,
        userId: state.selfId,
        username: state.username,
        color: state.color,
        type: "pen",
        data: { points: entry.points },
      };
      state.undoStack.push({ type: 'add', shape });
      state.redoStack.length = 0;
      socket.emit("shapeAdd", { id: shape.id, type: shape.type, data: shape.data, color: shape.color });
    }
    if (state.selfId) state.activeStrokes.delete(state.selfId);
    requestRender();
    socket.emit("drawEnd");
  } else if (state.tool === "rect") {
    const entry = state.activeStrokes.get(state.selfId);
    if (entry && entry.points.length === 2) {
      const [start, end] = entry.points;
      const x0 = Math.min(start[0], end[0]);
      const y0 = Math.min(start[1], end[1]);
      const w = Math.abs(end[0] - start[0]);
      const h = Math.abs(end[1] - start[1]);
      if (w >= 1 && h >= 1) {
        const shape = {
          id: `${state.selfId}:${Date.now()}:rect:${Math.random().toString(36).slice(2,8)}`,
          userId: state.selfId,
          username: state.username,
          color: state.color,
          type: "rect",
          data: { x: x0, y: y0, w, h },
        };
        state.undoStack.push({ type: 'add', shape });
        state.redoStack.length = 0;
        socket.emit("shapeAdd", { id: shape.id, type: shape.type, data: shape.data, color: shape.color });
      }
    }
    if (state.selfId) state.activeStrokes.delete(state.selfId);
    requestRender();
  } else if (state.tool === "circle") {
    const entry = state.activeStrokes.get(state.selfId);
    if (entry && entry.points.length === 2) {
      const [center, edge] = entry.points;
      const rx = Math.abs(edge[0] - center[0]);
      const ry = Math.abs(edge[1] - center[1]);
      if (rx >= 1 && ry >= 1) {
        const shape = {
          id: `${state.selfId}:${Date.now()}:circle:${Math.random().toString(36).slice(2,8)}`,
          userId: state.selfId,
          username: state.username,
          color: state.color,
          type: "circle",
          data: { cx: center[0], cy: center[1], rx, ry },
        };
        state.undoStack.push({ type: 'add', shape });
        state.redoStack.length = 0;
        socket.emit("shapeAdd", { id: shape.id, type: shape.type, data: shape.data, color: shape.color });
      }
    }
    if (state.selfId) state.activeStrokes.delete(state.selfId);
    requestRender();
  }
}

export function onWheelZoom(e) {
  // Zoom with Ctrl+wheel, trackpad pinch maps to wheel with ctrlKey on many browsers
  if (!e.ctrlKey) return;
  e.preventDefault();
  const delta = -e.deltaY; // up = zoom in
  const zoomFactor = Math.exp(delta * 0.0015);
  const worldPoint = screenToWorld({ clientX: e.clientX, clientY: e.clientY });
  const newScale = state.viewScale * zoomFactor;
  setScaleAroundWorldPoint(newScale, worldPoint, { clientX: e.clientX, clientY: e.clientY });
}

function pointToSegmentDistance(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const ab2 = abx * abx + aby * aby || 1e-6;
  let t = (apx * abx + apy * aby) / ab2;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + t * abx;
  const qy = ay + t * aby;
  const dx = px - qx;
  const dy = py - qy;
  return Math.sqrt(dx * dx + dy * dy);
}

function handleSelectAtPoint(x, y) {
  const entries = Array.from(state.allShapes.values());
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const s = entries[i];
    if (s.userId !== state.selfId) continue;
    if (s.type === "rect") {
      if (x >= s.data.x && y >= s.data.y && x <= s.data.x + s.data.w && y <= s.data.y + s.data.h) {
        socket.emit("shapeDelete", { id: s.id });
        return;
      }
    } else if (s.type === "circle") {
      const dx = (x - s.data.cx) / s.data.rx;
      const dy = (y - s.data.cy) / s.data.ry;
      if ((dx * dx + dy * dy) <= 1) {
        socket.emit("shapeDelete", { id: s.id });
        return;
      }
    } else if (s.type === "pen") {
      const pts = s.data.points;
      const threshold = 6;
      for (let j = 1; j < pts.length; j += 1) {
        const ax = pts[j - 1][0];
        const ay = pts[j - 1][1];
        const bx = pts[j][0];
        const by = pts[j][1];
        const dist = pointToSegmentDistance(x, y, ax, ay, bx, by);
        if (dist <= threshold) {
          socket.emit("shapeDelete", { id: s.id });
          return;
        }
      }
    }
  }
}


