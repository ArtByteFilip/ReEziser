import type { CameraState, ObjectState, SceneObject, Vec3 } from './types';
import { verticalFov } from './lens';
import { kindRadius, objectHeight } from './dimensions';

export type ShotType =
  | 'extreme-wide'
  | 'wide'
  | 'medium-wide'
  | 'medium'
  | 'medium-close-up'
  | 'close-up'
  | 'extreme-close-up';

export type CameraAngle = 'eye-level' | 'low' | 'high' | 'overhead' | 'dutch';

export const SHOT_TYPES: { id: ShotType; label: string; short: string; hint: string }[] = [
  { id: 'extreme-wide', label: 'Extreme wide', short: 'EWS', hint: 'The place, with people small in it' },
  { id: 'wide', label: 'Wide', short: 'WS', hint: 'Head to toe' },
  { id: 'medium-wide', label: 'Medium wide', short: 'MWS', hint: 'From the knees up' },
  { id: 'medium', label: 'Medium', short: 'MS', hint: 'From the waist up' },
  { id: 'medium-close-up', label: 'Medium close-up', short: 'MCU', hint: 'Chest and head' },
  { id: 'close-up', label: 'Close-up', short: 'CU', hint: 'Head and shoulders' },
  { id: 'extreme-close-up', label: 'Extreme close-up', short: 'ECU', hint: 'Just the face' },
];

export const CAMERA_ANGLES: { id: CameraAngle; label: string; hint: string }[] = [
  { id: 'eye-level', label: 'Eye level', hint: 'Neutral, at the height of the eyes' },
  { id: 'low', label: 'Low angle', hint: 'From below: strong, imposing' },
  { id: 'high', label: 'High angle', hint: 'From above: small, vulnerable' },
  { id: 'overhead', label: 'Overhead', hint: "Bird's eye, straight down" },
  { id: 'dutch', label: 'Dutch tilt', hint: 'Tilted horizon: unease' },
];

export function shotTypeInfo(id: string | undefined) {
  return SHOT_TYPES.find((s) => s.id === id);
}

export function angleInfo(id: string | undefined) {
  return CAMERA_ANGLES.find((a) => a.id === id);
}

/** What the camera frames: where it stands, how tall it is, where it faces. */
export interface Subject {
  position: Vec3;
  height: number;
  /** Half the footprint width, metres. */
  radius: number;
  /** Direction the subject faces (rotation about the vertical axis). */
  facing: number;
  isFigure: boolean;
}

export function subjectFrom(obj: SceneObject, state: ObjectState): Subject {
  return {
    position: state.position,
    height: Math.max(0.05, objectHeight(obj, state)),
    radius: kindRadius(obj.kind) * Math.max(state.scale[0], state.scale[2]),
    facing: state.rotationY,
    isFigure: obj.kind === 'figure',
  };
}

/**
 * Part of a person's height in frame, bottom and top as fractions of their
 * height (0 = feet, 1 = top of the head). Headroom is included in the top.
 */
const FIGURE_SPANS: Record<Exclude<ShotType, 'extreme-wide'>, [number, number]> = {
  wide: [-0.08, 1.1],
  'medium-wide': [0.36, 1.08],
  'medium': [0.5, 1.07],
  'medium-close-up': [0.66, 1.06],
  'close-up': [0.74, 1.05],
  'extreme-close-up': [0.88, 0.985],
};

/** For things that aren't people: how much of the frame height the object fills. */
const OBJECT_FILL: Record<ShotType, number> = {
  'extreme-wide': 0.12,
  wide: 0.55,
  'medium-wide': 0.7,
  medium: 0.85,
  'medium-close-up': 1.1,
  'close-up': 1.5,
  'extreme-close-up': 2.4,
};

const EXTREME_WIDE_FILL = 0.14;
const EYE_LINE = 0.93;

/** Camera height above the frame centre, as an elevation angle in radians. */
const ANGLE_PITCH: Record<CameraAngle, number> = {
  'eye-level': 0,
  low: (-22 * Math.PI) / 180,
  high: (30 * Math.PI) / 180,
  overhead: (88 * Math.PI) / 180,
  dutch: 0,
};

const DUTCH_ROLL = (15 * Math.PI) / 180;
const MIN_CAMERA_HEIGHT = 0.15;

/** Vertical span [bottom, top] in world metres that a shot type should show. */
export function frameSpan(subject: Subject, type: ShotType): [number, number] {
  const y0 = subject.position[1];
  const h = subject.height;
  if (subject.isFigure) {
    if (type === 'extreme-wide') {
      const span = h / EXTREME_WIDE_FILL;
      return [y0 + h / 2 - span / 2, y0 + h / 2 + span / 2];
    }
    const [b, t] = FIGURE_SPANS[type];
    return [y0 + b * h, y0 + t * h];
  }
  const size = Math.max(h, subject.radius * 2);
  const span = size / OBJECT_FILL[type];
  // Close framings of things keep the top in view, like a close-up keeps the head.
  const centre = OBJECT_FILL[type] > 1 ? y0 + h - span / 2 + 0.05 * span : y0 + h / 2;
  return [centre - span / 2, centre + span / 2];
}

