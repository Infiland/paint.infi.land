import { state } from "./state.js";
import { clearStrokesCanvas, clearCursorsCanvas, applyTransforms } from "./canvas.js";

function catmullRomSpline(points, alpha = 0.5, resolution = 8) {
  if (!points || points.length < 3) return points || [];
  const pts = points.map(p => ({ x: p[0], y: p[1] }));
  const result = [];
  for (let i = -1; i < pts.length - 2; i += 1) {
    const p0 = pts[Math.max(i, 0)];
    const p1 = pts[Math.max(i + 1, 0)];
    const p2 = pts[Math.min(i + 2, pts.length - 1)];
    const p3 = pts[Math.min(i + 3, pts.length - 1)];
    for (let j = 0; j <= resolution; j += 1) {
      const t = j / (resolution + 1);
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
  result.unshift(points[0]);
  result.push(points[points.length - 1]);
  return result;
}

// Render cache: id -> { path: Path2D, bbox: {x,y,w,h}, cacheForSmoothing: boolean, type: string }
const renderCache = new Map();
let lastSmoothingFlag = state.smoothingEnabled;

function computePenCache(points) {
  const pts = state.smoothingEnabled ? catmullRomSpline(points) : points;
  const path = new Path2D();
  if (pts.length === 1) {
    const [x, y] = pts[0];
    path.moveTo(x, y);
    path.lineTo(x + 0.001, y + 0.001);
  } else {
    path.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i += 1) path.lineTo(pts[i][0], pts[i][1]);
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p[0] < minX) minX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] > maxY) maxY = p[1];
  }
  const margin = 3; // line width
  const bbox = { x: minX - margin, y: minY - margin, w: (maxX - minX) + margin * 2, h: (maxY - minY) + margin * 2 };
  return { path, bbox, cacheForSmoothing: state.smoothingEnabled, type: 'pen' };
}

function computeRectCache(x, y, w, h) {
  const path = new Path2D();
  path.rect(x, y, w, h);
  const minX = Math.min(x, x + w);
  const minY = Math.min(y, y + h);
  const maxX = Math.max(x, x + w);
  const maxY = Math.max(y, y + h);
  const margin = 3;
  const bbox = { x: minX - margin, y: minY - margin, w: (maxX - minX) + margin * 2, h: (maxY - minY) + margin * 2 };
  return { path, bbox, cacheForSmoothing: state.smoothingEnabled, type: 'rect' };
}

function computeCircleCache(cx, cy, rx, ry) {
  const path = new Path2D();
  path.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  const margin = 3;
  const bbox = { x: cx - rx - margin, y: cy - ry - margin, w: rx * 2 + margin * 2, h: ry * 2 + margin * 2 };
  return { path, bbox, cacheForSmoothing: state.smoothingEnabled, type: 'circle' };
}

function getShapeCache(shape) {
  const existing = renderCache.get(shape.id);
  if (existing && existing.cacheForSmoothing === state.smoothingEnabled) return existing;
  let created = null;
  if (shape.type === 'pen') created = computePenCache(shape.data.points);
  else if (shape.type === 'rect') created = computeRectCache(shape.data.x, shape.data.y, shape.data.w, shape.data.h);
  else if (shape.type === 'circle') created = computeCircleCache(shape.data.cx, shape.data.cy, shape.data.rx, shape.data.ry);
  if (created) renderCache.set(shape.id, created);
  return created;
}

function getWorldViewport() {
  const scale = state.viewScale || 1;
  const x = -state.viewOffsetX / scale;
  const y = -state.viewOffsetY / scale;
  const w = state.width / scale;
  const h = state.height / scale;
  // Expand by margin of a few world units to avoid popping at edges
  const pad = 8;
  return { x: x - pad, y: y - pad, w: w + pad * 2, h: h + pad * 2 };
}

function rectsIntersect(a, b) {
  return a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;
}

export function invalidateShapeCache(id) {
  if (id) renderCache.delete(id);
}

export function invalidateAllShapeCache() {
  renderCache.clear();
}

