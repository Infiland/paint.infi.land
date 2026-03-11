import "dotenv/config";

import path from "node:path";
import { createServer } from "node:http";
import express from "express";
import { Server, type Socket } from "socket.io";

import {
  DEFAULT_FALLBACK_STROKE_COLOR,
  type CircleShape,
  type ClientToServerEvents,
  type CursorSnapshot,
  type DrawRequest,
  type InterServerEvents,
  type PenShape,
  type Point,
  type RectShape,
  type ServerToClientEvents,
  type Shape,
  type ShapeAddRequest,
  type SocketSessionData,
  type TextShape,
} from "./shared/protocol.js";

type CursorRecord = CursorSnapshot & { lastUpdate: number };
type RealtimeSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketSessionData>;

const MAX_STROKE_POINTS = 8192;
const app = express();
const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketSessionData>(httpServer, {
  cors: { origin: true, methods: ["GET", "POST"] },
});

const publicDirectory = path.join(__dirname, "..", "public");
const port = Number.parseInt(process.env.PORT ?? "3000", 10) || 3000;
const buildTime = process.env.BUILD_TIME ?? new Date().toISOString();

const cursorsBySocketId = new Map<string, CursorRecord>();
const shapesBySocketId = new Map<string, Shape[]>();

let nextShapeSeq = 0;

function nowMs(): number {
  return Date.now();
}

function generateShapeId(socketId: string): string {
  nextShapeSeq = (nextShapeSeq + 1) % Number.MAX_SAFE_INTEGER;
  return `${socketId}:${nowMs()}:${nextShapeSeq}`;
}

function getAllShapes(): Shape[] {
  const shapes: Shape[] = [];
  for (const userShapes of shapesBySocketId.values()) {
    shapes.push(...userShapes);
  }
  return shapes;
}

function sanitizeUsername(input: unknown): string | null {
  if (typeof input !== "string") {
    return null;
  }

  const trimmed = input.trim().slice(0, 20);
  if (trimmed.length < 1) {
    return null;
  }

  return trimmed.replace(/[^\w \-.]/g, "");
}

function isValidColor(color: unknown): color is string {
  if (typeof color !== "string") {
    return false;
  }

  const hexColor = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
  const rgbColor = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/;

  return hexColor.test(color) || rgbColor.test(color);
}

function clampPoints(points: unknown): Point[] {
  if (!Array.isArray(points)) {
    return [];
  }

  const safePoints: Point[] = [];
  for (let index = 0; index < points.length && index < MAX_STROKE_POINTS; index += 1) {
    const point = points[index];
    if (!Array.isArray(point) || point.length < 2) {
      continue;
    }

    const x = Number(point[0]);
    const y = Number(point[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      continue;
    }

    safePoints.push([x, y]);
  }

  return safePoints;
}

function createRateLimiter(maxEventsPerInterval: number, intervalMs: number): () => boolean {
  let tokens = maxEventsPerInterval;
  let lastTimestamp = nowMs();

  return () => {
    const currentTimestamp = nowMs();
    const elapsed = currentTimestamp - lastTimestamp;
    lastTimestamp = currentTimestamp;
    tokens += (elapsed / intervalMs) * maxEventsPerInterval;
    tokens = Math.min(tokens, maxEventsPerInterval);

    if (tokens < 1) {
      return false;
    }

    tokens -= 1;
    return true;
  };
}

function buildShape(socket: RealtimeSocket, payload: ShapeAddRequest, username: string, color: string): Shape | null {
  const providedId = typeof payload.id === "string" && payload.id.length > 3 ? payload.id : null;
  const shapeId = providedId ?? generateShapeId(socket.id);
  const timestamp = nowMs();

  if (payload.type === "pen") {
    const points = clampPoints((payload.data as DrawRequest).points);
    if (points.length === 0) {
      return null;
    }

    const shape: PenShape = {
      id: shapeId,
      userId: socket.id,
      username,
      color,
      type: "pen",
      data: { points },
      timestamp,
    };

    return shape;
  }

  if (payload.type === "rect") {
    const x = Number((payload.data as RectShape["data"]).x);
    const y = Number((payload.data as RectShape["data"]).y);
    const w = Number((payload.data as RectShape["data"]).w);
    const h = Number((payload.data as RectShape["data"]).h);

    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) {
      return null;
    }

    if (Math.abs(w) < 1 || Math.abs(h) < 1) {
      return null;
    }

    const shape: RectShape = {
      id: shapeId,
      userId: socket.id,
      username,
      color,
      type: "rect",
      data: { x, y, w, h },
      timestamp,
    };

    return shape;
  }

  if (payload.type === "text") {
    const x = Number((payload.data as TextShape["data"]).x);
    const y = Number((payload.data as TextShape["data"]).y);
    const fontSize = Number((payload.data as TextShape["data"]).fontSize);
    const rawText = (payload.data as TextShape["data"]).text;
    const text = typeof rawText === "string" ? rawText.replace(/\r/g, "").slice(0, 2000) : "";

    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(fontSize) || fontSize <= 0) {
      return null;
    }

    if (text.trim().length === 0) {
      return null;
    }

    const shape: TextShape = {
      id: shapeId,
      userId: socket.id,
      username,
      color,
      type: "text",
      data: { x, y, text, fontSize },
      timestamp,
    };

    return shape;
  }

  const cx = Number((payload.data as CircleShape["data"]).cx);
  const cy = Number((payload.data as CircleShape["data"]).cy);
  const rx = Number((payload.data as CircleShape["data"]).rx);
  const ry = Number((payload.data as CircleShape["data"]).ry);

  if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(rx) || !Number.isFinite(ry)) {
    return null;
  }

  if (Math.abs(rx) < 1 || Math.abs(ry) < 1) {
    return null;
  }

  const shape: CircleShape = {
    id: shapeId,
    userId: socket.id,
    username,
    color,
    type: "circle",
    data: { cx, cy, rx, ry },
    timestamp,
  };

  return shape;
}

