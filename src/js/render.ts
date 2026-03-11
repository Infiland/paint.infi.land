import type { Point, Shape, ShapeType } from "../shared/protocol.js";
import { applyTransforms, clearCursorsCanvas, clearStrokesCanvas } from "./canvas.js";
import { state, type ActiveStroke } from "./state.js";

interface Viewport {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ShapeRenderCache {
  path: Path2D | null;
  bbox: Viewport;
  cacheForSmoothing: boolean;
  type: ShapeType;
}

const STROKE_WIDTH = 3;
const TEXT_FONT_FAMILY = "system-ui, -apple-system, sans-serif";

const renderCache = new Map<string, ShapeRenderCache>();

let renderReq: number | null = null;
let lastSmoothingFlag = state.smoothingEnabled;

function catmullRomSpline(points: Point[], alpha = 0.5, resolution = 8): Point[] {
  if (points.length < 3) {
    return points;
  }

  const pts = points.map(([x, y]) => ({ x, y }));
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];

  if (!firstPoint || !lastPoint) {
    return points;
  }

  const result: Point[] = [];

  for (let index = -1; index < pts.length - 2; index += 1) {
    const p0 = (pts[Math.max(index, 0)] ?? pts[0])!;
    const p1 = (pts[Math.max(index + 1, 0)] ?? pts[0])!;
    const p2 = (pts[Math.min(index + 2, pts.length - 1)] ?? pts[pts.length - 1])!;
    const p3 = (pts[Math.min(index + 3, pts.length - 1)] ?? pts[pts.length - 1])!;

    for (let step = 0; step <= resolution; step += 1) {
      const t = step / (resolution + 1);
      const t2 = t * t;
      const t3 = t2 * t;
      const a0 = -alpha * t + 2 * alpha * t2 - alpha * t3;
      const a1 = 1 + (alpha - 3) * t2 + (2 - alpha) * t3;
      const a2 = alpha * t + (3 - 2 * alpha) * t2 + (alpha - 2) * t3;
      const a3 = -alpha * t2 + alpha * t3;
      const x = a0 * p0.x + a1 * p1.x + a2 * p2.x + a3 * p3.x;
      const y = a0 * p0.y + a1 * p1.y + a2 * p2.y + a3 * p3.y;

      result.push([x, y]);
    }
  }

  result.unshift(firstPoint);
  result.push(lastPoint);

  return result;
}

function getWorldViewport(): Viewport {
  const scale = state.viewScale || 1;
  const x = -state.viewOffsetX / scale;
  const y = -state.viewOffsetY / scale;
  const w = state.width / scale;
  const h = state.height / scale;
  const pad = 24;

  return {
    x: x - pad,
    y: y - pad,
    w: w + pad * 2,
    h: h + pad * 2,
  };
}

function rectsIntersect(a: Viewport, b: Viewport): boolean {
  return a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;
}

function computePenCache(points: Point[]): ShapeRenderCache | null {
  if (points.length === 0) {
    return null;
  }

  const pts = state.smoothingEnabled ? catmullRomSpline(points) : points;
  const path = new Path2D();
  const firstPoint = pts[0];

  if (!firstPoint) {
    return null;
  }

  if (pts.length === 1) {
    path.moveTo(firstPoint[0], firstPoint[1]);
    path.lineTo(firstPoint[0] + 0.001, firstPoint[1] + 0.001);
  } else {
    path.moveTo(firstPoint[0], firstPoint[1]);
    for (let index = 1; index < pts.length; index += 1) {
      const point = pts[index];
      if (!point) {
        continue;
      }

      path.lineTo(point[0], point[1]);
    }
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const [x, y] of pts) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  const margin = STROKE_WIDTH;

  return {
    path,
    bbox: {
      x: minX - margin,
      y: minY - margin,
      w: maxX - minX + margin * 2,
      h: maxY - minY + margin * 2,
    },
    cacheForSmoothing: state.smoothingEnabled,
    type: "pen",
  };
}

function computeRectCache(x: number, y: number, w: number, h: number): ShapeRenderCache {
  const path = new Path2D();
  path.rect(x, y, w, h);

  const minX = Math.min(x, x + w);
  const minY = Math.min(y, y + h);
  const maxX = Math.max(x, x + w);
  const maxY = Math.max(y, y + h);
  const margin = STROKE_WIDTH;

  return {
    path,
    bbox: {
      x: minX - margin,
      y: minY - margin,
      w: maxX - minX + margin * 2,
      h: maxY - minY + margin * 2,
    },
    cacheForSmoothing: state.smoothingEnabled,
    type: "rect",
  };
}

