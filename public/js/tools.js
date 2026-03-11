import { requestRender } from "./render.js";
import { emitCursor, socket, startDrawInterval, stopDrawInterval } from "./socket.js";
import { clampScale, createLocalShapeId, state } from "./state.js";
import { requestUiSync } from "./ui-events.js";
const TEXT_FONT_SIZE = 20;
const TEXT_FONT_FAMILY = "system-ui, -apple-system, sans-serif";
const TEXT_LINE_HEIGHT_RATIO = 1.4;
function resizeTextEditor(editor) {
    editor.style.width = "1px";
    editor.style.height = "1px";
    editor.style.width = `${Math.max(2, editor.scrollWidth)}px`;
    editor.style.height = `${Math.max(TEXT_FONT_SIZE * TEXT_LINE_HEIGHT_RATIO, editor.scrollHeight)}px`;
}
function toCanvasPoint(pointer) {
    return {
        x: (pointer.clientX - state.viewOffsetX) / state.viewScale,
        y: (pointer.clientY - state.viewOffsetY) / state.viewScale,
    };
}
function distance(a, b) {
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}
function screenToWorld(pointer) {
    return {
        x: (pointer.clientX - state.viewOffsetX) / state.viewScale,
        y: (pointer.clientY - state.viewOffsetY) / state.viewScale,
    };
}
function setScaleAroundWorldPoint(newScale, worldPoint, screenPoint) {
    const clampedScale = clampScale(newScale);
    state.viewOffsetX = screenPoint.clientX - worldPoint.x * clampedScale;
    state.viewOffsetY = screenPoint.clientY - worldPoint.y * clampedScale;
    state.viewScale = clampedScale;
    requestRender();
    requestUiSync();
}
function commitLocalShape(shape) {
    state.undoStack.push({ type: "add", shape });
    state.redoStack.length = 0;
    socket.emit("shapeAdd", { id: shape.id, type: shape.type, data: shape.data, color: shape.color });
}
function clearActiveTextEditor(editor) {
    if (state.textEditor === editor) {
        state.textEditor = null;
        state.textEditWorldX = null;
        state.textEditWorldY = null;
    }
    editor.remove();
}
export function commitActiveTextEditor() {
    const editor = state.textEditor;
    const worldX = state.textEditWorldX;
    const worldY = state.textEditWorldY;
    if (!editor) {
        return;
    }
    const text = editor.value.replace(/\r/g, "");
    clearActiveTextEditor(editor);
    if (!state.selfId || !state.username || worldX === null || worldY === null || text.trim().length === 0) {
        requestRender();
        return;
    }
    commitLocalShape({
        id: createLocalShapeId("text"),
        userId: state.selfId,
        username: state.username,
        color: state.color,
        type: "text",
        data: { x: worldX, y: worldY, text, fontSize: TEXT_FONT_SIZE },
        timestamp: Date.now(),
    });
    requestRender();
}
function discardActiveTextEditor() {
    const editor = state.textEditor;
    if (!editor) {
        return;
    }
    clearActiveTextEditor(editor);
    requestRender();
}
function startTextEditing(screenX, screenY, worldX, worldY) {
    commitActiveTextEditor();
    const editor = document.createElement("textarea");
    let finalized = false;
    editor.className = "text-editor";
    editor.cols = 1;
    editor.rows = 1;
    editor.wrap = "off";
    editor.spellcheck = false;
    editor.value = "";
    editor.style.left = `${screenX}px`;
    editor.style.top = `${screenY}px`;
    editor.style.color = state.color;
    editor.style.caretColor = state.color;
    editor.style.font = `500 ${TEXT_FONT_SIZE}px ${TEXT_FONT_FAMILY}`;
    editor.style.lineHeight = `${TEXT_FONT_SIZE * TEXT_LINE_HEIGHT_RATIO}px`;
    editor.addEventListener("input", () => {
        resizeTextEditor(editor);
    });
    const finalize = (shouldCommit) => {
        if (finalized) {
            return;
        }
        finalized = true;
        if (shouldCommit) {
            commitActiveTextEditor();
        }
        else {
            discardActiveTextEditor();
        }
    };
    editor.addEventListener("blur", () => {
        finalize(true);
    });
    editor.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            finalize(true);
            return;
        }
        if (event.key === "Escape") {
            event.preventDefault();
            finalize(false);
        }
    });
    document.body.append(editor);
    state.textEditor = editor;
    state.textEditWorldX = worldX;
    state.textEditWorldY = worldY;
    resizeTextEditor(editor);
    editor.focus();
}
function pointToSegmentDistance(px, py, ax, ay, bx, by) {
    const abx = bx - ax;
    const aby = by - ay;
    const apx = px - ax;
    const apy = py - ay;
    const ab2 = abx * abx + aby * aby || 1e-6;
    let t = (apx * abx + apy * aby) / ab2;
    t = Math.max(0, Math.min(1, t));
    const qx = ax + t * abx;
    const qy = ay + t * aby;
    const dx = px - qx;
    const dy = py - qy;
    return Math.sqrt(dx * dx + dy * dy);
}
function deleteShape(shape) {
    state.undoStack.push({ type: "delete", shape });
    state.redoStack.length = 0;
    socket.emit("shapeDelete", { id: shape.id });
}
function handleEraseAtPoint(x, y) {
    const shapes = Array.from(state.allShapes.values());
    for (let index = shapes.length - 1; index >= 0; index -= 1) {
        const shape = shapes[index];
        if (!shape || shape.userId !== state.selfId) {
            continue;
        }
        if (shape.type === "rect") {
            if (x >= shape.data.x && y >= shape.data.y && x <= shape.data.x + shape.data.w && y <= shape.data.y + shape.data.h) {
                deleteShape(shape);
                return;
            }
            continue;
        }
        if (shape.type === "circle") {
            const dx = (x - shape.data.cx) / shape.data.rx;
            const dy = (y - shape.data.cy) / shape.data.ry;
            if (dx * dx + dy * dy <= 1) {
                deleteShape(shape);
                return;
            }
            continue;
        }
        if (shape.type === "text") {
            const context = state.sctx;
            if (!context) {
                continue;
            }
            context.save();
            context.font = `500 ${shape.data.fontSize}px ${TEXT_FONT_FAMILY}`;
            const lines = shape.data.text.split("\n");
            const width = lines.reduce((maxWidth, line) => Math.max(maxWidth, context.measureText(line).width), 0);
            context.restore();
            const height = lines.length * shape.data.fontSize * TEXT_LINE_HEIGHT_RATIO;
            if (x >= shape.data.x && y >= shape.data.y && x <= shape.data.x + width && y <= shape.data.y + height) {
                deleteShape(shape);
                return;
            }
            continue;
        }
        const threshold = 6;
        for (let pointIndex = 1; pointIndex < shape.data.points.length; pointIndex += 1) {
            const from = shape.data.points[pointIndex - 1];
            const to = shape.data.points[pointIndex];
            if (!from || !to) {
                continue;
            }
            if (pointToSegmentDistance(x, y, from[0], from[1], to[0], to[1]) <= threshold) {
                deleteShape(shape);
                return;
            }
        }
    }
}
export function onPointerDown(event) {
    if (!state.username) {
        return;
    }
    if (event.cancelable) {
        event.preventDefault();
    }
    state.activePointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
    if (state.activePointers.size === 2) {
        const pointers = Array.from(state.activePointers.values());
        const first = pointers[0];
        const second = pointers[1];
        if (first && second) {
            state.isPinchZooming = true;
            state.pinchStartDistance = distance(first, second);
            state.pinchStartScale = state.viewScale;
            state.pinchStartCenterScreen = {
                clientX: (first.clientX + second.clientX) / 2,
                clientY: (first.clientY + second.clientY) / 2,
            };
            state.pinchStartWorldCenter = screenToWorld(state.pinchStartCenterScreen);
        }
    }
    if (event.button === 1 || state.tool === "pan") {
        state.isPanning = true;
        state.panStart = { x: event.clientX, y: event.clientY };
        state.panOrigin = { x: state.viewOffsetX, y: state.viewOffsetY };
        emitCursor();
        state.sc?.setPointerCapture(event.pointerId);
        return;
    }
    const { x, y } = toCanvasPoint(event);
    state.lastPointer = { x, y };
    if (state.tool === "text") {
        state.isPointerDown = false;
        startTextEditing(event.clientX, event.clientY, x, y);
        emitCursor();
        return;
    }
    state.isPointerDown = true;
    if (state.tool === "pen") {
        state.lastDrawPoint = [x, y];
        state.pointsBuffer.push([x, y]);
        if (state.selfId) {
            state.activeStrokes.set(state.selfId, { type: "pen", color: state.color, points: [[x, y]] });
            requestRender();
        }
        startDrawInterval();
    }
    else if (state.tool === "rect") {
        if (state.selfId) {
            state.activeStrokes.set(state.selfId, { type: "rect", color: state.color, points: [[x, y]] });
            requestRender();
        }
    }
    else if (state.tool === "circle") {
        if (state.selfId) {
            state.activeStrokes.set(state.selfId, { type: "circle", color: state.color, points: [[x, y]] });
            requestRender();
        }
    }
    else if (state.tool === "eraser") {
        handleEraseAtPoint(x, y);
    }
    emitCursor();
    state.sc?.setPointerCapture(event.pointerId);
}
export function onPointerMove(event) {
    if (!state.username) {
        return;
    }
    if (event.cancelable) {
        event.preventDefault();
    }
    const activePointer = state.activePointers.get(event.pointerId);
    if (activePointer) {
        activePointer.clientX = event.clientX;
        activePointer.clientY = event.clientY;
        state.activePointers.set(event.pointerId, activePointer);
    }
    if (state.isPinchZooming && state.activePointers.size >= 2) {
        const pointers = Array.from(state.activePointers.values());
        const first = pointers[0];
        const second = pointers[1];
        if (first && second) {
            const nextDistance = distance(first, second);
            const nextScale = state.pinchStartScale * (nextDistance / Math.max(1, state.pinchStartDistance));
            setScaleAroundWorldPoint(nextScale, state.pinchStartWorldCenter, state.pinchStartCenterScreen);
            return;
        }
    }
    if (state.isPanning) {
        state.viewOffsetX = state.panOrigin.x + (event.clientX - state.panStart.x);
        state.viewOffsetY = state.panOrigin.y + (event.clientY - state.panStart.y);
        requestRender();
        return;
    }
    const eventsToProcess = event.getCoalescedEvents?.() ?? [event];
    for (const pointerEvent of eventsToProcess) {
        const { x, y } = toCanvasPoint(pointerEvent);
        state.lastPointer = { x, y };
        if (!state.isPointerDown) {
            continue;
        }
        if (state.tool === "pen") {
            state.pointsBuffer.push([x, y]);
            if (state.selfId) {
                const entry = state.activeStrokes.get(state.selfId) ?? { type: "pen", color: state.color, points: [] };
                if (state.lastDrawPoint && entry.points.length === 0) {
                    entry.points.push(state.lastDrawPoint);
                }
                entry.points.push([x, y]);
                entry.color = state.color;
                state.activeStrokes.set(state.selfId, entry);
                requestRender();
            }
            state.lastDrawPoint = [x, y];
            if (state.pointsBuffer.length > 64) {
                socket.emit("draw", { points: state.pointsBuffer.splice(0, state.pointsBuffer.length) });
            }
            continue;
        }
        if (!state.selfId) {
            continue;
        }
        if (state.tool === "rect" || state.tool === "circle") {
            const entry = state.activeStrokes.get(state.selfId) ?? { type: state.tool, color: state.color, points: [] };
            const origin = entry.points[0] ?? [x, y];
            entry.points = [origin, [x, y]];
            entry.color = state.color;
            state.activeStrokes.set(state.selfId, entry);
            requestRender();
        }
    }
    emitCursor();
}
export function onPointerUp(event) {
    if (!state.username) {
        return;
    }
    if (event.cancelable) {
        event.preventDefault();
    }
    state.activePointers.delete(event.pointerId);
    if (state.isPinchZooming && state.activePointers.size < 2) {
        state.isPinchZooming = false;
    }
    if (state.isPanning && (event.button === 1 || state.tool === "pan")) {
        state.isPanning = false;
        return;
    }
    const { x, y } = toCanvasPoint(event);
    state.isPointerDown = false;
    state.lastPointer = { x, y };
    state.lastDrawPoint = null;
    if (state.tool === "pen") {
        if (state.pointsBuffer.length > 0) {
            socket.emit("draw", { points: state.pointsBuffer.splice(0, state.pointsBuffer.length) });
        }
        stopDrawInterval();
        emitCursor();
        if (state.selfId) {
            const entry = state.activeStrokes.get(state.selfId);
            if (entry && entry.points.length > 0 && state.username) {
                commitLocalShape({
                    id: createLocalShapeId("pen"),
                    userId: state.selfId,
                    username: state.username,
                    color: state.color,
                    type: "pen",
                    data: { points: entry.points },
                    timestamp: Date.now(),
                });
            }
            state.activeStrokes.delete(state.selfId);
        }
        requestRender();
        socket.emit("drawEnd");
        return;
    }
    if (!state.selfId || !state.username) {
        return;
    }
    if (state.tool === "rect") {
        const entry = state.activeStrokes.get(state.selfId);
        if (entry && entry.points.length === 2) {
            const [start, end] = entry.points;
            if (start && end) {
                const rectX = Math.min(start[0], end[0]);
                const rectY = Math.min(start[1], end[1]);
                const rectWidth = Math.abs(end[0] - start[0]);
                const rectHeight = Math.abs(end[1] - start[1]);
                if (rectWidth >= 1 && rectHeight >= 1) {
                    commitLocalShape({
                        id: createLocalShapeId("rect"),
                        userId: state.selfId,
                        username: state.username,
                        color: state.color,
                        type: "rect",
                        data: { x: rectX, y: rectY, w: rectWidth, h: rectHeight },
                        timestamp: Date.now(),
                    });
                }
            }
        }
        state.activeStrokes.delete(state.selfId);
        requestRender();
        return;
    }
    if (state.tool === "circle") {
        const entry = state.activeStrokes.get(state.selfId);
        if (entry && entry.points.length === 2) {
            const [center, edge] = entry.points;
            if (center && edge) {
                const rx = Math.abs(edge[0] - center[0]);
                const ry = Math.abs(edge[1] - center[1]);
                if (rx >= 1 && ry >= 1) {
                    commitLocalShape({
                        id: createLocalShapeId("circle"),
                        userId: state.selfId,
                        username: state.username,
                        color: state.color,
                        type: "circle",
                        data: { cx: center[0], cy: center[1], rx, ry },
                        timestamp: Date.now(),
                    });
                }
            }
        }
        state.activeStrokes.delete(state.selfId);
        requestRender();
    }
}
export function onWheelZoom(event) {
    if (!event.ctrlKey) {
        return;
    }
    event.preventDefault();
    const zoomFactor = Math.exp(-event.deltaY * 0.0015);
    const worldPoint = screenToWorld({ clientX: event.clientX, clientY: event.clientY });
    setScaleAroundWorldPoint(state.viewScale * zoomFactor, worldPoint, {
        clientX: event.clientX,
        clientY: event.clientY,
    });
}
//# sourceMappingURL=tools.js.map