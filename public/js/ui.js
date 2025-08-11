import { state } from "./state.js";
import { socket } from "./socket.js";

export function setupUI({ joinOverlay, joinForm, usernameInput, colorInput, toolbar, colorPicker }) {
  joinForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = usernameInput.value.trim().slice(0, 20);
    const col = colorInput.value;
    if (!name) return;
    state.username = name;
    state.color = col;
    try { localStorage.setItem('rp_username', state.username); } catch (_) {}
    socket.emit("join", { username: state.username, color: state.color });
    if (colorPicker) colorPicker.value = state.color;
    joinOverlay.style.display = "none";
    socket.emit("requestState");
  });

  // Persist username as the user types so it's reused on refresh
  if (usernameInput && typeof usernameInput.addEventListener === 'function') {
    usernameInput.addEventListener('input', (e) => {
      try {
        const val = String(e.target.value || '').slice(0, 20);
        localStorage.setItem('rp_username', val);
      } catch (_) {}
    });
  }

  if (toolbar) {
    toolbar.addEventListener("click", (e) => {
      const el = e.target.closest?.(".tool-btn");
      if (!el) return;
      const t = el.getAttribute("data-tool");
      if (!t) return;
      state.tool = t;
      for (const btn of toolbar.querySelectorAll(".tool-btn")) btn.classList.remove("active");
      el.classList.add("active");
    });
  }

  // Optional toggle: press 'S' to toggle smoothing
  window.addEventListener("keydown", (e) => {
    const key = typeof e.key === "string" ? e.key.toLowerCase() : "";
    if (key === 's' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      state.smoothingEnabled = !state.smoothingEnabled;
      import('./render.js').then(mod => {
        if (typeof mod.invalidateAllShapeCache === 'function') mod.invalidateAllShapeCache();
        if (typeof mod.requestRender === 'function') mod.requestRender();
      }).catch(() => {});
    }
  });

  if (colorPicker) {
    colorPicker.addEventListener("input", (e) => {
      const val = e.target.value;
      state.color = val;
      socket.emit("updateColor", { color: val });
    });
  }
}

export function setupViewControls({ zoomInBtn, zoomOutBtn, resetViewBtn }) {
  const have = (el) => el && typeof el.addEventListener === 'function';
  if (have(zoomInBtn)) {
    zoomInBtn.addEventListener('click', () => {
      const centerScreen = { clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 };
      const worldX = (centerScreen.clientX - state.viewOffsetX) / state.viewScale;
      const worldY = (centerScreen.clientY - state.viewOffsetY) / state.viewScale;
      const newScale = Math.min(state.maxScale, state.viewScale * 1.2);
      state.viewOffsetX = centerScreen.clientX - worldX * newScale;
      state.viewOffsetY = centerScreen.clientY - worldY * newScale;
      state.viewScale = newScale;
      window.dispatchEvent(new Event('resize'));
    });
  }
  if (have(zoomOutBtn)) {
    zoomOutBtn.addEventListener('click', () => {
      const centerScreen = { clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 };
      const worldX = (centerScreen.clientX - state.viewOffsetX) / state.viewScale;
      const worldY = (centerScreen.clientY - state.viewOffsetY) / state.viewScale;
      const newScale = Math.max(state.minScale, state.viewScale / 1.2);
      state.viewOffsetX = centerScreen.clientX - worldX * newScale;
      state.viewOffsetY = centerScreen.clientY - worldY * newScale;
      state.viewScale = newScale;
      window.dispatchEvent(new Event('resize'));
    });
  }
  if (have(resetViewBtn)) {
    resetViewBtn.addEventListener('click', () => {
      state.viewScale = 1;
      state.viewOffsetX = 0;
      state.viewOffsetY = 0;
      window.dispatchEvent(new Event('resize'));
    });
  }
}