function computeCircleCache(cx: number, cy: number, rx: number, ry: number): ShapeRenderCache {
  const path = new Path2D();
  path.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);

  const margin = STROKE_WIDTH;

  return {
    path,
    bbox: {
      x: cx - rx - margin,
      y: cy - ry - margin,
      w: rx * 2 + margin * 2,
      h: ry * 2 + margin * 2,
    },
    cacheForSmoothing: state.smoothingEnabled,
    type: "circle",
  };
}

function computeTextCache(x: number, y: number, text: string, fontSize: number): ShapeRenderCache | null {
  if (!text) {
    return null;
  }

  // We measure text width using an offscreen approach. The canvas context is
  // available as state.sctx but might have transforms applied; we save/restore.
  const context = state.sctx;
  if (!context) {
    return null;
  }

  context.save();
  context.font = `500 ${fontSize}px ${TEXT_FONT_FAMILY}`;
  const lines = text.split("\n");
  const lineHeight = fontSize * 1.4;
  let maxWidth = 0;
  for (const line of lines) {
    maxWidth = Math.max(maxWidth, context.measureText(line).width);
  }
  context.restore();

  const totalHeight = lines.length * lineHeight;
  const margin = 4;

  return {
    path: null, // text shapes don't use Path2D
    bbox: {
      x: x - margin,
      y: y - margin,
      w: maxWidth + margin * 2,
      h: totalHeight + margin * 2,
    },
    cacheForSmoothing: state.smoothingEnabled,
    type: "text",
  };
}

function getShapeCache(shape: Shape): ShapeRenderCache | null {
  const existing = renderCache.get(shape.id);
  if (existing && existing.cacheForSmoothing === state.smoothingEnabled) {
    return existing;
  }

  let created: ShapeRenderCache | null = null;
  if (shape.type === "pen") {
    created = computePenCache(shape.data.points);
  } else if (shape.type === "rect") {
    created = computeRectCache(shape.data.x, shape.data.y, shape.data.w, shape.data.h);
  } else if (shape.type === "circle") {
    created = computeCircleCache(shape.data.cx, shape.data.cy, shape.data.rx, shape.data.ry);
  } else if (shape.type === "text") {
    created = computeTextCache(shape.data.x, shape.data.y, shape.data.text, shape.data.fontSize);
  }

  if (created) {
    renderCache.set(shape.id, created);
  }

  return created;
}

