# ReEziser

A fast 3D sketchpad for films, music videos and scenes: block out a set with simple shapes and people, place cameras, split the action into shots, and play it back as an animatic.

## Run

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (model, interpolation, lenses, undo)
npm run test:e2e   # browser smoke test (Playwright)
npm run build
```

## Layout

| Path | What lives there |
|---|---|
| `src/model/` | Pure logic with no React: data types, interpolation, lenses, poses, shot/state rules, undo history, file format. Covered by `model.test.ts`. |
| `src/store/` | Zustand store that connects the model to the UI (selection, current shot, Start/End, playback, undo). |
| `src/viewport/` | React Three Fiber scene: objects, mannequin, camera gizmo, gizmo-free drag, Camera-view controls, thumbnails. |
| `src/ui/` | The few on-screen controls: top bar, add palette, context panel, shot strip, camera frame, labels, menu. |
| `src/io/` | Save, open and autosave. |

## Controls (Phase 1)

| | |
|---|---|
| Orbit / pan / zoom | Right drag / middle drag or Space + left drag / wheel |
| Move along the floor | Drag an object (Shift = no snapping) |
| Lift · Rotate · Scale | Alt + drag · R + drag (or Ctrl + wheel) · S + drag |
| Select more | Shift + click, or drag a rectangle on empty space |
| Focus · Reset view | F or double-click · Home |
| Camera view | Tab. In it: right drag = pan/tilt, wheel = dolly, middle drag = truck/pedestal |
| Shots | N new · ← → previous/next · drag a card to reorder · drag its right edge to change length |
| Play | Space (Shift + Space from the current shot) · L loops the current shot · Esc stops |
| Undo / Redo · Save | Ctrl + Z / Ctrl + Shift + Z (or Ctrl + Y) · Ctrl + S |
