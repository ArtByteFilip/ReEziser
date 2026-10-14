import type {
  CameraState,
  Key,
  ObjectState,
  Project,
  ResolvedObjectState,
  SceneObject,
  Shot,
  ShotPhase,
} from './types';
import { evaluateCameraTrack, evaluateObjectTrack, vec3Equal } from './interpolate';
import { createShot, newId } from './defaults';
import { duplicateGroups, pruneGroups } from './groups';

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export function phaseT(phase: ShotPhase): number {
  return phase === 'start' ? 0 : phase === 'end' ? 1 : phase;
}

/** Times this close to a key count as that key. */
export const KEY_EPSILON = 0.005;

function lastValue<T>(keys: Key<T>[]): T {
  return keys[keys.length - 1].value;
}

/** State an object has entering shot `shotIndex`: end of the last earlier track, or its base. */
export function inheritedObjectState(project: Project, shotIndex: number, obj: SceneObject): ObjectState {
  for (let i = shotIndex - 1; i >= 0; i--) {
    const keys = project.shots[i].objectTracks[obj.id];
    if (keys && keys.length) return lastValue(keys);
  }
  return obj.base;
}

export function resolveObjectState(
  project: Project,
  shotIndex: number,
  t: number,
  obj: SceneObject,
): ResolvedObjectState {
  const shot = project.shots[shotIndex];
  const keys = shot?.objectTracks[obj.id];
  if (keys && keys.length) return evaluateObjectTrack(keys, t);
  return inheritedObjectState(project, shotIndex, obj);
}

export function resolveFrame(project: Project, shotIndex: number, t: number): Record<string, ResolvedObjectState> {
  const out: Record<string, ResolvedObjectState> = {};
  for (const obj of project.objects) out[obj.id] = resolveObjectState(project, shotIndex, t, obj);
  return out;
}

/** State a camera has entering shot `shotIndex`. */
export function inheritedCameraState(project: Project, shotIndex: number, cameraId: string): CameraState {
  for (let i = shotIndex - 1; i >= 0; i--) {
    const shot = project.shots[i];
    if (shot.cameraId === cameraId && shot.cameraTrack.length) return lastValue(shot.cameraTrack);
  }
  const cam = project.cameras.find((c) => c.id === cameraId) ?? project.cameras[0];
  return cam.base;
}

