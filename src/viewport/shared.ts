import { create } from 'zustand';
import type * as THREE from 'three';
import type { ObjectKind, SceneObject } from '../model/types';

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
} = {
  camera: null,
  canvas: null,
  pointerHitObject: false,
  focusSelection: () => {},
  resetView: () => {},
};

/** Keys currently held (lowercase `KeyboardEvent.key`). */
export const heldKeys = new Set<string>();

/** Short-lived interaction state that is never saved or undone. */
interface Transient {
  dragging: boolean;
  /** Alignment guides on the floor, as [x1, z1, x2, z2] segments. */
  guides: [number, number, number, number][];
  hoverId: string | null;
  setDragging(v: boolean): void;
  setGuides(g: [number, number, number, number][]): void;
  setHover(id: string | null): void;
}

export const useTransient = create<Transient>()((set) => ({
  dragging: false,
  guides: [],
  hoverId: null,
  setDragging: (dragging) => set({ dragging }),
  setGuides: (guides) => set({ guides }),
  setHover: (hoverId) => {
    if (viewportApi.canvas) viewportApi.canvas.style.cursor = hoverId ? 'grab' : '';
    set({ hoverId });
  },
}));

export const ACCENT = '#f5a524';

/** Approximate height of an object at scale 1, in metres. */
export function kindHeight(obj: Pick<SceneObject, 'kind' | 'figureSize'>): number {
  const map: Partial<Record<ObjectKind, number>> = { plane: 2.4, figure: 1.75 };
  const h = map[obj.kind] ?? 1;
  return obj.kind === 'figure' && obj.figureSize === 'child' ? h * CHILD_SCALE : h;
}

/** Approximate footprint radius at scale 1, in metres. */
export function kindRadius(kind: ObjectKind): number {
  return kind === 'plane' ? 1 : kind === 'ramp' ? 1 : kind === 'figure' ? 0.3 : 0.5;
}

export const CHILD_SCALE = 0.68;
