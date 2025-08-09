export function generateRandomColor() {
  // Prefer bright-ish colors; avoid very dark
  const h = Math.floor(Math.random() * 360);
  const s = 70 + Math.floor(Math.random() * 20); // 70–90%
  const l = 50 + Math.floor(Math.random() * 10); // 50–60%
  // Convert HSL to hex
  const hex = hslToHex(h, s, l);
  return hex;
}

function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = x => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

export const state = {
  username: null,
  color: generateRandomColor(),
  tool: "pen", // 'pen' | 'rect' | 'circle' | 'select' | 'eraser' | 'pan'
  selfId: null,

  isPointerDown: false,
  lastPointer: { x: 0, y: 0 },
  lastDrawPoint: null, // [x, y]

  width: 0,
  height: 0,
  DPR: Math.max(1, Math.min(window.devicePixelRatio || 1, 2)),

  // Viewport transform (panning; scaling)
  viewOffsetX: 0,
  viewOffsetY: 0,
  viewScale: 1,
  minScale: 0.3,
  maxScale: 6,
  isPanning: false,
  panStart: { x: 0, y: 0 }, // screen coords at pan start
  panOrigin: { x: 0, y: 0 }, // offset at pan start

  // Pinch-zoom
  activePointers: new Map(), // pointerId -> { clientX, clientY }
  isPinchZooming: false,
  pinchStartDistance: 0,
  pinchStartScale: 1,
  pinchStartCenterScreen: { x: 0, y: 0 },
  pinchStartWorldCenter: { x: 0, y: 0 },

  pointsBuffer: [],
  drawIntervalId: null,
  localCursorFrameReq: null,

  // Maps
  activeStrokes: new Map(), // userId -> { color, points: [[x,y], ...] }
  allShapes: new Map(), // shapeId -> { id, userId, username, color, type, data }
  remoteCursors: new Map(), // socketId -> { x, y, down, username, color }

  // Undo/Redo stacks (only for local user's actions)
  // Each entry: { type: 'add' | 'delete', shape: { id, userId, username, color, type, data } }
  undoStack: [],
  redoStack: [],

  // Rendering options
  smoothingEnabled: true,
};


