import type { CameraDef, CameraState, Project, ShotPhase, Vec3 } from './types';
import { evaluateCameraTrack } from './interpolate';
import { cameraStateAt, inheritedCameraState } from './scene';
import { newId } from './defaults';

/**
 * State of any camera at a shot and time. The shot's own camera follows its
 * track; the others stay where they were left in the last shot that used them.
 */
export function cameraStateFor(project: Project, shotIndex: number, t: number, cameraId: string): CameraState {
  const shot = project.shots[shotIndex];
  if (shot.cameraId === cameraId && shot.cameraTrack.length) return evaluateCameraTrack(shot.cameraTrack, t);
  return inheritedCameraState(project, shotIndex, cameraId);
}

/** "Cam A", "Cam B", … — the first letter not in use. */
export function nextCameraName(cameras: CameraDef[]): string {
  const used = new Set(cameras.map((c) => c.name));
  for (let i = 0; i < 26; i++) {
    const name = `Cam ${String.fromCharCode(65 + i)}`;
    if (!used.has(name)) return name;
  }
  return `Cam ${cameras.length + 1}`;
}

/** Swings a camera around the point it looks at, about the vertical axis. */
export function orbitAround(state: CameraState, pivot: Vec3, angle: number): CameraState {
  const rot = (p: Vec3): Vec3 => {
    const dx = p[0] - pivot[0];
    const dz = p[2] - pivot[2];
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return [pivot[0] + dx * c + dz * s, p[1], pivot[2] - dx * s + dz * c];
  };
  return { ...state, position: rot(state.position), target: rot(state.target) };
}

/**
 * Adds a camera and films the given shot with it. The new camera starts from
 * the current shot camera, swung 60° around what it looks at, so the user
 * immediately sees a different angle on the same action. Returns its id.
 */
export function addCamera(project: Project, shotIndex: number, phase: ShotPhase): string {
  const from = cameraStateAt(project, shotIndex, phase);
  const camera: CameraDef = {
    id: newId(),
    name: nextCameraName(project.cameras),
    base: orbitAround(from, from.target, Math.PI / 3),
  };
  project.cameras.push(camera);
  setShotCamera(project, shotIndex, camera.id);
  return camera.id;
}

/**
 * Films a shot with another camera. The shot's camera motion and framing
 * belonged to the old camera, so they are dropped (undo brings them back).
 */
export function setShotCamera(project: Project, shotIndex: number, cameraId: string): void {
  const shot = project.shots[shotIndex];
  if (!shot || shot.cameraId === cameraId || !project.cameras.some((c) => c.id === cameraId)) return;
  shot.cameraId = cameraId;
  shot.cameraTrack = [];
  delete shot.shotType;
  delete shot.cameraAngle;
  delete shot.cameraMove;
}

/** Removes a camera; shots that used it switch to the first remaining one. */
export function deleteCamera(project: Project, cameraId: string): void {
  if (project.cameras.length <= 1) return;
  const remaining = project.cameras.filter((c) => c.id !== cameraId);
  if (remaining.length === project.cameras.length) return;
  project.shots.forEach((shot, i) => {
    if (shot.cameraId === cameraId) {
      // Point at the survivor directly; setShotCamera would refuse the deleted id.
      shot.cameraId = '';
      setShotCamera(project, i, remaining[0].id);
    }
  });
  project.cameras = remaining;
}

/** Number of shots each camera films. */
export function cameraUsage(project: Project): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of project.cameras) out[c.id] = 0;
  for (const s of project.shots) out[s.cameraId] = (out[s.cameraId] ?? 0) + 1;
  return out;
}

/** Keys held for walking the camera: each axis is -1, 0 or 1. */
export interface WalkInput {
  /** W = 1, S = -1. */
  forward: number;
  /** D = 1, A = -1. */
  right: number;
  /** E = 1, Q = -1. */
  up: number;
}

/**
 * Walks a camera like a game camera: forward and sideways along the floor
 * (so the height stays, like a dolly), up and down straight. The aim moves
 * with it, so the camera keeps looking the same way.
 */
export function walkCamera(state: CameraState, input: WalkInput, distance: number): CameraState {
  const fx = state.target[0] - state.position[0];
  const fz = state.target[2] - state.position[2];
  const flat = Math.hypot(fx, fz);
  // Looking straight down: walk along the screen's up direction (-Z).
  const [dx, dz] = flat > 1e-6 ? [fx / flat, fz / flat] : [0, -1];
  let mx = dx * input.forward - dz * input.right;
  let mz = dz * input.forward + dx * input.right;
  let my = input.up;
  const len = Math.hypot(mx, my, mz);
  if (len === 0) return state;
  mx = (mx / len) * distance;
  my = (my / len) * distance;
  mz = (mz / len) * distance;
  // Never below the floor.
  if (state.position[1] + my < 0.05) my = 0.05 - state.position[1];
  return {
    ...state,
    position: [state.position[0] + mx, state.position[1] + my, state.position[2] + mz],
    target: [state.target[0] + mx, state.target[1] + my, state.target[2] + mz],
  };
}
