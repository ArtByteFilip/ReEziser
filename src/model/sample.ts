import type { CameraState, ObjectState, Project, SceneObject } from './types';
import { createObject, createProject, PALETTE } from './defaults';
import { addCamera, setShotCamera } from './cameras';
import { applyCameraMove } from './cameraMoves';
import { frameSubject, subjectFrom, type CameraAngle, type ShotType } from './framing';
import { aspectValue } from './lens';
import { insertShot, objectStateAt, setCameraState, setObjectState } from './scene';

/**
 * The sample scene (Menu → Open sample scene): a short café meeting in four
 * shots, built with the same model functions the app uses, so it shows what
 * each tool makes. Three cameras stay on one side of the 180° line.
 */
export function createSampleProject(): Project {
  const p = createProject();
  p.name = 'Sample: The café';

  const add = (kind: SceneObject['kind'], name: string, state: Partial<ObjectState>, extra: Partial<SceneObject> = {}) => {
    const obj = createObject(kind, p.objects);
    obj.name = name;
    obj.base = { ...obj.base, ...state };
    Object.assign(obj, extra);
    p.objects.push(obj);
    return obj;
  };

  const anna = add('figure', 'Anna', { position: [-5, 0, 2], rotationY: Math.PI / 2, pose: 'walk' }, { label: 'Anna', color: PALETTE[5] });
  const peter = add('figure', 'Peter', { position: [1, 0, 0], rotationY: -Math.PI / 2, pose: 'sit' }, { label: 'Peter', color: PALETTE[7] });
  add('box', 'Table', { position: [0, 0, 0], scale: [0.9, 0.75, 0.8] }, { color: PALETTE[3] });
  add('box', 'Chair', { position: [-1, 0, 0], scale: [0.45, 0.45, 0.45] }, { color: PALETTE[2] });
  add('box', 'Chair', { position: [1, 0, 0], scale: [0.45, 0.45, 0.45] }, { color: PALETTE[2] });
  add('plane', 'Back wall', { position: [0, 0, -3], scale: [4, 1.2, 1] }, { color: PALETTE[10] });
  add('box', 'Counter', { position: [3.5, 0, -2], scale: [2.5, 1.05, 0.7] }, { color: PALETTE[0] });
  add('arrow', 'Anna’s way', { position: [-3.2, 0, 1.2], rotationY: Math.atan2(3.4, -1.8), scale: [1, 1, 3.6] }, { color: PALETTE[2] });
  add('label', 'Door', { position: [-5.5, 0, 2.5] }, { text: 'Door', color: PALETTE[3] });

  const aspect = aspectValue(p.aspectRatio);
  /** One-click framing, as the Framing tools do it, at the start (or end) of a shot. */
  const frame = (
    shot: number,
    who: SceneObject,
    type: ShotType,
    from: CameraState,
    angle: CameraAngle = 'eye-level',
    phase: 'start' | 'end' = 'start',
  ) => {
    const next = frameSubject(from, subjectFrom(who, objectStateAt(p, shot, phase, who)), type, angle, aspect);
    setCameraState(p, shot, phase, next);
    p.shots[shot].shotType = type;
    p.shots[shot].cameraAngle = angle;
  };
  const camAt = (position: CameraState['position'], target: CameraState['target'], focalLength = 35): CameraState => ({
    position,
    target,
    roll: 0,
    focalLength,
  });

  // 1. Wide: Anna comes in through the door and walks to the table; the camera follows her a little.
  const s1 = p.shots[0];
  s1.name = 'Anna arrives';
  s1.duration = 4;
  s1.note = 'Anna enters from the door, looks around, and heads for Peter’s table.';
  // A pan by hand (Start and End), following her from the door to the table.
  setCameraState(p, 0, 'start', camAt([-1, 1.6, 8.5], [-4.2, 1, 1.6], 28));
  setCameraState(p, 0, 'end', camAt([-1, 1.6, 8.5], [-0.6, 0.9, 0.2], 28));
  p.shots[0].shotType = 'wide';
  p.shots[0].cameraMove = 'pan-right';
  setObjectState(p, 0, 'end', anna.id, { ...anna.base, position: [-1.7, 0, 0.4], rotationY: Math.PI / 2, pose: 'stand' });

  // 2. Medium close-up on Peter, over Anna's shoulder: he looks up. Slow push in.
  insertShot(p, 0);
  addCamera(p, 1, 'start');
  const s2 = p.shots[1];
  s2.name = 'Peter looks up';
  s2.duration = 2.5;
  s2.note = 'He recognises her. Hold on his face.';
  frame(1, peter, 'medium-close-up', camAt([-2.8, 1.5, 2.6], [1, 1.1, 0], 50));
  applyCameraMove(p, 1, 'dolly', 1);

  // 3. Medium on Anna from Peter's side (same side of the line): she sits down.
  insertShot(p, 1);
  addCamera(p, 2, 'start');
  const s3 = p.shots[2];
  s3.name = 'Anna sits';
  s3.duration = 3;
  s3.note = 'Same side of the 180° line as shot 2, so they still face each other.';
  setObjectState(p, 2, 'end', anna.id, { ...anna.base, position: [-1, 0, 0], rotationY: Math.PI / 2, pose: 'sit' });
  // Framed at both ends, so the camera tilts down with her as she sits.
  frame(2, anna, 'medium', camAt([2.8, 1.5, 2.8], [-1.5, 1, 0.3], 50));
  frame(2, anna, 'medium', camAt([2.8, 1.5, 2.8], [-1.5, 1, 0.3], 50), 'eye-level', 'end');

  // 4. Back to the wide camera: it cranes up and away as they talk.
  insertShot(p, 2);
  setShotCamera(p, 3, p.cameras[0].id);
  const s4 = p.shots[3];
  s4.name = 'Together';
  s4.duration = 4;
  s4.note = 'Crane up and out: the two of them, small in the café.';
  setCameraState(p, 3, 'start', camAt([0.4, 2.2, 6], [0, 0.7, 0], 28));
  s4.shotType = 'wide';
  s4.cameraAngle = 'high';
  applyCameraMove(p, 3, 'crane', 1);
  applyCameraMove(p, 3, 'dolly', -1);
  // Both: rise and pull back. The label says crane, the main move.
  const end = p.shots[3].cameraTrack[1].value;
  p.shots[3].cameraTrack[1].value = { ...end, position: [end.position[0], end.position[1] + 1.5, end.position[2]], target: [0, 0.6, 0] };
  s4.cameraMove = 'crane-up';

  return p;
}
