import { clampScale, state } from "./state.js";

export const THEME_STORAGE_KEY = "paint:theme";

export type Theme = "light" | "dark";

let currentTheme: Theme = "light";

export function getTheme(): Theme {
  return currentTheme;
}

export function getCanvasBgColor(): string {
  return currentTheme === "dark" ? "#121212" : "#ffffff";
}

export function setTheme(theme: Theme): void {
  currentTheme = theme;
  if (theme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage issues.
  }
}

export function initTheme(): void {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    // Ignore.
  }

  if (stored === "dark" || stored === "light") {
    currentTheme = stored;
  } else {
    currentTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  // Ensure the DOM attribute is in sync (the inline script in index.html
  // already sets it before first paint, but this keeps JS state consistent).
  if (currentTheme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

export function setupCanvases(
  strokesCanvas: HTMLCanvasElement,
  cursorsCanvas: HTMLCanvasElement,
  onResizeRender?: () => void,
): void {
  const strokesContext = strokesCanvas.getContext("2d");
  const cursorsContext = cursorsCanvas.getContext("2d");

  if (!strokesContext || !cursorsContext) {
    throw new Error("Canvas 2D context is not available.");
  }

  state.sc = strokesCanvas;
  state.cc = cursorsCanvas;
  state.sctx = strokesContext;
  state.cctx = cursorsContext;

  resizeCanvases();
  onResizeRender?.();

  window.addEventListener("resize", () => {
    resizeCanvases();
    onResizeRender?.();
  });
}

export function resizeCanvases(): void {
  if (!state.sc || !state.cc) {
    return;
  }

  state.width = Math.floor(window.innerWidth);
  state.height = Math.floor(window.innerHeight);
  state.devicePixelRatio = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));

  for (const canvas of [state.sc, state.cc]) {
    canvas.width = Math.floor(state.width * state.devicePixelRatio);
    canvas.height = Math.floor(state.height * state.devicePixelRatio);
    canvas.style.width = `${state.width}px`;
    canvas.style.height = `${state.height}px`;
  }

  applyTransforms();
}

export function clearStrokesCanvas(): void {
  const context = state.sctx;
  const canvas = state.sc;

  if (!context || !canvas) {
    return;
  }

  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.fillStyle = getCanvasBgColor();
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.restore();
}

export function clearCursorsCanvas(): void {
  const context = state.cctx;
  const canvas = state.cc;

  if (!context || !canvas) {
    return;
  }

  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.restore();
}

export function applyTransforms(): void {
  const strokesContext = state.sctx;
  const cursorsContext = state.cctx;

  if (!strokesContext || !cursorsContext) {
    return;
  }

  state.viewScale = clampScale(state.viewScale);

  strokesContext.setTransform(
    state.devicePixelRatio * state.viewScale,
    0,
    0,
    state.devicePixelRatio * state.viewScale,
    state.devicePixelRatio * state.viewOffsetX,
    state.devicePixelRatio * state.viewOffsetY,
  );
  cursorsContext.setTransform(state.devicePixelRatio, 0, 0, state.devicePixelRatio, 0, 0);
}