export function resolveCamera(project: Project, shotIndex: number, t: number): CameraState {
  const shot = project.shots[shotIndex];
  if (shot.cameraTrack.length) return evaluateCameraTrack(shot.cameraTrack, t);
  return inheritedCameraState(project, shotIndex, shot.cameraId);
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

export function totalDuration(project: Project): number {
  return project.shots.reduce((sum, s) => sum + s.duration, 0);
}

/** Converts a film time (seconds) to a shot index and normalized time within it. */
export function locateTime(project: Project, time: number): { shotIndex: number; t: number } {
  let start = 0;
  for (let i = 0; i < project.shots.length; i++) {
    const d = project.shots[i].duration;
    if (time < start + d || i === project.shots.length - 1) {
      return { shotIndex: i, t: d > 0 ? Math.min(1, Math.max(0, (time - start) / d)) : 1 };
    }
    start += d;
  }
  return { shotIndex: 0, t: 0 };
}

export function shotStartTime(project: Project, shotIndex: number): number {
  let start = 0;
  for (let i = 0; i < shotIndex; i++) start += project.shots[i].duration;
  return start;
}

// ---------------------------------------------------------------------------
// Editing (mutating; intended to run inside an immer recipe)
// ---------------------------------------------------------------------------

export function objectStatesEqual(a: ObjectState, b: ObjectState): boolean {
  return (
    vec3Equal(a.position, b.position) &&
    Math.abs(a.rotationY - b.rotationY) < 1e-6 &&
    vec3Equal(a.scale, b.scale) &&
    (a.rotationXZ?.[0] ?? 0) === (b.rotationXZ?.[0] ?? 0) &&
    (a.rotationXZ?.[1] ?? 0) === (b.rotationXZ?.[1] ?? 0) &&
    (a.pose ?? null) === (b.pose ?? null) &&
    a.visible === b.visible
  );
}

export function cameraStatesEqual(a: CameraState, b: CameraState): boolean {
  return (
    vec3Equal(a.position, b.position) &&
    vec3Equal(a.target, b.target) &&
    Math.abs(a.roll - b.roll) < 1e-6 &&
    Math.abs(a.focalLength - b.focalLength) < 1e-6
  );
}

function isStatic<T>(keys: Key<T>[], equal: (a: T, b: T) => boolean): boolean {
  return keys.every((k) => equal(k.value, keys[0].value));
}

/**
 * Writes `next` into a track at the given phase, following the shot rules:
 * - a static track edited at its start moves as a whole (stays static);
 * - editing the end of a static track creates motion;
 * - a track with motion only changes the edited end.
 * Returns the new key list, or null when the track adds nothing over `inherited`.
 */
function writeKey<T>(
  keys: Key<T>[] | undefined,
  phase: ShotPhase,
  next: T,
  inherited: T,
  equal: (a: T, b: T) => boolean,
): Key<T>[] | null {
  if (typeof phase === 'number') return writeMiddleKey(keys, phase, next, inherited, equal);
  let out: Key<T>[];
  if (!keys || keys.length === 0) {
    out =
      phase === 'start'
        ? [key(0, next), key(1, next)]
        : [key(0, inherited), key(1, next)];
  } else if (isStatic(keys, equal)) {
    out = phase === 'start' ? keys.map((k) => ({ ...k, value: next })) : replaceAt(keys, keys.length - 1, next);
  } else {
    out = replaceAt(keys, phase === 'start' ? 0 : keys.length - 1, next);
  }
  if (isStatic(out, equal) && equal(out[0].value, inherited)) return null;
  return out;
}

/**
 * Writes a key at a time inside the shot: replaces a key already there, or
 * inserts one that splits its segment (both halves keep that segment's easing).
 * A shot without a track gets one that starts and ends at the inherited state.
 */
function writeMiddleKey<T>(
  keys: Key<T>[] | undefined,
  t: number,
  next: T,
  inherited: T,
  equal: (a: T, b: T) => boolean,
): Key<T>[] | null {
  const base = keys && keys.length ? keys : [key(0, inherited), key(1, inherited)];
  const at = base.findIndex((k) => Math.abs(k.t - t) < KEY_EPSILON);
  let out: Key<T>[];
  if (at >= 0) out = replaceAt(base, at, next);
  else {
    const after = base.findIndex((k) => k.t > t);
    const i = after === -1 ? base.length : after;
    const easing = base[Math.max(0, i - 1)].easing;
    out = [...base.slice(0, i), { t, value: next, easing }, ...base.slice(i)];
  }
  if (isStatic(out, equal) && equal(out[0].value, inherited)) return null;
  return out;
}

function key<T>(t: number, value: T): Key<T> {
  return { t, value, easing: 'smooth' };
}

function replaceAt<T>(keys: Key<T>[], i: number, value: T): Key<T>[] {
  return keys.map((k, j) => (j === i ? { ...k, value } : k));
}

/** Current editable state of an object at a phase of a shot. */
export function objectStateAt(project: Project, shotIndex: number, phase: ShotPhase, obj: SceneObject): ObjectState {
  const { poseBlend: _ignored, ...state } = resolveObjectState(project, shotIndex, phaseT(phase), obj);
  return state;
}

export function setObjectState(
  project: Project,
  shotIndex: number,
  phase: ShotPhase,
  objectId: string,
  next: ObjectState,
): void {
  const obj = project.objects.find((o) => o.id === objectId);
  const shot = project.shots[shotIndex];
  if (!obj || !shot) return;
  const inherited = inheritedObjectState(project, shotIndex, obj);
  const keys = writeKey(shot.objectTracks[objectId], phase, next, inherited, objectStatesEqual);
  if (keys) shot.objectTracks[objectId] = keys;
  else delete shot.objectTracks[objectId];
}

export function cameraStateAt(project: Project, shotIndex: number, phase: ShotPhase): CameraState {
  return resolveCamera(project, shotIndex, phaseT(phase));
}

export function setCameraState(project: Project, shotIndex: number, phase: ShotPhase, next: CameraState): void {
  const shot = project.shots[shotIndex];
  if (!shot) return;
  const inherited = inheritedCameraState(project, shotIndex, shot.cameraId);
  shot.cameraTrack = writeKey(shot.cameraTrack, phase, next, inherited, cameraStatesEqual) ?? [];
}

/** True if the object (or camera, for `cameraId`) moves within the shot. */
export function hasMotion(shot: Shot, objectId: string): boolean {
  const keys = shot.objectTracks[objectId];
  return !!keys && !isStatic(keys, objectStatesEqual);
}

export function cameraHasMotion(shot: Shot): boolean {
  return shot.cameraTrack.length > 0 && !isStatic(shot.cameraTrack, cameraStatesEqual);
}

/** Removes motion: the end becomes the start. */
export function clearObjectMotion(project: Project, shotIndex: number, objectId: string): void {
  const shot = project.shots[shotIndex];
  const keys = shot?.objectTracks[objectId];
  if (!keys) return;
  const first = keys[0].value;
  const obj = project.objects.find((o) => o.id === objectId);
  if (obj && objectStatesEqual(first, inheritedObjectState(project, shotIndex, obj))) {
    delete shot.objectTracks[objectId];
  } else {
    shot.objectTracks[objectId] = keys.map((k) => ({ ...k, value: first }));
  }
}

export function clearCameraMotion(project: Project, shotIndex: number): void {
  const shot = project.shots[shotIndex];
  if (!shot) return;
  delete shot.cameraMove;
  if (!shot.cameraTrack.length) return;
  const first = shot.cameraTrack[0].value;
  shot.cameraTrack = shot.cameraTrack.map((k) => ({ ...k, value: first }));
}

// ---------------------------------------------------------------------------
// Shots
// ---------------------------------------------------------------------------

/** Inserts a new shot after `afterIndex`; it inherits the previous shot's end state. Returns its index. */
export function insertShot(project: Project, afterIndex: number): number {
  const prev = project.shots[afterIndex];
  const shot = createShot(prev?.cameraId ?? project.cameras[0].id, project.shots.length);
  project.shots.splice(afterIndex + 1, 0, shot);
  renumberShots(project);
  return afterIndex + 1;
}

export function duplicateShot(project: Project, index: number): number {
  const src = project.shots[index];
  const copy: Shot = JSON.parse(JSON.stringify(src));
  copy.id = newId();
  project.shots.splice(index + 1, 0, copy);
  renumberShots(project);
  return index + 1;
}

export function deleteShot(project: Project, index: number): void {
  if (project.shots.length <= 1) {
    project.shots[0] = createShot(project.shots[0].cameraId, 0);
    return;
  }
  project.shots.splice(index, 1);
  renumberShots(project);
}

export function moveShot(project: Project, from: number, to: number): void {
  if (from === to) return;
  const [shot] = project.shots.splice(from, 1);
  project.shots.splice(to, 0, shot);
  renumberShots(project);
}

/** Keeps auto-generated names ("Shot N") in sync with order; custom names stay. */
export function renumberShots(project: Project): void {
  project.shots.forEach((s, i) => {
    if (/^Shot \d+$/.test(s.name)) s.name = `Shot ${i + 1}`;
  });
}

// ---------------------------------------------------------------------------
// Objects
// ---------------------------------------------------------------------------

export function deleteObjects(project: Project, ids: string[]): void {
  const set = new Set(ids);
  project.objects = project.objects.filter((o) => !set.has(o.id));
  for (const shot of project.shots) {
    for (const id of ids) delete shot.objectTracks[id];
  }
  pruneGroups(project, ids);
}

/**
 * Duplicates objects as static copies placed at their current state, offset sideways.
 * Returns the new ids.
 */
export function duplicateObjects(
  project: Project,
  ids: string[],
  shotIndex: number,
  phase: ShotPhase,
  offset: [number, number, number] = [0.5, 0, 0.5],
): string[] {
  const newIds: string[] = [];
  const copies: Record<string, string> = {};
  for (const id of ids) {
    const obj = project.objects.find((o) => o.id === id);
    if (!obj) continue;
    const state = objectStateAt(project, shotIndex, phase, obj);
    const copy: SceneObject = {
      ...JSON.parse(JSON.stringify(obj)),
      id: newId(),
      name: `${obj.name} copy`,
      locked: false,
      base: {
        ...state,
        position: [state.position[0] + offset[0], state.position[1] + offset[1], state.position[2] + offset[2]],
      },
    };
    project.objects.push(copy);
    newIds.push(copy.id);
    copies[id] = copy.id;
  }
  duplicateGroups(project, copies);
  return newIds;
}
