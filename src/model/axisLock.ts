/**
 * Axis lock while dragging (hold Ctrl, as in CorelDRAW): the drag follows
 * only the axis the user moved along first. Works on any pair of axes:
 * floor X/Z for objects, screen horizontal/vertical for the camera.
 */

/** 0 = first axis (x, horizontal), 1 = second axis (z, vertical). */
export type LockedAxis = 0 | 1;

export interface Constrained {
  delta: [number, number];
  /** The axis now locked, or null while the drag is still too small to tell. */
  axis: LockedAxis | null;
}

/**
 * Constrains a 2D drag delta. With no axis chosen yet, the axis is picked once
 * the drag is longer than `threshold`; until then the drag stays put. Once
 * picked, the axis is kept (pass it back in as `current`).
 */
export function constrainToAxis(delta: [number, number], current: LockedAxis | null, threshold: number): Constrained {
  let axis = current;
  if (axis === null) {
    if (Math.hypot(delta[0], delta[1]) < threshold) return { delta: [0, 0], axis: null };
    axis = Math.abs(delta[0]) >= Math.abs(delta[1]) ? 0 : 1;
  }
  return { delta: axis === 0 ? [delta[0], 0] : [0, delta[1]], axis };
}

/**
 * Tracks the lock through a drag: on while the key is held, forgotten when
 * it is released, so pressing it again picks the axis afresh.
 */
export class AxisLock {
  axis: LockedAxis | null = null;

  constructor(private threshold: number) {}

  apply(delta: [number, number], held: boolean): [number, number] {
    if (!held) {
      this.axis = null;
      return delta;
    }
    const r = constrainToAxis(delta, this.axis, this.threshold);
    this.axis = r.axis;
    return r.delta;
  }
}
