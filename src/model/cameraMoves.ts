import type { CameraState, Project, Vec3 } from './types';
import { cameraStateAt, clearCameraMotion } from './scene';
import { orbitAround } from './cameras';
import { LENSES } from './lens';

export type MoveKind = 'static' | 'pan' | 'tilt' | 'dolly' | 'truck' | 'orbit' | 'crane' | 'zoom';
/** +1 is right / up / in; -1 is left / down / out. */
export type MoveDirection = 1 | -1;

export const CAMERA_MOVES: { kind: MoveKind; label: string; hint: string; directions?: [string, string] }[] = [
  { kind: 'static', label: 'Static', hint: 'The camera does not move' },
  { kind: 'pan', label: 'Pan', hint: 'Turns left or right on the spot', directions: ['Left', 'Right'] },
  { kind: 'tilt', label: 'Tilt', hint: 'Tilts up or down on the spot', directions: ['Down', 'Up'] },
  { kind: 'dolly', label: 'Dolly', hint: 'Travels towards or away from the action', directions: ['Out', 'In'] },
  { kind: 'truck', label: 'Truck', hint: 'Travels sideways, alongside the action', directions: ['Left', 'Right'] },
  { kind: 'orbit', label: 'Orbit', hint: 'Circles around the subject', directions: ['Left', 'Right'] },
  { kind: 'crane', label: 'Crane', hint: 'Rises or sinks', directions: ['Down', 'Up'] },
  { kind: 'zoom', label: 'Zoom', hint: 'Changes the lens; the camera stays put', directions: ['Out', 'In'] },
];

/** Move ids as stored on a shot: 'static', 'dolly-in', 'pan-left', … */
export function moveId(kind: MoveKind, dir: MoveDirection): string {
  const info = CAMERA_MOVES.find((m) => m.kind === kind)!;
  if (!info.directions) return kind;
  return `${kind}-${info.directions[dir === 1 ? 1 : 0].toLowerCase()}`;
}

export function parseMoveId(id: string | undefined): { kind: MoveKind; dir: MoveDirection } | null {
  if (!id) return null;
  const [kind, d] = id.split('-') as [MoveKind, string | undefined];
  const info = CAMERA_MOVES.find((m) => m.kind === kind);
  if (!info) return null;
  if (!info.directions || !d) return { kind, dir: 1 };
  return { kind, dir: info.directions[1].toLowerCase() === d ? 1 : -1 };
}

/** "Dolly in", "Pan left", "Static". */
export function moveLabel(id: string | undefined): string {
  const m = parseMoveId(id);
  if (!m) return '';
  const info = CAMERA_MOVES.find((x) => x.kind === m.kind)!;
  if (!info.directions) return info.label;
  return `${info.label} ${info.directions[m.dir === 1 ? 1 : 0].toLowerCase()}`;
}

const PAN = (35 * Math.PI) / 180;
const TILT = (18 * Math.PI) / 180;
const ORBIT = (45 * Math.PI) / 180;
const CRANE = 1.5;
const MIN_HEIGHT = 0.2;

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const length = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);

/** Rotates v about the vertical axis; positive turns to the left (counter-clockwise from above). */
function yaw(v: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
}

/**
 * Where a camera move ends, given where it starts. The amounts are sensible
 * defaults; the user fine-tunes the end in Camera view. `pivot` is what an
 * orbit circles around (the subject); without one it circles the aim point.
 */
export function moveEnd(start: CameraState, kind: MoveKind, dir: MoveDirection, pivot?: Vec3): CameraState {
  const offset = sub(start.target, start.position);
  const dist = length(offset) || 1;
  const forward = scale(offset, 1 / dist);
  const flat = Math.hypot(forward[0], forward[2]) || 1;
  // Camera right on the floor: forward × up.
  const right: Vec3 = [-forward[2] / flat, 0, forward[0] / flat];

  switch (kind) {
    case 'static':
      return start;
    case 'pan':
      return { ...start, target: add(start.position, yaw(offset, -dir * PAN)) };
    case 'tilt': {
      const pitch = Math.asin(Math.max(-1, Math.min(1, forward[1])));
      const next = Math.max(-1.45, Math.min(1.45, pitch + dir * TILT));
      const d: Vec3 = [(forward[0] / flat) * Math.cos(next), Math.sin(next), (forward[2] / flat) * Math.cos(next)];
      return { ...start, target: add(start.position, scale(d, dist)) };
    }
    case 'dolly': {
      // In: travel 40% of the way to the aim point (never through it). Out: back off by 60%.
      const amount = dir === 1 ? Math.min(dist * 0.4, Math.max(0, dist - 0.3)) : -dist * 0.6;
      return { ...start, position: add(start.position, scale(forward, amount)) };
    }
    case 'truck': {
      const amount = dir * Math.max(1, dist * 0.35);
      const step = scale(right, amount);
      return { ...start, position: add(start.position, step), target: add(start.target, step) };
    }
    case 'orbit': {
      const centre = pivot ?? start.target;
      // Keep looking at the same height, but circle the subject.
      const swung = orbitAround({ ...start, target: [centre[0], start.target[1], centre[2]] }, centre, dir * ORBIT);
      return swung;
    }
    case 'crane': {
      const rise = dir === 1 ? CRANE : -Math.min(CRANE, Math.max(0, start.position[1] - MIN_HEIGHT));
      return {
        ...start,
        position: [start.position[0], start.position[1] + rise, start.position[2]],
        target: [start.target[0], start.target[1] + rise / 2, start.target[2]],
      };
    }
    case 'zoom': {
      const f = start.focalLength;
      const next = dir === 1 ? Math.min(LENSES[LENSES.length - 1], f * 2) : Math.max(LENSES[0], f / 2);
      return { ...start, focalLength: next };
    }
  }
}

/**
 * Gives a shot a camera move: the end is computed from the shot's start.
 * 'static' removes the camera motion instead.
 */
export function applyCameraMove(
  project: Project,
  shotIndex: number,
  kind: MoveKind,
  dir: MoveDirection,
  pivot?: Vec3,
): void {
  const shot = project.shots[shotIndex];
  if (!shot) return;
  if (kind === 'static') {
    clearCameraMotion(project, shotIndex);
    return;
  }
  const start = cameraStateAt(project, shotIndex, 'start');
  const end = moveEnd(start, kind, dir, pivot);
  shot.cameraTrack = [
    { t: 0, value: start, easing: 'smooth' },
    { t: 1, value: end, easing: 'smooth' },
  ];
  shot.cameraMove = moveId(kind, dir);
}
