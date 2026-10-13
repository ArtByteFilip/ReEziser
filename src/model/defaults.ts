import type { CameraDef, CameraState, ObjectKind, ObjectState, Project, SceneObject, Shot } from './types';
import { DEFAULT_FOCAL_LENGTH } from './lens';

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Muted palette; the first entry is the default for props, the second for figures. */
export const PALETTE = [
  '#9aa3ad', // stone
  '#d9b99b', // sand
  '#c97b63', // terracotta
  '#d4a35a', // ochre
  '#a7b56b', // olive
  '#6f9c7f', // sage
  '#5f9ea0', // teal
  '#6b8cc4', // slate blue
  '#8a7bb8', // lavender
  '#b87ba0', // mauve
  '#e8e4dc', // chalk
  '#4a4f57', // charcoal
];

export const KIND_LABELS: Record<ObjectKind, string> = {
  box: 'Box',
  sphere: 'Sphere',
  cylinder: 'Cylinder',
  cone: 'Cone',
  plane: 'Wall',
  ramp: 'Ramp',
  figure: 'Person',
  arrow: 'Arrow',
  label: 'Label',
  group: 'Group',
};

export const DEFAULT_SHOT_DURATION = 3;

export function defaultObjectState(kind: ObjectKind, position: [number, number, number] = [0, 0, 0]): ObjectState {
  return {
    position,
    rotationY: 0,
    scale: [1, 1, 1],
    visible: true,
    ...(kind === 'figure' ? { pose: 'stand' as const } : {}),
  };
}

export function defaultCameraState(): CameraState {
  return {
    position: [0, 1.6, 7],
    target: [0, 1.1, 0],
    roll: 0,
    focalLength: DEFAULT_FOCAL_LENGTH,
  };
}

export function createObject(kind: ObjectKind, existing: SceneObject[], position?: [number, number, number]): SceneObject {
  const label = KIND_LABELS[kind];
  const count = existing.filter((o) => o.kind === kind).length + 1;
  return {
    id: newId(),
    kind,
    name: `${label} ${count}`,
    color: kind === 'figure' ? PALETTE[1] : PALETTE[0],
    ...(kind === 'figure' ? { figureSize: 'adult' as const } : {}),
    base: defaultObjectState(kind, position),
  };
}

export function createCamera(index: number): CameraDef {
  return {
    id: newId(),
    name: `Cam ${String.fromCharCode(65 + index)}`,
    base: defaultCameraState(),
  };
}

export function createShot(cameraId: string, index: number): Shot {
  return {
    id: newId(),
    name: `Shot ${index + 1}`,
    note: '',
    duration: DEFAULT_SHOT_DURATION,
    cameraId,
    objectTracks: {},
    cameraTrack: [],
  };
}

export function createProject(): Project {
  const camera = createCamera(0);
  return {
    version: 1,
    name: 'Untitled scene',
    aspectRatio: '16:9',
    fps: 24,
    objects: [],
    cameras: [camera],
    shots: [createShot(camera.id, 0)],
  };
}
