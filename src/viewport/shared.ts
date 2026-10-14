import { create } from 'zustand';
import type * as THREE from 'three';
import type { StillOptions } from './StillRenderer';

/**
 * Handles into the live Three.js scene for code outside the Canvas
 * (keyboard shortcuts, marquee selection). Set by components inside the Canvas.
 */
export const viewportApi: {
  camera: THREE.Camera | null;
  canvas: HTMLCanvasElement | null;
  /** Set when a pointerdown landed on a scene object, so the DOM layer skips marquee. */
  pointerHitObject: boolean;
  focusSelection: () => void;
  resetView: () => void;
  /** Renders a still through a shot's camera (see StillRenderer). */
  renderStill: (opts: StillOptions) => Promise<HTMLCanvasElement>;
} = {
  camera: null,
  canvas: null,
  pointerHitObject: false,
  focusSelection: () => {},
  resetView: () => {},
  renderStill: () => Promise.reject(new Error('The viewport is not ready yet.')),
};

/** Keys currently held (lowercase `KeyboardEvent.key`). */
export const heldKeys = new Set<string>();

export type RadialTarget = { kind: 'object'; id: string } | { kind: 'camera'; id: string };

/** Which part of the camera tools is open (panel tabs and Camera-view chips). */
export type CameraTab = 'lens' | 'framing' | 'move';

/** The open chip in Camera view, if any. */
export type CameraChip = 'camera' | 'lens' | 'framing' | 'move' | 'guides';

/** Short-lived interaction state that is never saved or undone. */
interface Transient {
  dragging: boolean;
  /** Alignment guides on the floor, as [x1, z1, x2, z2] segments. */
  guides: [number, number, number, number][];
  hoverId: string | null;
  /** Drawing an arrow on the floor: the next drag on the floor draws one. */
  tool: 'arrow' | null;
  /** The arrow being drawn, as [x1, z1, x2, z2]. */
  arrowDraft: [number, number, number, number] | null;
  radial: { x: number; y: number; target: RadialTarget } | null;
  cameraTab: CameraTab;
  cameraChip: CameraChip | null;
  exportOpen: boolean;
  setDragging(v: boolean): void;
  setGuides(g: [number, number, number, number][]): void;
  setHover(id: string | null): void;
  setTool(tool: 'arrow' | null): void;
  setArrowDraft(d: [number, number, number, number] | null): void;
  openRadial(x: number, y: number, target: RadialTarget): void;
  closeRadial(): void;
  setCameraTab(tab: CameraTab): void;
  setCameraChip(chip: CameraChip | null): void;
  setExportOpen(open: boolean): void;
}

export const useTransient = create<Transient>()((set) => ({
  dragging: false,
  guides: [],
  hoverId: null,
  tool: null,
  arrowDraft: null,
  radial: null,
  cameraTab: 'lens',
  cameraChip: null,
  exportOpen: false,
  setDragging: (dragging) => set({ dragging }),
  setGuides: (guides) => set({ guides }),
  setHover: (hoverId) => {
    if (viewportApi.canvas && !useTransient.getState().tool) viewportApi.canvas.style.cursor = hoverId ? 'grab' : '';
    set({ hoverId });
  },
  setTool: (tool) => {
    if (viewportApi.canvas) viewportApi.canvas.style.cursor = tool ? 'crosshair' : '';
    set({ tool, arrowDraft: null });
  },
  setArrowDraft: (arrowDraft) => set({ arrowDraft }),
  openRadial: (x, y, target) => set({ radial: { x, y, target } }),
  closeRadial: () => set({ radial: null }),
  setCameraTab: (cameraTab) => set({ cameraTab }),
  setCameraChip: (cameraChip) => set({ cameraChip }),
  setExportOpen: (exportOpen) => set({ exportOpen }),
}));

/**
 * A short right click (press and release without dragging) opens the radial
 * menu; a right drag keeps orbiting or looking around as before.
 */
export function armRadial(down: PointerEvent, target: RadialTarget): void {
  const up = (ev: PointerEvent) => {
    window.removeEventListener('pointerup', up, true);
    if (ev.button !== 2) return;
    // Event timestamps, not handler time: a slow frame must not turn a click into a hold.
    const held = ev.timeStamp - down.timeStamp;
    if (Math.hypot(ev.clientX - down.clientX, ev.clientY - down.clientY) > 5 || held > 600) return;
    useTransient.getState().openRadial(ev.clientX, ev.clientY, target);
  };
  window.addEventListener('pointerup', up, true);
}

export const ACCENT = '#f5a524';

export { CHILD_SCALE, kindHeight, kindRadius } from '../model/dimensions';
