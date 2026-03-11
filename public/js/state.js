import { DEFAULT_FALLBACK_STROKE_COLOR, } from "../shared/protocol.js";
export const USERNAME_STORAGE_KEY = "paint:username";
export function clampScale(nextScale) {
    return Math.max(state.minScale, Math.min(nextScale, state.maxScale));
}
export function getParticipantCount() {
    return state.username ? state.remoteCursors.size + 1 : state.remoteCursors.size;
}
export function createLocalShapeId(type) {
    const entropy = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID().slice(0, 8)
        : Math.random().toString(36).slice(2, 10);
    return `${state.selfId ?? "local"}:${Date.now()}:${type}:${entropy}`;
}
export function createPlayfulUsernameSuggestion() {
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
export function generateRandomColor() {
    const hue = Math.floor(Math.random() * 360);
    const saturation = 68 + Math.floor(Math.random() * 22);
    const lightness = 52 + Math.floor(Math.random() * 10);
    return hslToHex(hue, saturation, lightness);
}
function hslToHex(hue, saturation, lightness) {
    const s = saturation / 100;
    const l = lightness / 100;
    const k = (index) => (index + hue / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (index) => l - a * Math.max(-1, Math.min(k(index) - 3, Math.min(9 - k(index), 1)));
    const toHex = (value) => Math.round(value * 255).toString(16).padStart(2, "0");
    return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}
export const state = {
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
    activePointers: new Map(),
    isPinchZooming: false,
    pinchStartDistance: 0,
    pinchStartScale: 1,
    pinchStartCenterScreen: { clientX: 0, clientY: 0 },
    pinchStartWorldCenter: { x: 0, y: 0 },
    pointsBuffer: [],
    drawIntervalId: null,
    localCursorFrameReq: null,
    activeStrokes: new Map(),
    allShapes: new Map(),
    remoteCursors: new Map(),
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
//# sourceMappingURL=state.js.map