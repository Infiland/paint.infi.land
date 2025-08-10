"use strict";

require('dotenv').config();

const path = require("path");const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  // In production, restrict origins to your domain(s)
  cors: { origin: true, methods: ["GET", "POST"] },
});

const PORT = process.env.PORT || 3000;

// Serve static client files
app.use(express.static(path.join(__dirname, "public")));

// In-memory state (session-persistent while users are connected)
// Allow longer pen strokes before truncation. This guards memory while avoiding visible truncation.
const MAX_STROKE_POINTS = 8192; // max points per stroke or incoming segment
/** @type {Map<string, {username:string, color:string, x:number|null, y:number|null, down:boolean, lastUpdate:number}>} */
const cursorsBySocketId = new Map();
/** @type {Map<string, Array<{id:string, userId:string, username:string, color:string, type:'pen'|'rect'|'circle', data:any, timestamp:number}>>} */
const shapesBySocketId = new Map();

let nextShapeSeq = 0;

function generateShapeId(socketId) {
  nextShapeSeq = (nextShapeSeq + 1) % Number.MAX_SAFE_INTEGER;
  return `${socketId}:${nowMs()}:${nextShapeSeq}`;
}

function getAllShapes() {
  const all = [];
  for (const [userId, arr] of shapesBySocketId.entries()) {
    for (const s of arr) all.push(s);
  }
  return all;
}

const nowMs = () => Date.now();

function sanitizeUsername(input) {
  if (typeof input !== "string") return null;
  const trimmed = input.trim().slice(0, 20);
  if (trimmed.length < 1) return null;
  // Allow letters, numbers, space, underscore, hyphen, dot
  return trimmed.replace(/[^\w \-.]/g, "");
}

function isValidColor(color) {
  if (typeof color !== "string") return false;
  const hex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
  const rgb = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/;
  return hex.test(color) || rgb.test(color);
}