app.disable("x-powered-by");
app.use(
  express.static(publicDirectory, {
    maxAge: process.env.NODE_ENV === "production" ? "1h" : 0,
    setHeaders: (response, filePath) => {
      response.setHeader("X-Content-Type-Options", "nosniff");
      if (filePath.endsWith(".html")) {
        response.setHeader("Cache-Control", "no-store");
      }
    },
  }),
);

app.get("/meta.json", (_request, response) => {
  response.set("Cache-Control", "no-store");
  response.json({ buildTime });
});

io.on("connection", (socket) => {
  const allowCursor = createRateLimiter(600, 10_000);
  const allowDraw = createRateLimiter(400, 10_000);

  socket.on("join", (payload) => {
    const username = sanitizeUsername(payload?.username);
    const color = isValidColor(payload?.color) ? payload.color : DEFAULT_FALLBACK_STROKE_COLOR;

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
    if (!allowCursor()) {
      return;
    }

    const username = socket.data.username;
    const color = socket.data.color;
    if (!username || !color) {
      return;
    }

    const x = Number(payload?.x);
    const y = Number(payload?.y);
    const down = Boolean(payload?.down);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return;
    }

    cursorsBySocketId.set(socket.id, {
      username,
      color,
      x,
      y,
      down,
      lastUpdate: nowMs(),
    });

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
    if (!allowDraw()) {
      return;
    }

    const username = socket.data.username;
    const color = socket.data.color ?? DEFAULT_FALLBACK_STROKE_COLOR;
    if (!username) {
      return;
    }

    const points = clampPoints(payload?.points);
    if (points.length === 0) {
      return;
    }

    socket.broadcast.emit("draw", {
      id: socket.id,
      username,
      color,
      points,
    });
  });

  socket.on("drawEnd", () => {
    if (!socket.data.username) {
      return;
    }

    socket.broadcast.emit("drawEnd", { id: socket.id });
  });

  socket.on("shapeAdd", (payload) => {
    const username = socket.data.username;
    if (!username) {
      return;
    }

    const color = isValidColor(payload?.color) ? payload.color : socket.data.color ?? DEFAULT_FALLBACK_STROKE_COLOR;
    const shape = buildShape(socket, payload, username, color);
    if (!shape) {
      return;
    }

    const shapes = shapesBySocketId.get(socket.id) ?? [];
    shapes.push(shape);
    shapesBySocketId.set(socket.id, shapes);
    io.emit("shapeAdd", shape);
  });

  socket.on("shapeDelete", ({ id }) => {
    if (typeof id !== "string" || id.length < 3) {
      return;
    }

    const shapes = shapesBySocketId.get(socket.id);
    if (!shapes?.length) {
      return;
    }

    const shapeIndex = shapes.findIndex((shape) => shape.id === id);
    if (shapeIndex === -1) {
      return;
    }

    const [removedShape] = shapes.splice(shapeIndex, 1);
    if (!removedShape) {
      return;
    }

    shapesBySocketId.set(socket.id, shapes);
    io.emit("shapeDelete", { id: removedShape.id });
  });

  socket.on("updateColor", ({ color }) => {
    if (!isValidColor(color)) {
      return;
    }

    socket.data.color = color;
    const currentCursor = cursorsBySocketId.get(socket.id);
    if (!currentCursor) {
      return;
    }

    currentCursor.color = color;
    currentCursor.lastUpdate = nowMs();
    cursorsBySocketId.set(socket.id, currentCursor);
  });

  socket.on("requestState", () => {
    const cursors = Array.from(cursorsBySocketId.entries()).map(([id, cursor]) => ({
      id,
      username: cursor.username,
      color: cursor.color,
      x: cursor.x,
      y: cursor.y,
      down: cursor.down,
    }));

    socket.emit("state", {
      cursors,
      shapes: getAllShapes(),
    });
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

httpServer.listen(port, () => {
  console.log(`paint.infi.land listening on http://localhost:${port}`);
});
