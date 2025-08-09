import { state } from "./state.js";

export function setupCanvases(strokesCanvas, cursorsCanvas, onResizeRender) {
  state.sc = strokesCanvas;
  state.cc = cursorsCanvas;
  state.sctx = strokesCanvas.getContext("2d");
  state.cctx = cursorsCanvas.getContext("2d");
  resize();
  if (typeof onResizeRender === "function") {
    onResizeRender();
  }
  window.addEventListener("resize", () => {
    resize();
    if (typeof onResizeRender === "function") {
      onResizeRender();
    }
  });
}

export function resize() {
  state.width = Math.floor(window.innerWidth);
  state.height = Math.floor(window.innerHeight);
  const { width, height, DPR } = state;
  for (const canvas of [state.sc, state.cc]) {
    canvas.width = Math.floor(width * DPR);
    canvas.height = Math.floor(height * DPR);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
  }
  applyTransforms();
}

export function clearStrokesCanvas() {
  const ctx = state.sctx;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, state.sc.width, state.sc.height);
  ctx.restore();
}

export function clearCursorsCanvas() {
  const ctx = state.cctx;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, state.cc.width, state.cc.height);
  ctx.restore();
}

export function applyTransforms() {
  const { DPR } = state;
  const scale = Math.max(state.minScale, Math.min(state.viewScale, state.maxScale));
  state.viewScale = scale;
  const { viewOffsetX, viewOffsetY } = state;
  state.sctx.setTransform(DPR * scale, 0, 0, DPR * scale, DPR * viewOffsetX, DPR * viewOffsetY);
  state.cctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}


