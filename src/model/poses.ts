import type { Pose, ResolvedObjectState } from './types';
import { lerp } from './interpolate';

/**
 * Joint angles of the mannequin, in radians, applied as local rotations.
 * Limbs hang down, so a negative X rotation swings a limb forward.
 * `drop` lowers the hips (metres, adult scale); `pitch` tilts the whole body.
 */
export interface PoseJoints {
  drop: number;
  pitch: number;
  spine: number;
  neck: number;
  lShoulder: number;
  lShoulderZ: number;
  lElbow: number;
  rShoulder: number;
  rShoulderZ: number;
  rElbow: number;
  lHip: number;
  lKnee: number;
  rHip: number;
  rKnee: number;
}

const STAND: PoseJoints = {
  drop: 0,
  pitch: 0,
  spine: 0,
  neck: 0,
  lShoulder: 0,
  lShoulderZ: -0.08,
  lElbow: -0.1,
  rShoulder: 0,
  rShoulderZ: 0.08,
  rElbow: -0.1,
  lHip: 0,
  lKnee: 0,
  rHip: 0,
  rKnee: 0,
};

export const POSES: Record<Pose, PoseJoints> = {
  stand: STAND,
  walk: {
    ...STAND,
    drop: -0.03,
    spine: 0.04,
    lShoulder: 0.4,
    lElbow: -0.3,
    rShoulder: -0.4,
    rElbow: -0.45,
    lHip: -0.45,
    lKnee: 0.12,
    rHip: 0.35,
    rKnee: 0.45,
  },
  run: {
    ...STAND,
    drop: -0.08,
    spine: 0.22,
    neck: -0.15,
    lShoulder: 0.8,
    lShoulderZ: -0.15,
    lElbow: -1.4,
    rShoulder: -0.9,
    rShoulderZ: 0.15,
    rElbow: -1.4,
    lHip: -0.95,
    lKnee: 1.0,
    rHip: 0.55,
    rKnee: 1.2,
  },
  sit: {
    ...STAND,
    drop: -0.42,
    spine: -0.05,
    lShoulder: -0.35,
    lElbow: -0.7,
    rShoulder: -0.35,
    rElbow: -0.7,
    lHip: -1.57,
    lKnee: 1.57,
    rHip: -1.57,
    rKnee: 1.57,
  },
  point: {
    ...STAND,
    rShoulder: -1.5,
    rShoulderZ: 0.05,
    rElbow: 0,
    neck: 0.05,
  },
  lie: {
    ...STAND,
    drop: -0.76,
    pitch: -Math.PI / 2,
    lShoulderZ: -0.15,
    rShoulderZ: 0.15,
  },
};

export const POSE_LABELS: Record<Pose, string> = {
  stand: 'Stand',
  walk: 'Walk',
  run: 'Run',
  sit: 'Sit',
  point: 'Point',
  lie: 'Lie',
};

export const POSE_ORDER: Pose[] = ['stand', 'walk', 'run', 'sit', 'point', 'lie'];

export function blendPose(a: PoseJoints, b: PoseJoints, w: number): PoseJoints {
  const out = { ...a };
  for (const k of Object.keys(a) as (keyof PoseJoints)[]) out[k] = lerp(a[k], b[k], w);
  return out;
}

/** Joint angles for an evaluated figure state, blending poses mid-shot. */
export function jointsFor(state: ResolvedObjectState): PoseJoints {
  if (state.poseBlend) {
    return blendPose(POSES[state.poseBlend.from], POSES[state.poseBlend.to], state.poseBlend.w);
  }
  return POSES[state.pose ?? 'stand'];
}