function drawShapePreview(entry: ActiveStroke): void {
  const context = state.sctx;
  if (!context || entry.points.length === 0) {
    return;
  }

  if (entry.type === "rect" && entry.points.length === 2) {
    const [start, end] = entry.points;
    if (!start || !end) {
      return;
    }

    const x = Math.min(start[0], end[0]);
    const y = Math.min(start[1], end[1]);
    const w = Math.abs(end[0] - start[0]);
    const h = Math.abs(end[1] - start[1]);

    context.save();
    context.globalAlpha = 0.08;
    context.fillStyle = entry.color;
    context.fillRect(x, y, w, h);
    context.restore();

    context.save();
    context.strokeStyle = entry.color;
    context.lineWidth = STROKE_WIDTH;
    context.setLineDash([10 / Math.max(state.viewScale, 0.5), 8 / Math.max(state.viewScale, 0.5)]);
    context.strokeRect(x, y, w, h);
    context.restore();
    return;
  }

  if (entry.type === "circle" && entry.points.length === 2) {
    const [center, edge] = entry.points;
    if (!center || !edge) {
      return;
    }

    const rx = Math.abs(edge[0] - center[0]);
    const ry = Math.abs(edge[1] - center[1]);

    context.save();
    context.globalAlpha = 0.08;
    context.fillStyle = entry.color;
    context.beginPath();
    context.ellipse(center[0], center[1], rx, ry, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();

    context.save();
    context.strokeStyle = entry.color;
    context.lineWidth = STROKE_WIDTH;
    context.setLineDash([10 / Math.max(state.viewScale, 0.5), 8 / Math.max(state.viewScale, 0.5)]);
    context.beginPath();
    context.ellipse(center[0], center[1], rx, ry, 0, 0, Math.PI * 2);
    context.stroke();
    context.restore();
    return;
  }

  if (entry.points.length === 1) {
    drawDot(entry.points[0], entry.color);
    return;
  }

  drawSegment(entry.points, entry.color);
}

export function invalidateShapeCache(id: string): void {
  renderCache.delete(id);
}

export function invalidateAllShapeCache(): void {
  renderCache.clear();
}

export function drawSegment(points: Point[], strokeColor: string): void {
  const context = state.sctx;
  if (!context || points.length === 0) {
    return;
  }

  if (points.length === 1) {
    drawDot(points[0], strokeColor);
    return;
  }

  const pts = state.smoothingEnabled ? catmullRomSpline(points) : points;
  const firstPoint = pts[0];

  if (!firstPoint) {
    return;
  }

  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = strokeColor;
  context.lineWidth = STROKE_WIDTH;
  context.beginPath();
  context.moveTo(firstPoint[0], firstPoint[1]);

  for (let index = 1; index < pts.length; index += 1) {
    const point = pts[index];
    if (!point) {
      continue;
    }

    context.lineTo(point[0], point[1]);
  }

  context.stroke();
  context.restore();
}

export function drawDot(point: Point | undefined, dotColor: string): void {
  const context = state.sctx;
  if (!context || !point) {
    return;
  }

  context.save();
  context.fillStyle = dotColor;
  context.beginPath();
  context.arc(point[0], point[1], STROKE_WIDTH * 0.6, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawShapeCachedIfVisible(shape: Shape, viewport: Viewport): void {
  const context = state.sctx;
  if (!context) {
    return;
  }

  const cache = getShapeCache(shape);
  if (!cache || !rectsIntersect(cache.bbox, viewport)) {
    return;
  }

  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  if (shape.type === "text") {
    const lines = shape.data.text.split("\n");
    const lineHeight = shape.data.fontSize * 1.4;

    context.font = `500 ${shape.data.fontSize}px ${TEXT_FONT_FAMILY}`;
    context.fillStyle = shape.color;
    context.textBaseline = "top";

    for (const [index, line] of lines.entries()) {
      context.fillText(line, shape.data.x, shape.data.y + index * lineHeight);
    }
  } else if (cache.path) {
    context.lineWidth = STROKE_WIDTH;
    context.strokeStyle = shape.color;
    context.stroke(cache.path);
  }
  context.restore();
}

function drawAllShapes(viewport: Viewport): void {
  if (lastSmoothingFlag !== state.smoothingEnabled) {
    invalidateAllShapeCache();
    lastSmoothingFlag = state.smoothingEnabled;
  }

  if (renderCache.size > state.allShapes.size) {
    for (const cachedShapeId of renderCache.keys()) {
      if (!state.allShapes.has(cachedShapeId)) {
        renderCache.delete(cachedShapeId);
      }
    }
  }

  for (const shape of state.allShapes.values()) {
    drawShapeCachedIfVisible(shape, viewport);
  }
}

export function drawCursor({ x, y, color, username }: { x: number; y: number; color: string; username: string }): void {
  const context = state.cctx;
  if (!context) {
    return;
  }

  context.save();

  // Small filled cursor dot
  context.fillStyle = color;
  context.beginPath();
  context.arc(x, y, 4, 0, Math.PI * 2);
  context.fill();

  // Simple text label offset from the dot
  context.font = "500 12px system-ui, -apple-system, sans-serif";
  const label = username.slice(0, 20);
  const labelX = x + 10;
  const labelY = y - 10;

  context.fillStyle = color;
  context.fillText(label, labelX, labelY);
  context.restore();
}

export function requestRender(): void {
  if (renderReq) {
    return;
  }

  renderReq = window.requestAnimationFrame(() => {
    renderReq = null;

    applyTransforms();
    clearStrokesCanvas();
    const viewport = getWorldViewport();
    drawAllShapes(viewport);

    for (const entry of state.activeStrokes.values()) {
      drawShapePreview(entry);
    }

    renderCursors();
  });
}

export function renderCursors(): void {
  clearCursorsCanvas();

  const scale = state.viewScale || 1;
  const offsetX = state.viewOffsetX || 0;
  const offsetY = state.viewOffsetY || 0;

  for (const cursor of state.remoteCursors.values()) {
    if (typeof cursor.x !== "number" || typeof cursor.y !== "number") {
      continue;
    }

    drawCursor({
      x: cursor.x * scale + offsetX,
      y: cursor.y * scale + offsetY,
      color: cursor.color,
      username: cursor.username,
    });
  }
}
