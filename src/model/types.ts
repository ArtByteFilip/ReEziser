export type Vec3 = [number, number, number];

export type AspectRatio = '16:9' | '2.39:1' | '4:3' | '1:1' | '9:16';
export type Fps = 24 | 25 | 30;

export type ObjectKind =
  | 'box'
  | 'sphere'
  | 'cylinder'
  | 'cone'
  | 'plane'
  | 'ramp'
  | 'figure'
  | 'arrow'
  | 'label'
  | 'group';

export type Pose = 'stand' | 'walk' | 'run' | 'sit' | 'point' | 'lie';

export interface Project {
  version: 1;
  name: string;
  aspectRatio: AspectRatio;
  fps: Fps;
  objects: SceneObject[];
  cameras: CameraDef[];
  shots: Shot[];
  /** Objects that select and move together (Ctrl+G). */
  groups?: Group[];
  audio?: { file: string; offset: number; beats?: number[] };
}

export interface SceneObject {
  id: string;
  kind: ObjectKind;
  name: string;
  color: string;
  /** Floating text above the object ("Peter", "car"). */
  label?: string;
  locked?: boolean;
  children?: string[];
  figureSize?: 'child' | 'adult';
  text?: string;
  /** State used before the first shot that has a track for this object. */
  base: ObjectState;
}

export interface Group {
  id: string;
  name: string;
  /** Object ids and nested group ids. */
  children: string[];
}

export interface Transform {
  position: Vec3;
  rotationY: number;
  rotationXZ?: [number, number];
  scale: Vec3;
}

export interface ObjectState extends Transform {
  pose?: Pose;
  visible: boolean;
}

export interface CameraDef {
  id: string;
  name: string;
  /** State used before the first shot that has a camera track. */
  base: CameraState;
}

export interface CameraState {
  position: Vec3;
  target: Vec3;
  roll: number;
  focalLength: number;
}

export type Easing = 'smooth' | 'linear' | 'easeIn' | 'easeOut';

export interface Key<T> {
  t: number;
  value: T;
  easing: Easing;
}

export interface Shot {
  id: string;
  name: string;
  note: string;
  duration: number;
  cameraId: string;
  /** One-click framing the user picked ('close-up', …); a label, kept until another is picked. */
  shotType?: string;
  /** Angle picked with the shot type ('low', …). */
  cameraAngle?: string;
  /** Camera move preset ('dolly-in', …). */
  cameraMove?: string;
  objectTracks: Record<string, Key<ObjectState>[]>;
  cameraTrack: Key<CameraState>[];
  paths?: Record<string, Vec3[]>;
}

/** Which end of a shot the user is editing. */
export type ShotPhase = 'start' | 'end';

/** Object state after evaluation, including an in-between pose blend. */
export interface ResolvedObjectState extends ObjectState {
  poseBlend?: { from: Pose; to: Pose; w: number };
}
