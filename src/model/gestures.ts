/**
 * Touch gestures for Windows tablets: a quick tap with two fingers
 * is Undo, with three fingers Redo. Fed with raw touch points; pure, so it
 * can be tested without a screen.
 */

/** A tap must end within this long after its first finger landed (ms). */
const TAP_TIME = 350;
/** No finger may travel further than this during a tap (px). */
const TAP_SLOP = 12;

export type TapResult = 'undo' | 'redo' | null;

export class MultiFingerTap {
  private down = new Map<number, { x: number; y: number }>();
  private startTime = 0;
  private maxFingers = 0;
  private moved = false;

  /** Fingers currently touching. */
  get count(): number {
    return this.down.size;
  }

  press(id: number, x: number, y: number, time: number): void {
    if (this.down.size === 0) {
      this.startTime = time;
      this.maxFingers = 0;
      this.moved = false;
    }
    this.down.set(id, { x, y });
    this.maxFingers = Math.max(this.maxFingers, this.down.size);
  }

  move(id: number, x: number, y: number): void {
    const p = this.down.get(id);
    if (p && Math.hypot(x - p.x, y - p.y) > TAP_SLOP) this.moved = true;
  }

  /** Returns the command once the last finger lifts, if the touch was a tap. */
  release(id: number, time: number): TapResult {
    if (!this.down.delete(id) || this.down.size > 0) return null;
    if (this.moved || time - this.startTime > TAP_TIME) return null;
    return this.maxFingers === 2 ? 'undo' : this.maxFingers === 3 ? 'redo' : null;
  }

  cancel(): void {
    this.down.clear();
  }
}

/** Distance and midpoint of two touch points, for pinch and two-finger drag. */
export function pinchOf(a: { x: number; y: number }, b: { x: number; y: number }) {
  return { distance: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
