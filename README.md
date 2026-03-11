## paint.infi.land - Realtime Paint

![image](https://i.imgur.com/VFtddNq.jpeg)

A lightweight, real-time collaborative drawing app powered by Express, Socket.IO, and a strict TypeScript codebase. Draw with friends using pen, rectangle, and circle tools; pan and zoom around the canvas; undo or redo your actions; and see everyone’s cursors live.

## Features

![image](https://i.imgur.com/YidB9tv.jpeg)

- **Realtime collaboration**: Low-latency updates via WebSockets (Socket.IO), with live presence cursors.
- **Drawing tools**: Pen, Rectangle, Circle, and a simple Eraser (click near a shape you own to delete it).
- **Viewport controls**: Pan (middle mouse or Pan tool), pinch-to-zoom on touchpads, and Ctrl+wheel zoom.
- **Undo/Redo**: Ctrl+Z to undo, Ctrl+Shift+Z (or Ctrl+Y) to redo, scoped to your own actions.
- **Smoothing**: Toggle stroke smoothing with the S key.
- **Color picker**: Choose your stroke color; see it reflected in your cursor and shapes.
- **Mobile-friendly controls**: Quick zoom and reset buttons.

## Tech

- Node.js (>=18), Express, Socket.IO
- TypeScript + Canvas 2D API

## Requirements

- Node.js 16 or newer (18+ recommended)
- pnpm installed globally (`npm i -g pnpm`)

## Quick start (local)

1. Install dependencies
   ```sh
   pnpm install
   ```
2. Build the server and browser bundle
   ```sh
   pnpm build
   ```
3. Start the server (defaults to PORT 3000)
   ```sh
   pnpm start
   ```

4. Open the app
    - Visit `http://localhost:3000` (or your chosen port)
    - Enter a username and pick a color to join

## Project layout

- `src/server.ts`: typed Express and Socket.IO server
- `src/main.ts`: browser entrypoint
- `src/js/*.ts`: client modules for canvas, tools, rendering, socket, and UI
- `src/shared/protocol.ts`: shared runtime constants and socket payload types
- `public/index.html` and `public/styles.css`: static shell and styling

### How to use

- Select a tool from the toolbar: Pen, Rectangle, Circle, Eraser, or Pan.
- Middle mouse button also enters pan mode.
- Zoom with Ctrl + mouse wheel; on touchpads, pinch zoom is supported.
- Keyboard shortcuts:
  - S: toggle smoothing
  - Ctrl+Z: undo your last action
  - Ctrl+Shift+Z or Ctrl+Y: redo

## Environment variables

Copy `.env.example` to `.env` (optional), then adjust values:

```env
PORT=3000
NODE_ENV=production
```

- If unset, `PORT` defaults to 3000.
