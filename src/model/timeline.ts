import type { CameraState, Easing, Key, ObjectState, Project, Shot } from './types';
import { evaluateCameraTrack, evaluateObjectTrack } from './interpolate';
import {
  KEY_EPSILON,
  cameraStatesEqual,
  inheritedCameraState,
  inheritedObjectState,
  objectStatesEqual,
  renumberShots,
} from './scene';
import { newId } from './defaults';

/**
 * The detailed timeline (expert level): middle keys, their timing, easing
 * per stretch, and splitting a shot in two. Mutating functions run inside an
 * immer recipe, like the rest of the model.
 */

/** A row of the timeline: an object's track, or the shot camera's. */
export type TrackRef = { kind: 'object'; id: string } | { kind: 'camera' };

/** User-facing easing names, in the order the timeline offers them. */
export const EASINGS: { id: Easing; label: string; hint: string }[] = [
  { id: 'smooth', label: 'Smooth', hint: 'Starts and stops gently' },
  { id: 'linear', label: 'Linear', hint: 'Even speed all the way' },
  // easeOut starts at full speed and slows down: the start is abrupt.
  { id: 'easeOut', label: 'Abrupt start', hint: 'Starts at full speed, then slows down' },
  { id: 'easeIn', label: 'Abrupt end', hint: 'Speeds up and stops hard' },
];

/** Smallest gap between two keys, as a fraction of the shot. */
const MIN_GAP = 0.01;

function keysOf(shot: Shot, ref: TrackRef): Key<ObjectState>[] | Key<CameraState>[] | undefined {
  return ref.kind === 'camera' ? shot.cameraTrack : shot.objectTracks[ref.id];
}

/** Moves a middle key in time; it can't pass its neighbours. The first and last keys stay at 0 and 1. */
export function moveKey(project: Project, shotIndex: number, ref: TrackRef, index: number, t: number): void {
  const keys = keysOf(project.shots[shotIndex], ref);
  if (!keys || index <= 0 || index >= keys.length - 1) return;
  const lo = keys[index - 1].t + MIN_GAP;
  const hi = keys[index + 1].t - MIN_GAP;
  keys[index].t = Math.min(hi, Math.max(lo, t));
}

/** Removes a middle key. Ends can't be removed (remove the motion instead). */
export function deleteKey(project: Project, shotIndex: number, ref: TrackRef, index: number): void {
  const shot = project.shots[shotIndex];
  const keys = keysOf(shot, ref);
  if (!keys || index <= 0 || index >= keys.length - 1) return;
  keys.splice(index, 1);
}

/** Sets the easing of the stretch that starts at key `index`. */
export function setSegmentEasing(project: Project, shotIndex: number, ref: TrackRef, index: number, easing: Easing): void {
  const keys = keysOf(project.shots[shotIndex], ref);
  if (!keys || index < 0 || index >= keys.length - 1) return;
  keys[index].easing = easing;
}

/** The index of the key at time t, if there is one. */
export function keyIndexAt(keys: { t: number }[] | undefined, t: number): number {
  return keys ? keys.findIndex((k) => Math.abs(k.t - t) < KEY_EPSILON) : -1;
}

/**
 * Cuts a track at time t into the part before and the part after, each
 * rescaled to 0..1. The cut gets a key on both sides with the state at t.
 */
