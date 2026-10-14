# ReEziser

A fast 3D sketchpad for films, music videos and scenes: block out a set with simple shapes and people, place cameras, split the action into shots, and play it back as an animatic.

## Run

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (model, interpolation, lenses, undo)
npm run test:e2e   # browser smoke test (Playwright)
npm run build
npm run desktop        # desktop window (Tauri; needs Rust and the MSVC build tools)
npm run desktop:build  # installer: src-tauri/target/release/bundle/msi/*.msi
```

## Layout

| Path | What lives there |
|---|---|
| `src/model/` | Pure logic with no React: data types, interpolation, lenses, poses, shot/state rules, cameras, framing, camera moves, the 180° line, groups, undo history, file format. Covered by `model.test.ts` and `phase2.test.ts`. |
| `src/export/` | Video (MP4), storyboard (PDF) and shot list (CSV). The pure parts are covered by `export.test.ts`. |
| `src/store/` | Zustand store that connects the model to the UI (selection, current shot, Start/End, playback, undo). |
| `src/viewport/` | React Three Fiber scene: objects, mannequin, camera gizmo, gizmo-free drag, Camera-view controls, thumbnails. |
| `src/ui/` | The few on-screen controls: top bar, add palette, context panel, shot strip, camera frame, labels, menu. |
| `src/io/` | Save, open, export files and autosave, in the browser and in the desktop app. |
| `src-tauri/` | The Windows desktop app (Tauri 2) and its installer. |

## Controls

| | |
|---|---|
| Orbit / pan / zoom | Right drag / middle drag or Space + left drag / wheel |
| Move along the floor | Drag an object (Shift = no snapping, Ctrl = only along the line you started on) |
| Lift · Rotate · Scale | Alt + drag · R + drag (or Ctrl + wheel) · S + drag |
| Select more | Shift + click, or drag a rectangle on empty space |
| Focus · Reset view | F or double-click · Home |
| Axis lock | Hold Ctrl while dragging an object or a camera, or while panning/tilting in Camera view: the move keeps to the direction it started in |
| Camera view | Tab. In it: right drag = pan/tilt, wheel = dolly, middle drag = truck/pedestal, W A S D = walk, Q / E = down / up, Shift = faster (with nothing selected) |
| Shots | N new · ← → previous/next · drag a card to reorder · drag its right edge to change length |
| Play | Space (Shift + Space from the current shot) · L loops the current shot · Esc stops |
| Undo / Redo · Save | Ctrl + Z / Ctrl + Shift + Z (or Ctrl + Y) · Ctrl + S |
| Radial menu | Short right click on an object or camera |
| Group · Ungroup | Ctrl + G · Ctrl + Shift + G |
| Cameras | Select the camera: Lens · Framing (shot type, angle) · Move tabs. In Camera view the same tools are chips under the frame, plus frame guides |
| Arrow · Label | [+] → Arrow, then drag on the floor · [+] → Label |
| Export | Menu → Export… (Ctrl + E): video, storyboard PDF, shot list CSV |