/**
 * Places a camera so the subject fills the frame as the shot type says, seen
 * from the angle given. The camera stays on the side of the subject it is on
 * now, and keeps its lens. The frame height drives the distance, so the same
 * shot type looks the same on any lens and any aspect ratio.
 */
export function frameSubject(
  camera: CameraState,
  subject: Subject,
  type: ShotType,
  angle: CameraAngle,
  aspect: number,
): CameraState {
  const [bottom, top] = frameSpan(subject, type);
  const span = top - bottom;
  const aim: Vec3 = [subject.position[0], (bottom + top) / 2, subject.position[2]];
  const halfFov = (verticalFov(camera.focalLength, aspect) * Math.PI) / 360;
  const distance = span / 2 / Math.tan(halfFov);

  const dir = horizontalDirection(camera.position, subject);
  const pitch = ANGLE_PITCH[angle];
  let position: Vec3 = [
    aim[0] + dir[0] * distance * Math.cos(pitch),
    aim[1] + distance * Math.sin(pitch),
    aim[2] + dir[1] * distance * Math.cos(pitch),
  ];
  if ((angle === 'eye-level' || angle === 'dutch') && subject.isFigure && type !== 'extreme-close-up') {
    // People are filmed from the height of their eyes, looking slightly down at the frame centre.
    position = [position[0], subject.position[1] + subject.height * EYE_LINE, position[2]];
  }
  if (position[1] < MIN_CAMERA_HEIGHT) position = [position[0], MIN_CAMERA_HEIGHT, position[2]];

  return {
    position,
    target: aim,
    roll: angle === 'dutch' ? DUTCH_ROLL : 0,
    focalLength: camera.focalLength,
  };
}

/** Unit vector on the floor from the subject towards the camera (or out of its face). */
function horizontalDirection(cameraPos: Vec3, subject: Subject): [number, number] {
  const dx = cameraPos[0] - subject.position[0];
  const dz = cameraPos[2] - subject.position[2];
  const len = Math.hypot(dx, dz);
  if (len > 0.05) return [dx / len, dz / len];
  // Camera straight above: look at the subject's front. Figures face +Z.
  return [Math.sin(subject.facing), Math.cos(subject.facing)];
}

/**
 * Changes only the angle, keeping what the camera looks at and how far away
 * it is. Used when no shot type was picked, so the user's own framing stays.
 */
export function applyAngle(camera: CameraState, angle: CameraAngle): CameraState {
  const t = camera.target;
  const dx = camera.position[0] - t[0];
  const dz = camera.position[2] - t[2];
  const dy = camera.position[1] - t[1];
  const distance = Math.hypot(dx, dy, dz) || 1;
  const flat = Math.hypot(dx, dz);
  const dir: [number, number] = flat > 1e-3 ? [dx / flat, dz / flat] : [0, 1];
  const pitch = ANGLE_PITCH[angle];
  let y = t[1] + distance * Math.sin(pitch);
  if (y < MIN_CAMERA_HEIGHT) y = MIN_CAMERA_HEIGHT;
  return {
    ...camera,
    position: [t[0] + dir[0] * distance * Math.cos(pitch), y, t[2] + dir[1] * distance * Math.cos(pitch)],
    roll: angle === 'dutch' ? DUTCH_ROLL : 0,
  };
}

/**
 * The object a camera most likely means to frame: the one closest to its line
 * of sight, preferring people. Returns null for an empty scene.
 */
export function pickSubject<T extends { obj: SceneObject; state: ObjectState }>(
  camera: CameraState,
  candidates: T[],
): T | null {
  const p = camera.position;
  const f = normalize([camera.target[0] - p[0], camera.target[1] - p[1], camera.target[2] - p[2]]);
  let best: T | null = null;
  let bestScore = Infinity;
  for (const c of candidates) {
    if (!c.state.visible || c.obj.kind === 'arrow' || c.obj.kind === 'label') continue;
    const h = objectHeight(c.obj, c.state);
    const q: Vec3 = [c.state.position[0] - p[0], c.state.position[1] + h / 2 - p[1], c.state.position[2] - p[2]];
    const along = q[0] * f[0] + q[1] * f[1] + q[2] * f[2];
    const off = Math.hypot(q[0] - f[0] * along, q[1] - f[1] * along, q[2] - f[2] * along);
    // Things behind the camera count as far off the line of sight.
    const score = (along > 0 ? off / along : 10 + off) * (c.obj.kind === 'figure' ? 0.5 : 1);
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