export function drawSegment(points, strokeColor) {
  if (!points || points.length < 2) return;
  const pts = state.smoothingEnabled ? catmullRomSpline(points) : points;
  const ctx = state.sctx;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = strokeColor || state.color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i += 1) {
    ctx.lineTo(pts[i][0], pts[i][1]);
  }
  ctx.stroke();
  ctx.restore();
}

export function drawDot(point, dotColor) {
  if (!point) return;
  const ctx = state.sctx;
  ctx.save();
  ctx.fillStyle = dotColor || state.color;
  ctx.beginPath();
  ctx.arc(point[0], point[1], 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawShape(shape) {
  const ctx = state.sctx;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 3;
  ctx.strokeStyle = shape.color;
  if (shape.type === "pen") {
    drawSegment(shape.data.points, shape.color);
  } else if (shape.type === "rect") {
    ctx.strokeRect(shape.data.x, shape.data.y, shape.data.w, shape.data.h);
  } else if (shape.type === "circle") {
    ctx.beginPath();
    ctx.ellipse(shape.data.cx, shape.data.cy, shape.data.rx, shape.data.ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawShapeCachedIfVisible(shape, viewport) {
  const ctx = state.sctx;
  const cache = getShapeCache(shape);
  if (!cache) return;
  if (!rectsIntersect(cache.bbox, viewport)) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 3;
  ctx.strokeStyle = shape.color;
  ctx.stroke(cache.path);
  ctx.restore();
}

export function drawAllShapes() {
  const viewport = getWorldViewport();
  // Ensure smoothing cache matches flag
  if (lastSmoothingFlag !== state.smoothingEnabled) {
    invalidateAllShapeCache();
    lastSmoothingFlag = state.smoothingEnabled;
  }
  // Prune cache entries for deleted shapes occasionally
  if (renderCache.size > state.allShapes.size) {
    for (const key of renderCache.keys()) {
      if (!state.allShapes.has(key)) renderCache.delete(key);
    }
  }
  for (const [, shape] of state.allShapes) {
    drawShapeCachedIfVisible(shape, viewport);
  }
}

export function drawCursor({ x, y, color, username }) {
  const ctx = state.cctx;
  ctx.save();
  ctx.fillStyle = color || "#00e5ff";
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fill();
  if (username) {
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillStyle = "#fff";
    ctx.fillText(username, x + 8, y - 8);
  }
  ctx.restore();
}

let renderReq = null;
export function requestRender() {
  if (renderReq) return;
  renderReq = requestAnimationFrame(() => {
    renderReq = null;
    applyTransforms();
    clearStrokesCanvas();
    drawAllShapes();
    for (const [, entry] of state.activeStrokes) {
      if (!entry || !entry.points || entry.points.length === 0) continue;
      if (entry.type === "rect" && entry.points.length === 2) {
        const [a, b] = entry.points;
        const x = Math.min(a[0], b[0]);
        const y = Math.min(a[1], b[1]);
        const w = Math.abs(b[0] - a[0]);
        const h = Math.abs(b[1] - a[1]);
        state.sctx.save();
        state.sctx.strokeStyle = entry.color;
        state.sctx.lineWidth = 3;
        state.sctx.strokeRect(x, y, w, h);
        state.sctx.restore();
        continue;
      }
      if (entry.type === "circle" && entry.points.length === 2) {
        const [c, e] = entry.points;
        const rx = Math.abs(e[0] - c[0]);
        const ry = Math.abs(e[1] - c[1]);
        state.sctx.save();
        state.sctx.strokeStyle = entry.color;
        state.sctx.lineWidth = 3;
        state.sctx.beginPath();
        state.sctx.ellipse(c[0], c[1], rx, ry, 0, 0, Math.PI * 2);
        state.sctx.stroke();
        state.sctx.restore();
        continue;
      }
      if (entry.points.length === 1) drawDot(entry.points[0], entry.color);
      else drawSegment(entry.points, entry.color);
    }
  });
}

export function renderCursors() {
  clearCursorsCanvas();
  for (const [, cur] of state.remoteCursors) {
    if (typeof cur.x === "number" && typeof cur.y === "number") {
      drawCursor(cur);
    }
  }
}


