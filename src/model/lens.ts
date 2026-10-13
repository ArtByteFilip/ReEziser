import type { AspectRatio } from './types';

export const LENSES = [14, 18, 24, 35, 50, 85, 135] as const;
export const DEFAULT_FOCAL_LENGTH = 35;

export const ASPECT_RATIOS: AspectRatio[] = ['16:9', '2.39:1', '4:3', '1:1', '9:16'];

export function aspectValue(ratio: AspectRatio): number {
  switch (ratio) {
    case '16:9':
      return 16 / 9;
    case '2.39:1':
      return 2.39;
    case '4:3':
      return 4 / 3;
    case '1:1':
      return 1;
    case '9:16':
      return 9 / 16;
  }
}

const SENSOR_W = 36;
const SENSOR_H = 24;

/**
 * The part of a 36x24 mm full-frame sensor used by a frame of the given aspect:
 * the largest rectangle of that aspect that fits inside the sensor.
 */
export function sensorFrame(aspect: number): { width: number; height: number } {
  const sensorAspect = SENSOR_W / SENSOR_H;
  return aspect >= sensorAspect
    ? { width: SENSOR_W, height: SENSOR_W / aspect }
    : { width: SENSOR_H * aspect, height: SENSOR_H };
}

/** Vertical field of view in degrees for a focal length (mm) and frame aspect. */
export function verticalFov(focalLength: number, aspect: number): number {
  const { height } = sensorFrame(aspect);
  return (2 * Math.atan(height / (2 * focalLength)) * 180) / Math.PI;
}

/**
 * The vertical FOV to give a render camera whose viewport is taller than the
 * visible frame, so that the frame itself shows exactly `frameFov`.
 */
export function expandFov(frameFov: number, frameHeightPx: number, viewportHeightPx: number): number {
  const half = (frameFov * Math.PI) / 360;
  return (2 * Math.atan(Math.tan(half) * (viewportHeightPx / frameHeightPx)) * 180) / Math.PI;
}

/** Fits a frame of `aspect` inside a W x H area with a margin; returns its rect. */
export function fitFrame(
  aspect: number,
  w: number,
  h: number,
  margin: { top: number; right: number; bottom: number; left: number },
): { x: number; y: number; width: number; height: number } {
  const availW = Math.max(1, w - margin.left - margin.right);
  const availH = Math.max(1, h - margin.top - margin.bottom);
  let width = availW;
  let height = width / aspect;
  if (height > availH) {
    height = availH;
    width = height * aspect;
  }
  return {
    x: margin.left + (availW - width) / 2,
    y: margin.top + (availH - height) / 2,
    width,
    height,
  };
}
