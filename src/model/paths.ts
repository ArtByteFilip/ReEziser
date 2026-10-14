import type { CameraState, Key, ObjectState, Pose, Vec3 } from './types';
import { ease } from './interpolate';

/**
 * Quick ways to make motion: draw a path on the floor, or perform
 * the move live while the shot plays. Both end up as ordinary keys, so the
 * detailed timeline can refine them afterwards.
 */

export type Point2 = [number, number];

/** A sample of a live performance: shot time (0..1) and floor position. */
export interface TakeSample {
  t: number;
  x: number;
  z: number;
}

/** Below this the figure stands; above RUN it runs (metres per second). */
export const WALK_SPEED = 0.25;
export const RUN_SPEED = 2.6;
/** Paths are simplified to keys no further than this from the drawn line (metres). */
const PATH_TOLERANCE = 0.08;
const MAX_PATH_KEYS = 24;

export function poseForSpeed(speed: number): Pose {
  return speed < WALK_SPEED ? 'stand' : speed < RUN_SPEED ? 'walk' : 'run';
}

/** Ramer–Douglas–Peucker simplification on points of any dimension; keeps the ends. */
export function simplify<P extends number[]>(points: P[], tolerance: number): P[] {
  if (points.length <= 2) return points.slice();
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let worst = -1;
    let worstD = tolerance;
    for (let i = a + 1; i < b; i++) {
      const d = distanceToSegment(points[i], points[a], points[b]);
      if (d > worstD) {
        worstD = d;
        worst = i;
      }
    }
    if (worst >= 0) {
      keep[worst] = true;
      stack.push([a, worst], [worst, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function distanceToSegment(p: number[], a: number[], b: number[]): number {
  let ab2 = 0;
  let dot = 0;
  for (let i = 0; i < p.length; i++) {
    ab2 += (b[i] - a[i]) ** 2;
    dot += (p[i] - a[i]) * (b[i] - a[i]);
  }
  const u = ab2 > 0 ? Math.max(0, Math.min(1, dot / ab2)) : 0;
  let d2 = 0;
  for (let i = 0; i < p.length; i++) d2 += (p[i] - (a[i] + (b[i] - a[i]) * u)) ** 2;
  return Math.sqrt(d2);
}

/** Cumulative distance along a polyline, from 0 to its total length. */
export function arcLengths(points: Point2[]): number[] {
  const out = [0];
  for (let i = 1; i < points.length; i++) {
    out.push(out[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  }
  return out;
}

/** The time at which a smooth (ease-in-out) move has covered fraction s of its way. */
export function smoothTimeFor(s: number): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (ease('smooth', mid) < s) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Heading (rotation about the vertical axis) of travel from a to b; figures face +Z at 0. */
export function headingOf(a: Point2, b: Point2): number {
  return Math.atan2(b[0] - a[0], b[1] - a[1]);
}

/**
 * Starts a drawn path where the object is: a stroke begun near the object
 * snaps its first point to it; one begun further away gets a leg from the
 * object to the start of the stroke.
 */
export function anchorPath(drawn: Point2[], from: Point2): Point2[] {
  if (!drawn.length) return [from];
  const near = Math.hypot(drawn[0][0] - from[0], drawn[0][1] - from[1]) < 0.4;
  return near ? [from, ...drawn.slice(1)] : [from, ...drawn];
}

/** Simplifies a drawn stroke, loosening the tolerance until it fits in a sensible number of keys. */
export function simplifyStroke(points: Point2[]): Point2[] {
  let tolerance = PATH_TOLERANCE;
  let out = simplify(points, tolerance);
  while (out.length > MAX_PATH_KEYS) {
    tolerance *= 1.5;
    out = simplify(points, tolerance);
  }
  return out;
}

/**
 * Keys that carry an object along a drawn path over the whole shot. The
 * move eases in and out overall, with an even speed in between. People turn
 * to face where they walk and take the walk or run pose for their speed.
 */
export function pathKeys(
  drawn: Point2[],
  start: ObjectState,
  opts: { isFigure: boolean; duration: number },
): Key<ObjectState>[] {
  const points = simplifyStroke(anchorPath(drawn, [start.position[0], start.position[2]]));
  if (points.length < 2) return [];
  const lengths = arcLengths(points);
  const total = lengths[lengths.length - 1];
  if (total < 0.05) return [];
  const pose = opts.isFigure ? poseForSpeed(total / Math.max(0.1, opts.duration)) : undefined;
  return points.map((p, i) => {
    const t = i === 0 ? 0 : i === points.length - 1 ? 1 : smoothTimeFor(lengths[i] / total);
    const value: ObjectState = { ...start, position: [p[0], start.position[1], p[1]] };
    if (opts.isFigure) {
      const a = points[Math.max(0, i - 1)];
      const b = points[Math.min(points.length - 1, i + 1)];
      value.rotationY = headingOf(a, b);
      value.pose = pose;
    }
    return { t, value, easing: 'linear' as const };
  });
}

/**
 * Keys that move a camera along a drawn path, like a dolly on a track: it
 * keeps its height, lens and the direction it looks in.
 */
export function cameraPathKeys(drawn: Point2[], start: CameraState): Key<CameraState>[] {
  const points = simplifyStroke(anchorPath(drawn, [start.position[0], start.position[2]]));
  if (points.length < 2) return [];
  const lengths = arcLengths(points);
  const total = lengths[lengths.length - 1];
  if (total < 0.05) return [];
  const aim: Vec3 = [
    start.target[0] - start.position[0],
    start.target[1] - start.position[1],
    start.target[2] - start.position[2],
  ];
  return points.map((p, i) => {
    const t = i === 0 ? 0 : i === points.length - 1 ? 1 : smoothTimeFor(lengths[i] / total);
    const position: Vec3 = [p[0], start.position[1], p[1]];
    return {
      t,
      value: { ...start, position, target: [p[0] + aim[0], position[1] + aim[1], p[1] + aim[2]] },
      easing: 'linear' as const,
    };
  });
}

/**
 * Keys from a live performance. The samples keep their timing (a pause stays
 * a pause), simplified in space and time together so a long take becomes a
 * handful of keys. People face the way they move and pick their pose from
 * the local speed. If the take ends early, the object waits there.
 */
export function takeKeys(
  samples: TakeSample[],
  start: ObjectState,
  opts: { isFigure: boolean; duration: number },
): Key<ObjectState>[] {
  if (samples.length < 2) return [];
  // Time counts as distance at walking pace, so pauses and speed changes survive simplification.
  const seconds = opts.duration;
  const pts = samples.map((s) => [s.x, s.z, s.t * seconds * 1.0] as [number, number, number]);
  const kept = simplify(pts, PATH_TOLERANCE);
  if (kept[kept.length - 1][2] < seconds - 1e-6) kept.push([kept[kept.length - 1][0], kept[kept.length - 1][1], seconds]);
  if (kept[0][2] > 1e-6) kept.unshift([kept[0][0], kept[0][1], 0]);

  // Keys closer in time than a frame or so are one key (the first samples often repeat).
  const spaced = kept.filter((p, i) => i === 0 || i === kept.length - 1 || p[2] - kept[i - 1][2] > seconds * 0.005);
  if (spaced.length > 2 && spaced[spaced.length - 1][2] - spaced[spaced.length - 2][2] <= seconds * 0.005) {
    spaced.splice(spaced.length - 2, 1);
  }

  let heading = start.rotationY;
  return spaced.map((p, i) => {
    const value: ObjectState = { ...start, position: [p[0], start.position[1], p[1]] };
    if (opts.isFigure) {
      // Each key describes the stretch it starts (the last one, the stretch it ends).
      const a = i < spaced.length - 1 ? spaced[i] : spaced[i - 1];
      const b = i < spaced.length - 1 ? spaced[i + 1] : spaced[i];
      const dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const time = Math.max(1e-3, b[2] - a[2]);
      // Keep the last heading while standing still, so the figure doesn't snap around.
      if (dist > 0.05) heading = headingOf([a[0], a[1]], [b[0], b[1]]);
      value.rotationY = heading;
      value.pose = poseForSpeed(dist / time);
    }
    return { t: Math.min(1, Math.max(0, p[2] / seconds)), value, easing: 'linear' as const };
  });
}
