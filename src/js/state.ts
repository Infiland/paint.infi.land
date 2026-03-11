import {
  DEFAULT_FALLBACK_STROKE_COLOR,
  type CursorSnapshot,
  type Point,
  type Shape,
  type ShapeType,
  type Tool,
  type UndoEntry,
} from "../shared/protocol.js";

export const USERNAME_STORAGE_KEY = "paint:username";

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface PointerSnapshot {
  clientX: number;
  clientY: number;
}

export interface ActiveStroke {
  type: ShapeType;
  color: string;
  points: Point[];
}

export interface AppState {
  username: string | null;
  color: string;
  tool: Tool;
  selfId: string | null;
  isPointerDown: boolean;
  lastPointer: ScreenPoint;
  lastDrawPoint: Point | null;
  width: number;
  height: number;
  devicePixelRatio: number;
  viewOffsetX: number;
  viewOffsetY: number;
  viewScale: number;
  minScale: number;
  maxScale: number;
  isPanning: boolean;
  panStart: ScreenPoint;
  panOrigin: ScreenPoint;
  activePointers: Map<number, PointerSnapshot>;
  isPinchZooming: boolean;
  pinchStartDistance: number;
  pinchStartScale: number;
  pinchStartCenterScreen: PointerSnapshot;
  pinchStartWorldCenter: ScreenPoint;
  pointsBuffer: Point[];
  drawIntervalId: number | null;
  localCursorFrameReq: number | null;
  activeStrokes: Map<string, ActiveStroke>;
  allShapes: Map<string, Shape>;
  remoteCursors: Map<string, CursorSnapshot>;
  undoStack: UndoEntry[];
  redoStack: UndoEntry[];
  smoothingEnabled: boolean;
  textEditor: HTMLTextAreaElement | null;
  textEditWorldX: number | null;
  textEditWorldY: number | null;
  sc: HTMLCanvasElement | null;
  cc: HTMLCanvasElement | null;
  sctx: CanvasRenderingContext2D | null;
  cctx: CanvasRenderingContext2D | null;
}

export function clampScale(nextScale: number): number {
  return Math.max(state.minScale, Math.min(nextScale, state.maxScale));
}

export function getParticipantCount(): number {
  return state.username ? state.remoteCursors.size + 1 : state.remoteCursors.size;
}

export function createLocalShapeId(type: ShapeType): string {
  const entropy =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);

  return `${state.selfId ?? "local"}:${Date.now()}:${type}:${entropy}`;
}

export function createPlayfulUsernameSuggestion(): string {
  const adjectives = [
    "Wobbly",
    "Sneaky",
    "Sparkly",
    "Witty",
    "Fuzzy",
    "Spicy",
    "Zany",
    "Chunky",
    "Quirky",
    "Bouncy",
    "Sassy",
    "Saucy",
    "Goofy",
    "Cheeky",
    "Wonky",
  ];
  const nouns = [
    "Brush",
    "Doodle",
    "Pixel",
    "Noodle",
    "Squiggle",
    "Muffin",
    "Banana",
    "Potato",
    "Pickle",
    "Taco",
    "Pancake",
    "Waffle",
    "Nugget",
    "Hamster",
    "Possum",
  ];

  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)] ?? "Curious";
  const noun = nouns[Math.floor(Math.random() * nouns.length)] ?? "Brush";
  const suffix = Math.floor(100 + Math.random() * 900);

  return `${adjective}${noun}${suffix}`.slice(0, 20);
}

export function generateRandomColor(): string {
  const hue = Math.floor(Math.random() * 360);
  const saturation = 68 + Math.floor(Math.random() * 22);
  const lightness = 52 + Math.floor(Math.random() * 10);

  return hslToHex(hue, saturation, lightness);
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const s = saturation / 100;
  const l = lightness / 100;
  const k = (index: number) => (index + hue / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (index: number) => l - a * Math.max(-1, Math.min(k(index) - 3, Math.min(9 - k(index), 1)));
  const toHex = (value: number) => Math.round(value * 255).toString(16).padStart(2, "0");

  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

export const state: AppState = {
  username: null,
  color: DEFAULT_FALLBACK_STROKE_COLOR || generateRandomColor(),
  tool: "pen",
  selfId: null,
  isPointerDown: false,
  lastPointer: { x: 0, y: 0 },
  lastDrawPoint: null,
  width: 0,
  height: 0,
  devicePixelRatio: Math.max(1, Math.min(window.devicePixelRatio || 1, 2)),
  viewOffsetX: 0,
  viewOffsetY: 0,
  viewScale: 1,
  minScale: 0.35,
  maxScale: 6,
  isPanning: false,
  panStart: { x: 0, y: 0 },
  panOrigin: { x: 0, y: 0 },
  activePointers: new Map<number, PointerSnapshot>(),
  isPinchZooming: false,
  pinchStartDistance: 0,
  pinchStartScale: 1,
  pinchStartCenterScreen: { clientX: 0, clientY: 0 },
  pinchStartWorldCenter: { x: 0, y: 0 },
  pointsBuffer: [],
  drawIntervalId: null,
  localCursorFrameReq: null,
  activeStrokes: new Map<string, ActiveStroke>(),
  allShapes: new Map<string, Shape>(),
  remoteCursors: new Map<string, CursorSnapshot>(),
  undoStack: [],
  redoStack: [],
  smoothingEnabled: true,
  textEditor: null,
  textEditWorldX: null,
  textEditWorldY: null,
  sc: null,
  cc: null,
  sctx: null,
  cctx: null,
};
