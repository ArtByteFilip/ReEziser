import type { CameraState, Easing, Key, ObjectState, ResolvedObjectState, Vec3 } from './types';

export function ease(easing: Easing, u: number): number {
  const x = clamp01(u);
  switch (easing) {
    case 'linear':
      return x;
    case 'easeIn':
      return x * x * x;
    case 'easeOut':
      return 1 - Math.pow(1 - x, 3);
    case 'smooth':
    default:
      return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  }
}

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

export function lerpVec3(a: Vec3, b: Vec3, u: number): Vec3 {
  return [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
}

/** Interpolates angles (radians) along the shortest path. */
export function lerpAngle(a: number, b: number, u: number): number {
  const TAU = Math.PI * 2;
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * u;
}

/** Centripetal-free (uniform) Catmull-Rom between p1 and p2. */
export function catmullRom(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, u: number): Vec3 {
  const u2 = u * u;
  const u3 = u2 * u;
  const out: Vec3 = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    out[i] =
      0.5 *
      (2 * p1[i] +
        (-p0[i] + p2[i]) * u +
        (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * u2 +
        (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * u3);
  }
  return out;
}

export function vec3Equal(a: Vec3, b: Vec3, eps = 1e-6): boolean {
  return Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps && Math.abs(a[2] - b[2]) < eps;
}

/**
 * Locates the segment of a key list for time t.
 * Returns the index of the segment start key and the eased local parameter.
 */
export function locate<T>(keys: Key<T>[], t: number): { i: number; u: number } {
  if (keys.length < 2 || t <= keys[0].t) return { i: 0, u: 0 };
  const last = keys.length - 1;
  if (t >= keys[last].t) return { i: last - 1, u: 1 };
  let i = 0;
  while (i < last - 1 && t >= keys[i + 1].t) i++;
  const span = keys[i + 1].t - keys[i].t;
  const raw = span > 0 ? (t - keys[i].t) / span : 1;
  return { i, u: ease(keys[i].easing, raw) };
}

function pointOnPath(points: Vec3[], i: number, u: number): Vec3 {
  const p1 = points[i];
  const p2 = points[i + 1];
  if (points.length === 2) return lerpVec3(p1, p2, u);
  const p0 = points[i - 1] ?? p1;
  const p3 = points[i + 2] ?? p2;
  return catmullRom(p0, p1, p2, p3, u);
}

export function evaluateObjectTrack(keys: Key<ObjectState>[], t: number): ResolvedObjectState {
  if (keys.length === 1) return keys[0].value;
  const { i, u } = locate(keys, t);
  const a = keys[i].value;
  const b = keys[i + 1].value;
  if (u <= 0) return a;
  if (u >= 1) return b;
  const out: ResolvedObjectState = {
    position: pointOnPath(
      keys.map((k) => k.value.position),
      i,
      u,
    ),
    rotationY: lerpAngle(a.rotationY, b.rotationY, u),
    scale: lerpVec3(a.scale, b.scale, u),
    visible: u < 0.5 ? a.visible : b.visible,
    pose: u < 0.5 ? a.pose : b.pose,
  };
  if (a.rotationXZ || b.rotationXZ) {
    const ra = a.rotationXZ ?? [0, 0];
    const rb = b.rotationXZ ?? [0, 0];
    out.rotationXZ = [lerpAngle(ra[0], rb[0], u), lerpAngle(ra[1], rb[1], u)];
  }
  if (a.pose && b.pose && a.pose !== b.pose) {
    out.poseBlend = { from: a.pose, to: b.pose, w: u };
  }
  return out;
}

export function evaluateCameraTrack(keys: Key<CameraState>[], t: number): CameraState {
  if (keys.length === 1) return keys[0].value;
  const { i, u } = locate(keys, t);
  const a = keys[i].value;
  const b = keys[i + 1].value;
  if (u <= 0) return a;
  if (u >= 1) return b;
  return {
    position: pointOnPath(
      keys.map((k) => k.value.position),
      i,
      u,
    ),
    target: pointOnPath(
      keys.map((k) => k.value.target),
      i,
      u,
    ),
    roll: lerp(a.roll, b.roll, u),
    focalLength: lerp(a.focalLength, b.focalLength, u),
  };
}
