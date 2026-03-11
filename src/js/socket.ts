import type { Socket } from "socket.io-client";
import {
  DEFAULT_FALLBACK_STROKE_COLOR,
  type ClientToServerEvents,
  type CursorPayload,
  type ServerToClientEvents,
} from "../shared/protocol.js";
import { invalidateAllShapeCache, invalidateShapeCache, renderCursors, requestRender } from "./render.js";
import { state } from "./state.js";
import { publishUiError, requestUiSync } from "./ui-events.js";

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io();

function isOwnSocket(socketId: string): boolean {
  return Boolean(state.selfId && socketId === state.selfId);
}

function upsertRemoteCursor(payload: CursorPayload): void {
  const existing = state.remoteCursors.get(payload.id);

  state.remoteCursors.set(payload.id, {
    username: payload.username || existing?.username || "Guest",
    color: payload.color || existing?.color || DEFAULT_FALLBACK_STROKE_COLOR,
    x: payload.x,
    y: payload.y,
    down: Boolean(payload.down),
  });
}

export function setupSocketHandlers(): void {
  socket.on("connect", () => {
    state.selfId = socket.id ?? null;

    if (state.selfId) {
      state.remoteCursors.delete(state.selfId);
    }

    if (state.username) {
      socket.emit("join", { username: state.username, color: state.color });
      socket.emit("requestState");
    }

    requestUiSync();
  });

  socket.on("disconnect", () => {
    state.selfId = null;
    requestUiSync();
  });

  socket.on("errorMessage", ({ message }) => {
    publishUiError(message);
  });

  socket.on("presence", (message) => {
    if (message.type === "join") {
      if (isOwnSocket(message.id)) {
        requestUiSync();
        return;
      }

      state.remoteCursors.set(message.id, {
        username: message.username,
        color: message.color,
        x: null,
        y: null,
        down: false,
      });
    } else {
      state.remoteCursors.delete(message.id);
    }

    renderCursors();
    requestUiSync();
  });

  socket.on("cursor", (payload) => {
    if (isOwnSocket(payload.id)) {
      return;
    }

    upsertRemoteCursor(payload);
    renderCursors();
    requestUiSync();
  });

  socket.on("draw", (stroke) => {
    const entry = state.activeStrokes.get(stroke.id) ?? {
      type: "pen" as const,
      color: stroke.color,
      points: [],
    };

    if (stroke.points.length > 0) {
      entry.points.push(...stroke.points);
      entry.color = stroke.color || entry.color;
      state.activeStrokes.set(stroke.id, entry);
      requestRender();
    }
  });

  socket.on("drawEnd", ({ id }) => {
    state.activeStrokes.delete(id);
    requestRender();
  });

  socket.on("state", ({ cursors, shapes }) => {
    state.activeStrokes.clear();
    state.allShapes.clear();
    invalidateAllShapeCache();

    for (const shape of shapes) {
      state.allShapes.set(shape.id, shape);
    }

    state.remoteCursors.clear();
    for (const cursor of cursors) {
      if (isOwnSocket(cursor.id)) {
        continue;
      }

      upsertRemoteCursor(cursor);
    }

    requestRender();
    renderCursors();
    requestUiSync();
  });

  socket.on("shapeAdd", (shape) => {
    state.allShapes.set(shape.id, shape);
    invalidateShapeCache(shape.id);
    requestRender();
  });

  socket.on("shapeDelete", ({ id }) => {
    state.allShapes.delete(id);
    invalidateShapeCache(id);
    requestRender();
  });

  socket.on("removeUserShapes", ({ id }) => {
    let needsRender = false;

    for (const [shapeId, shape] of Array.from(state.allShapes.entries())) {
      if (shape.userId !== id) {
        continue;
      }

      state.allShapes.delete(shapeId);
      invalidateShapeCache(shapeId);
      needsRender = true;
    }

    if (needsRender) {
      requestRender();
    }
  });
}

export function emitCursor(): void {
  if (state.localCursorFrameReq || !socket.connected) {
    return;
  }

  state.localCursorFrameReq = window.requestAnimationFrame(() => {
    state.localCursorFrameReq = null;
    socket.volatile.emit("cursor", {
      x: state.lastPointer.x,
      y: state.lastPointer.y,
      down: state.isPointerDown,
    });
  });
}

export function startDrawInterval(): void {
  if (state.drawIntervalId) {
    return;
  }

  state.drawIntervalId = window.setInterval(() => {
    if (state.pointsBuffer.length === 0) {
      return;
    }

    socket.emit("draw", { points: state.pointsBuffer.splice(0, state.pointsBuffer.length) });
  }, 40);
}

export function stopDrawInterval(): void {
  if (!state.drawIntervalId) {
    return;
  }

  window.clearInterval(state.drawIntervalId);
  state.drawIntervalId = null;
}