function clampPoints(points) {
  if (!Array.isArray(points)) return [];
  const safe = [];
  for (let i = 0; i < points.length && i < MAX_STROKE_POINTS; i += 1) {
    const p = points[i];
    if (!Array.isArray(p) || p.length < 2) continue;
    const x = Number(p[0]);
    const y = Number(p[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    safe.push([x, y]);
  }
  return safe;
}

function createRateLimiter(maxEventsPerInterval, intervalMs) {
  let tokens = maxEventsPerInterval;
  let last = nowMs();
  return function allow() {
    const t = nowMs();
    const elapsed = t - last;
    last = t;
    tokens += (elapsed / intervalMs) * maxEventsPerInterval;
    if (tokens > maxEventsPerInterval) tokens = maxEventsPerInterval;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
}

io.on("connection", (socket) => {
  const allowCursor = createRateLimiter(600, 10_000); // ~60/sec
  const allowDraw = createRateLimiter(400, 10_000); // ~40/sec

  socket.on("join", (payload) => {
    const username = sanitizeUsername(payload?.username);
    const color = payload?.color && isValidColor(payload.color) ? payload.color : "#00e5ff";
    if (!username) {
      socket.emit("errorMessage", { message: "Invalid username" });
      socket.disconnect(true);
      return;
    }
    socket.data.username = username;
    socket.data.color = color;
    cursorsBySocketId.set(socket.id, {
      username,
      color,
      x: null,
      y: null,
      down: false,
      lastUpdate: nowMs(),
    });
    io.emit("presence", { type: "join", id: socket.id, username, color });
  });

  socket.on("cursor", (payload) => {
    if (!allowCursor()) return; // drop if client is too chatty
    const username = socket.data.username;
    const color = socket.data.color;
    if (!username) return;

    const x = Number(payload?.x);
    const y = Number(payload?.y);
    const down = Boolean(payload?.down);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    cursorsBySocketId.set(socket.id, {
      username,
      color,
      x,
      y,
      down,
      lastUpdate: nowMs(),
    });

    // volatile: drop frames under backpressure vs enqueue
    socket.broadcast.volatile.emit("cursor", {
      id: socket.id,
      x,
      y,
      down,
      username,
      color,
    });
  });

  socket.on("draw", (payload) => {
    if (!allowDraw()) return;
    const username = socket.data.username;
    const color = socket.data.color || "#00e5ff";
    if (!username) return;

    const points = clampPoints(payload?.points);
    if (points.length === 0) return;

    // Broadcast ephemeral draw segment to others
    socket.broadcast.emit("draw", {
      id: socket.id,
      username,
      color,
      points,
    });
  });

  socket.on("drawEnd", () => {
    const username = socket.data.username;
    if (!username) return;
    socket.broadcast.emit("drawEnd", { id: socket.id });
  });

  socket.on("shapeAdd", (payload) => {
    const username = socket.data.username;
    let color = socket.data.color || "#00e5ff";
    if (payload?.color && isValidColor(payload.color)) {
      color = payload.color;
    }
    if (!username) return;
    const type = payload?.type;
    let shapeData = null;
    if (type === "pen") {
      const points = clampPoints(payload?.data?.points);
      if (points.length < 2) return;
      shapeData = { points };
    } else if (type === "rect") {
      const x = Number(payload?.data?.x);
      const y = Number(payload?.data?.y);
      const w = Number(payload?.data?.w);
      const h = Number(payload?.data?.h);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) return;
      if (Math.abs(w) < 1 || Math.abs(h) < 1) return;
      shapeData = { x, y, w, h };
    } else if (type === "circle") {
      const cx = Number(payload?.data?.cx);
      const cy = Number(payload?.data?.cy);
      const rx = Number(payload?.data?.rx);
      const ry = Number(payload?.data?.ry);
      if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(rx) || !Number.isFinite(ry)) return;
      if (Math.abs(rx) < 1 || Math.abs(ry) < 1) return;
      shapeData = { cx, cy, rx, ry };
    } else {
      return;
    }

    const providedId = typeof payload?.id === "string" && payload.id.length > 3 ? payload.id : null;
    const shape = {
      id: providedId || generateShapeId(socket.id),
      userId: socket.id,
      username,
      color,
      type,
      data: shapeData,
      timestamp: nowMs(),
    };
    const list = shapesBySocketId.get(socket.id) || [];
    list.push(shape);
    shapesBySocketId.set(socket.id, list);
    io.emit("shapeAdd", shape);
  });

  socket.on("shapeDelete", (payload) => {
    const shapeId = payload?.id;
    if (typeof shapeId !== "string" || shapeId.length < 3) return;
    const list = shapesBySocketId.get(socket.id);
    if (!list || list.length === 0) return;
    const idx = list.findIndex((s) => s.id === shapeId);
    if (idx === -1) return;
    const [removed] = list.splice(idx, 1);
    shapesBySocketId.set(socket.id, list);
    io.emit("shapeDelete", { id: removed.id });
  });

  socket.on("updateColor", (payload) => {
    const newColor = payload?.color;
    if (!isValidColor(newColor)) return;
    socket.data.color = newColor;
    const cur = cursorsBySocketId.get(socket.id);
    if (cur) {
      cur.color = newColor;
      cur.lastUpdate = nowMs();
      cursorsBySocketId.set(socket.id, cur);
    }
  });

  socket.on("requestState", () => {
    const cursors = Array.from(cursorsBySocketId.entries()).map(([id, cur]) => ({
      id,
      username: cur.username,
      color: cur.color,
      x: cur.x,
      y: cur.y,
      down: cur.down,
    }));
    const shapes = getAllShapes();
    socket.emit("state", { cursors, shapes });
  });

  socket.on("disconnect", () => {
    cursorsBySocketId.delete(socket.id);
    io.emit("presence", { type: "leave", id: socket.id });
    if (shapesBySocketId.has(socket.id)) {
      shapesBySocketId.delete(socket.id);
      io.emit("removeUserShapes", { id: socket.id });
    }
  });
});

httpServer.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Realtime Draw server listening on http://localhost:${PORT}`);
});