export function cutKeys<T>(keys: Key<T>[], t: number, valueAt: (t: number) => T): [Key<T>[], Key<T>[]] {
  // The stretch being cut keeps its speed across the cut: it is resampled
  // with a few evenly timed linear keys on each side, so neither half
  // slows to a stop at the cut the way its easing curve alone would.
  const SAMPLES = 8;
  let startIdx = 0;
  keys.forEach((k, i) => {
    if (k.t <= t + KEY_EPSILON) startIdx = i;
  });
  const lo = keys[startIdx].t;
  const hi = keys[Math.min(keys.length - 1, startIdx + 1)].t;
  const onKey = Math.abs(lo - t) < KEY_EPSILON;

  const before: Key<T>[] = [];
  for (const k of keys) {
    if (k.t >= t - KEY_EPSILON) break;
    before.push({ ...k, t: k.t / t, easing: !onKey && k.t === lo ? 'linear' : k.easing });
  }
  if (!onKey) {
    for (let j = 1; j < SAMPLES; j++) {
      const u = lo + ((t - lo) * j) / SAMPLES;
      before.push({ t: u / t, value: valueAt(u), easing: 'linear' });
    }
  }
  before.push({ t: 1, value: valueAt(t), easing: 'smooth' });

  const after: Key<T>[] = [];
  const cutEasing = onKey ? keys[startIdx].easing : 'linear';
  after.push({ t: 0, value: valueAt(t), easing: cutEasing });
  if (!onKey && hi > t) {
    for (let j = 1; j < SAMPLES; j++) {
      const u = t + ((hi - t) * j) / SAMPLES;
      after.push({ t: (u - t) / (1 - t), value: valueAt(u), easing: 'linear' });
    }
  }
  for (const k of keys) if (k.t > t + KEY_EPSILON) after.push({ ...k, t: (k.t - t) / (1 - t) });
  if (after.length === 1) after.push({ t: 1, value: valueAt(t), easing: 'smooth' });
  return [before, after];
}

function stripBlend(s: ObjectState & { poseBlend?: unknown }): ObjectState {
  const { poseBlend: _blend, ...rest } = s;
  return rest;
}

function isStaticAt<T>(keys: Key<T>[], value: T, equal: (a: T, b: T) => boolean): boolean {
  return keys.every((k) => equal(k.value, value));
}

/**
 * Splits shot `index` at time t (0..1) into two shots that play exactly as
 * the original did. The second shot keeps the camera, shot type and angle;
 * the note and a camera-move label stay with the first. Returns the new
 * shot's index, or -1 when t is too close to an end.
 */
export function splitShot(project: Project, index: number, t: number): number {
  const shot = project.shots[index];
  if (!shot || t < 0.02 || t > 0.98) return -1;
  const second: Shot = {
    id: newId(),
    name: `Shot ${index + 2}`,
    note: '',
    duration: Math.round(shot.duration * (1 - t) * 100) / 100,
    cameraId: shot.cameraId,
    objectTracks: {},
    cameraTrack: [],
    ...(shot.shotType ? { shotType: shot.shotType } : {}),
    ...(shot.cameraAngle ? { cameraAngle: shot.cameraAngle } : {}),
  };
  shot.duration = Math.round(shot.duration * t * 100) / 100;

  for (const [id, keys] of Object.entries(shot.objectTracks)) {
    const [before, after] = cutKeys(keys, t, (u) => stripBlend(evaluateObjectTrack(keys, u)));
    shot.objectTracks[id] = before;
    second.objectTracks[id] = after;
  }
  if (shot.cameraTrack.length) {
    const keys = shot.cameraTrack;
    const [before, after] = cutKeys(keys, t, (u) => evaluateCameraTrack(keys, u));
    shot.cameraTrack = before;
    second.cameraTrack = after;
    delete second.cameraMove;
  }

  project.shots.splice(index + 1, 0, second);

  // Drop halves that add nothing over what they inherit, so inheritance keeps working.
  for (const i of [index, index + 1]) {
    const s = project.shots[i];
    for (const [id, keys] of Object.entries(s.objectTracks)) {
      const obj = project.objects.find((o) => o.id === id);
      if (obj && isStaticAt(keys, inheritedObjectState(project, i, obj), objectStatesEqual)) delete s.objectTracks[id];
    }
    if (s.cameraTrack.length && isStaticAt(s.cameraTrack, inheritedCameraState(project, i, s.cameraId), cameraStatesEqual)) {
      s.cameraTrack = [];
    }
  }
  renumberShots(project);
  return index + 1;
}
