import { fitFrame } from '../model/lens';

/** Height reserved for the shot strip at the bottom of the window. */
export const STRIP_HEIGHT = 150;
export const TOP_BAR_HEIGHT = 56;

/**
 * Where the camera frame sits on screen in Camera view. Shared by the 3D rig
 * (so the frame shows exactly the lens view) and the DOM overlay that dims
 * everything outside it.
 */
export function cameraFrameRect(aspect: number, width: number, height: number, playing: boolean) {
  const margin = playing
    ? { top: 12, right: 12, bottom: 28, left: 12 }
    : { top: TOP_BAR_HEIGHT + 8, right: 72, bottom: STRIP_HEIGHT + 4, left: 72 };
  return fitFrame(aspect, width, height, margin);
}
