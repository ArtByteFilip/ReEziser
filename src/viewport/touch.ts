import { useEffect } from 'react';
import { MultiFingerTap } from '../model/gestures';
import { useStore } from '../store/store';

/**
 * Touch on Windows tablets. Mouse, pen and touch share the same
 * Pointer Events code; this adds what only fingers do:
 * - one finger selects and moves, like the mouse;
 * - two fingers orbit and pinch-zoom (Director view, via OrbitControls) or
 *   look around and dolly (Camera view, CameraViewControls);
 * - a quick two-finger tap is Undo, three fingers Redo;
 * - holding a finger on an object opens the radial menu (useObjectDrag).
 */

/** Fingers currently on the viewport, by pointer id. */
export const touches = new Map<number, { x: number; y: number }>();

/** True while two or more fingers are down: one-finger actions step aside. */
export function multiTouch(): boolean {
  return touches.size > 1;
}

/** How long a finger must rest on an object to open its radial menu (ms). */
export const LONG_PRESS_MS = 500;

export function useTouchGestures(): void {
  useEffect(() => {
    const tap = new MultiFingerTap();
    const inViewport = (e: PointerEvent) => !!(e.target as Element | null)?.closest?.('.viewport');

    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' || !inViewport(e)) return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      tap.press(e.pointerId, e.clientX, e.clientY, e.timeStamp);
    };
    const move = (e: PointerEvent) => {
      if (!touches.has(e.pointerId)) return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      tap.move(e.pointerId, e.clientX, e.clientY);
    };
    const up = (e: PointerEvent) => {
      if (!touches.delete(e.pointerId)) return;
      const result = tap.release(e.pointerId, e.timeStamp);
      const s = useStore.getState();
      if (s.playback || s.take) return;
      if (result === 'undo' && s.canUndo) {
        s.undo();
        s.notify('Undone');
      } else if (result === 'redo' && s.canRedo) {
        s.redo();
        s.notify('Redone');
      }
    };
    const cancel = (e: PointerEvent) => {
      touches.delete(e.pointerId);
      if (!touches.size) tap.cancel();
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', cancel, true);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', cancel, true);
      touches.clear();
    };
  }, []);
}
