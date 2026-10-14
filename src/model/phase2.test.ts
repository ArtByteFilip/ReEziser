import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { createObject, createProject } from './defaults';
import { addCamera, cameraStateFor, deleteCamera, nextCameraName, orbitAround, setShotCamera, walkCamera } from './cameras';
import { applyAngle, frameSpan, frameSubject, pickSubject, subjectFrom, type Subject } from './framing';
import { applyCameraMove, moveEnd, moveId, moveLabel, parseMoveId } from './cameraMoves';
import { crossesAxis, sideOfLine } from './axis';
import { AxisLock, constrainToAxis } from './axisLock';
import {
  createGroup,
  expandToGroups,
  floorCentre,
  scaleAround,
  selectedGroup,
  turnAround,
  ungroup,
} from './groups';
import { cameraHasMotion, deleteObjects, duplicateObjects, insertShot, resolveCamera, setCameraState, setObjectState } from './scene';
import { aspectValue, verticalFov } from './lens';
import { objectHeight } from './dimensions';
import type { CameraState, ObjectState, Project, Vec3 } from './types';

const st = (x: number, z = 0, extra: Partial<ObjectState> = {}): ObjectState => ({
  position: [x, 0, z],
  rotationY: 0,
  scale: [1, 1, 1],
  visible: true,
  ...extra,
});

const cam = (position: Vec3, target: Vec3, focalLength = 35): CameraState => ({ position, target, roll: 0, focalLength });

const close = (a: Vec3, b: Vec3, digits = 5) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], digits));

function withObjects(...kinds: ('figure' | 'box')[]): { project: Project; ids: string[] } {
  const project = createProject();
  const ids: string[] = [];
  for (const k of kinds) {
    const o = createObject(k, project.objects);
    project.objects.push(o);
    ids.push(o.id);
  }
  return { project, ids };
}

describe('multiple cameras', () => {
  it('names cameras with the first free letter', () => {
    const p = createProject();
    expect(nextCameraName(p.cameras)).toBe('Cam B');
    expect(nextCameraName([{ ...p.cameras[0], name: 'Cam B' }])).toBe('Cam A');
  });

  it('adds a camera at a new angle and films the current shot with it', () => {
    let p = createProject();
    let id = '';
    p = produce(p, (d) => {
      id = addCamera(d, 0, 'start');
    });
    expect(p.cameras).toHaveLength(2);
    expect(p.shots[0].cameraId).toBe(id);
    const a = p.cameras[0].base;
    const b = resolveCamera(p, 0, 0);
    expect(b.target).toEqual(a.target);
    const distA = Math.hypot(a.position[0] - a.target[0], a.position[2] - a.target[2]);
    const distB = Math.hypot(b.position[0] - b.target[0], b.position[2] - b.target[2]);
    expect(distB).toBeCloseTo(distA);
    expect(b.position[0]).not.toBeCloseTo(a.position[0]);
  });

  it('each camera keeps its own place across cuts', () => {
    let p = createProject();
    const a = p.cameras[0].id;
    let b = '';
    p = produce(p, (d) => {
      setCameraState(d, 0, 'start', cam([1, 1.6, 6], [0, 1, 0])); // Cam A placed in shot 1
      insertShot(d, 0);
      b = addCamera(d, 1, 'start'); // shot 2 on Cam B
      setCameraState(d, 1, 'start', cam([-5, 1.6, 0], [0, 1, 0]));
      insertShot(d, 1);
      setShotCamera(d, 2, a); // shot 3 cuts back to Cam A
    });
    expect(resolveCamera(p, 2, 0).position).toEqual([1, 1.6, 6]);
    expect(cameraStateFor(p, 2, 0, b).position).toEqual([-5, 1.6, 0]);
    expect(cameraStateFor(p, 0, 0, a).position).toEqual([1, 1.6, 6]);
  });

  it('switching a shot to another camera drops the old motion and labels', () => {
    let p = createProject();
    p = produce(p, (d) => {
      d.shots[0].shotType = 'close-up';
      applyCameraMove(d, 0, 'dolly', 1);
      addCamera(d, 0, 'start');
    });
    expect(p.shots[0].cameraTrack).toEqual([]);
    expect(p.shots[0].shotType).toBeUndefined();
    expect(p.shots[0].cameraMove).toBeUndefined();
  });

  it('deleting a camera moves its shots to another one, and keeps the last camera', () => {
    let p = createProject();
    let b = '';
    p = produce(p, (d) => {
      b = addCamera(d, 0, 'start');
    });
    p = produce(p, (d) => deleteCamera(d, b));
    expect(p.cameras).toHaveLength(1);
    expect(p.shots[0].cameraId).toBe(p.cameras[0].id);
    p = produce(p, (d) => deleteCamera(d, d.cameras[0].id));
    expect(p.cameras).toHaveLength(1);
  });

  it('orbitAround keeps the distance to the pivot', () => {
    const s = orbitAround(cam([0, 2, 5], [0, 1, 0]), [0, 0, 0], Math.PI / 2);
    close(s.position, [5, 2, 0]);
    close(s.target, [0, 1, 0]);
  });
});

describe('shot types', () => {
  const person: Subject = { position: [0, 0, 0], height: 1.75, radius: 0.3, facing: 0, isFigure: true };
  const aspect = aspectValue('16:9');
  const start = cam([0, 1.6, 8], [0, 1, 0], 50);

  /** Vertical span the camera sees at the subject's distance, roughly. */
  function seenSpan(c: CameraState): number {
    const d = Math.hypot(c.position[0] - c.target[0], c.position[1] - c.target[1], c.position[2] - c.target[2]);
    return 2 * d * Math.tan((verticalFov(c.focalLength, aspect) * Math.PI) / 360);
  }

  it('tighter shot types bring the camera closer', () => {
    const order = ['extreme-wide', 'wide', 'medium-wide', 'medium', 'medium-close-up', 'close-up', 'extreme-close-up'] as const;
    const distances = order.map((t) => {
      const c = frameSubject(start, person, t, 'eye-level', aspect);
      return Math.hypot(c.position[0], c.position[2]);
    });
    for (let i = 1; i < distances.length; i++) expect(distances[i]).toBeLessThan(distances[i - 1]);
  });

  it('a wide shot shows the whole person, a close-up the head and shoulders', () => {
    const [wb, wt] = frameSpan(person, 'wide');
    expect(wb).toBeLessThanOrEqual(0);
    expect(wt).toBeGreaterThan(1.75);
    const [cb, ct] = frameSpan(person, 'close-up');
    expect(cb).toBeGreaterThan(1.75 * 0.7);
    expect(ct).toBeGreaterThan(1.75);
    const c = frameSubject(start, person, 'close-up', 'eye-level', aspect);
    expect(seenSpan(c)).toBeGreaterThan(ct - cb - 0.05);
    expect(seenSpan(c)).toBeLessThan((ct - cb) * 1.3);
  });

  it('keeps the camera on its side of the subject, and its lens', () => {
    const fromSide = cam([-6, 1.6, 0], [0, 1, 0], 85);
    const c = frameSubject(fromSide, person, 'medium', 'eye-level', aspect);
    expect(c.position[0]).toBeLessThan(0);
    expect(Math.abs(c.position[2])).toBeLessThan(1e-9);
    expect(c.focalLength).toBe(85);
    close(c.target, [0, (frameSpan(person, 'medium')[0] + frameSpan(person, 'medium')[1]) / 2, 0]);
  });

  it('the same shot type frames the same on a longer lens, from further away', () => {
    const a = frameSubject({ ...start, focalLength: 24 }, person, 'medium', 'eye-level', aspect);
    const b = frameSubject({ ...start, focalLength: 85 }, person, 'medium', 'eye-level', aspect);
    expect(Math.abs(b.position[2])).toBeGreaterThan(Math.abs(a.position[2]) * 3);
    expect(seenSpan(a)).toBeCloseTo(seenSpan(b), 1);
  });

  it('films people from eye height at eye level', () => {
    const c = frameSubject(start, person, 'medium', 'eye-level', aspect);
    expect(c.position[1]).toBeCloseTo(1.75 * 0.93);
  });

  it('angles: low is below, high is above, overhead looks down, dutch rolls', () => {
    const eye = frameSubject(start, person, 'medium', 'eye-level', aspect);
    const low = frameSubject(start, person, 'medium', 'low', aspect);
    const high = frameSubject(start, person, 'medium', 'high', aspect);
    const top = frameSubject(start, person, 'medium', 'overhead', aspect);
    const dutch = frameSubject(start, person, 'medium', 'dutch', aspect);
    expect(low.position[1]).toBeLessThan(low.target[1]);
    expect(high.position[1]).toBeGreaterThan(eye.position[1]);
    expect(Math.hypot(top.position[0] - top.target[0], top.position[2] - top.target[2])).toBeLessThan(0.2);
    expect(dutch.roll).not.toBe(0);
    expect(eye.roll).toBe(0);
  });

  it('never puts the camera under the floor', () => {
    const lying: Subject = { ...person, height: 0.32 };
    const c = frameSubject(start, lying, 'wide', 'low', aspect);
    expect(c.position[1]).toBeGreaterThan(0.1);
  });

  it('faces the subject when the camera is straight above it', () => {
    const above = cam([0, 10, 0], [0, 0, 0]);
    const c = frameSubject(above, { ...person, facing: Math.PI / 2 }, 'medium', 'eye-level', aspect);
    expect(c.position[0]).toBeGreaterThan(0); // facing +X
  });

  it('applyAngle keeps aim and distance', () => {
    const c = cam([0, 1, 5], [0, 1, 0]);
    const high = applyAngle(c, 'high');
    expect(high.target).toEqual(c.target);
    expect(Math.hypot(high.position[0], high.position[1] - 1, high.position[2])).toBeCloseTo(5);
    expect(high.position[1]).toBeGreaterThan(1);
  });

  it('figure height follows the pose', () => {
    const fig = createObject('figure', []);
    expect(objectHeight(fig, st(0, 0, { pose: 'sit' }))).toBeLessThan(objectHeight(fig, st(0, 0, { pose: 'stand' })));
    expect(subjectFrom(fig, st(0)).height).toBeCloseTo(1.75);
  });

  it('picks the seated person the camera aims at, not the counter behind them', () => {
    const project = createProject();
    const peter = createObject('figure', []);
    const counter = createObject('box', []);
    const candidates = [
      { obj: counter, state: st(3.5, -2, { scale: [2.5, 1.05, 0.7] }) },
      { obj: peter, state: st(1, 0, { pose: 'sit' }) },
    ];
    // Camera over a shoulder, aimed at the seated head; the line goes on through the counter.
    const pick = pickSubject(cam([-2.5, 1.4, 2.5], [1, 1.1, 0]), candidates);
    expect(pick?.obj.id).toBe(peter.id);
    void project;
  });

  it('picks the person nearest the line of sight as the subject', () => {
    const { project, ids } = withObjects('box', 'figure', 'figure');
    const states = [st(0, 0), st(3, 0), st(-0.3, 0)];
    const candidates = project.objects.map((obj, i) => ({ obj, state: states[i] }));
    const pick = pickSubject(cam([0, 1.6, 8], [0, 1, 0]), candidates);
    expect(pick?.obj.id).toBe(ids[2]);
  });
});

describe('camera moves', () => {
  const start = cam([0, 1.6, 6], [0, 1.6, 0]);

  it('pan turns on the spot; right turns right', () => {
    const end = moveEnd(start, 'pan', 1);
    expect(end.position).toEqual(start.position);
    expect(end.target[0]).toBeGreaterThan(0); // looking down -Z, right is +X
  });

  it('tilt up raises the aim', () => {
    const end = moveEnd(start, 'tilt', 1);
    expect(end.position).toEqual(start.position);
    expect(end.target[1]).toBeGreaterThan(1.6);
  });

  it('dolly in travels toward the aim, never through it; out backs away', () => {
    const inEnd = moveEnd(start, 'dolly', 1);
    expect(inEnd.position[2]).toBeLessThan(6);
    expect(inEnd.position[2]).toBeGreaterThan(0);
    expect(moveEnd(start, 'dolly', -1).position[2]).toBeGreaterThan(6);
  });

  it('truck slides sideways and keeps the direction', () => {
    const end = moveEnd(start, 'truck', 1);
    expect(end.position[0]).toBeGreaterThan(0);
    expect(end.target[0] - end.position[0]).toBeCloseTo(0);
  });

  it('orbit circles the pivot at the same distance', () => {
    const end = moveEnd(start, 'orbit', 1, [0, 0, 0]);
    expect(Math.hypot(end.position[0], end.position[2])).toBeCloseTo(6);
    expect(end.position[0]).toBeGreaterThan(0); // moved to the camera's right
    expect(end.target[0]).toBeCloseTo(0);
  });

  it('crane down stops above the floor; zoom changes only the lens', () => {
    const low = cam([0, 0.5, 6], [0, 0.5, 0]);
    expect(moveEnd(low, 'crane', -1).position[1]).toBeGreaterThanOrEqual(0.2);
    expect(moveEnd(start, 'crane', 1).position[1]).toBeCloseTo(3.1);
    const zoom = moveEnd(start, 'zoom', 1);
    expect(zoom.focalLength).toBe(70);
    expect(zoom.position).toEqual(start.position);
    expect(moveEnd({ ...start, focalLength: 135 }, 'zoom', 1).focalLength).toBe(135);
  });

  it('ids round-trip and read as filmmaker words', () => {
    expect(moveId('dolly', 1)).toBe('dolly-in');
    expect(moveId('static', 1)).toBe('static');
    expect(parseMoveId('pan-left')).toEqual({ kind: 'pan', dir: -1 });
    expect(moveLabel('crane-up')).toBe('Crane up');
  });

  it('applying a move gives the shot motion from its start; static removes it', () => {
    let p = createProject();
    p = produce(p, (d) => applyCameraMove(d, 0, 'dolly', 1));
    expect(cameraHasMotion(p.shots[0])).toBe(true);
    expect(p.shots[0].cameraMove).toBe('dolly-in');
    expect(resolveCamera(p, 0, 0)).toEqual(p.cameras[0].base);
    p = produce(p, (d) => applyCameraMove(d, 0, 'static', 1));
    expect(cameraHasMotion(p.shots[0])).toBe(false);
    expect(p.shots[0].cameraMove).toBeUndefined();
  });
});

describe('180° line', () => {
  it('tells the sides of a line apart', () => {
    expect(sideOfLine([0, 0, 0], [1, 0, 0], [0.5, 0, 2])).toBe(1);
    expect(sideOfLine([0, 0, 0], [1, 0, 0], [0.5, 0, -2])).toBe(-1);
    expect(sideOfLine([0, 0, 0], [1, 0, 0], [5, 0, 0.05])).toBe(0);
  });

  function twoPeople(): Project {
    const { project, ids } = withObjects('figure', 'figure');
    return produce(project, (d) => {
      setObjectState(d, 0, 'start', ids[0], st(-1));
      setObjectState(d, 0, 'start', ids[1], st(1));
      insertShot(d, 0);
    });
  }

  it('warns when the cut jumps to the other side', () => {
    let p = twoPeople();
    p = produce(p, (d) => {
      setCameraState(d, 0, 'start', cam([0, 1.6, 6], [0, 1, 0]));
      setCameraState(d, 1, 'start', cam([0, 1.6, -6], [0, 1, 0]));
    });
    expect(crossesAxis(p, 1)).toBe(true);
    expect(crossesAxis(p, 0)).toBe(false);
  });

  it('stays quiet on the same side, or with fewer than two people', () => {
    let p = twoPeople();
    p = produce(p, (d) => {
      setCameraState(d, 0, 'start', cam([0, 1.6, 6], [0, 1, 0]));
      setCameraState(d, 1, 'start', cam([4, 1.6, 3], [1, 1, 0]));
    });
    expect(crossesAxis(p, 1)).toBe(false);
    const single = produce(p, (d) => deleteObjects(d, [d.objects[1].id]));
    expect(crossesAxis(single, 1)).toBe(false);
  });
});

describe('groups', () => {
  it('groups, expands the selection, and ungroups', () => {
    const { project, ids } = withObjects('box', 'box', 'box');
    let gid: string | null = null;
    let p = produce(project, (d) => {
      gid = createGroup(d, [ids[0], ids[1]]);
    });
    expect(gid).not.toBeNull();
    expect(expandToGroups(p, [ids[0]])).toEqual([ids[0], ids[1]]);
    expect(expandToGroups(p, [ids[2]])).toEqual([ids[2]]);
    expect(selectedGroup(p, [ids[1], ids[0]])?.id).toBe(gid);
    expect(selectedGroup(p, [ids[0], ids[1], ids[2]])).toBeNull();
    p = produce(p, (d) => ungroup(d, [ids[0]]));
    expect(p.groups).toBeUndefined();
    expect(expandToGroups(p, [ids[0]])).toEqual([ids[0]]);
  });

  it('nests groups and ungroups one level at a time', () => {
    const { project, ids } = withObjects('box', 'box', 'box');
    let p = produce(project, (d) => {
      createGroup(d, [ids[0], ids[1]]);
    });
    p = produce(p, (d) => {
      createGroup(d, [ids[0], ids[2]]);
    });
    expect(expandToGroups(p, [ids[2]]).sort()).toEqual([...ids].sort());
    p = produce(p, (d) => ungroup(d, [ids[2]]));
    expect(expandToGroups(p, [ids[0]]).sort()).toEqual([ids[0], ids[1]].sort());
  });

  it('needs at least two things to group', () => {
    const { project, ids } = withObjects('box');
    const p = produce(project, (d) => {
      expect(createGroup(d, ids)).toBeNull();
    });
    expect(p.groups).toBeUndefined();
  });

  it('deleting members dissolves groups that are left with one', () => {
    const { project, ids } = withObjects('box', 'box');
    let p = produce(project, (d) => {
      createGroup(d, ids);
    });
    p = produce(p, (d) => deleteObjects(d, [ids[0]]));
    expect(p.groups).toBeUndefined();
  });

  it('duplicating a whole group makes a new group of the copies', () => {
    const { project, ids } = withObjects('box', 'box');
    let p = produce(project, (d) => {
      createGroup(d, ids);
    });
    let copies: string[] = [];
    p = produce(p, (d) => {
      copies = duplicateObjects(d, ids, 0, 'start');
    });
    expect(p.groups).toHaveLength(2);
    expect(expandToGroups(p, [copies[0]]).sort()).toEqual([...copies].sort());
  });

  it('turns and scales around the common centre', () => {
    const states = [st(-1), st(1)];
    const c = floorCentre(states);
    expect(c).toEqual([0, 0]);
    const turned = states.map((s) => turnAround(s, c, Math.PI / 2));
    close(turned[0].position, [0, 0, 1]);
    expect(turned[0].rotationY).toBeCloseTo(Math.PI / 2);
    const big = states.map((s) => scaleAround(s, c, 2));
    expect(big[1].position[0]).toBe(2);
    expect(big[1].scale).toEqual([2, 2, 2]);
  });
});

describe('walking the camera (WASD)', () => {
  const start = cam([0, 1.6, 6], [0, 1.6, 0]);

  it('W walks toward the aim along the floor and keeps the view', () => {
    const s = walkCamera(cam([0, 3, 6], [0, 1, 0]), { forward: 1, right: 0, up: 0 }, 1);
    close(s.position, [0, 3, 5]);
    close(s.target, [0, 1, -1]);
  });

  it('D steps right, E rises, diagonals are not faster', () => {
    close(walkCamera(start, { forward: 0, right: 1, up: 0 }, 1).position, [1, 1.6, 6]);
    close(walkCamera(start, { forward: 0, right: 0, up: 1 }, 1).position, [0, 2.6, 6]);
    const d = walkCamera(start, { forward: 1, right: 1, up: 0 }, 1).position;
    expect(Math.hypot(d[0], d[2] - 6)).toBeCloseTo(1);
  });

  it('stops at the floor and does nothing without keys', () => {
    expect(walkCamera(start, { forward: 0, right: 0, up: -1 }, 5).position[1]).toBeCloseTo(0.05);
    expect(walkCamera(start, { forward: 0, right: 0, up: 0 }, 1)).toBe(start);
  });
});

describe('axis lock (Ctrl + drag)', () => {
  it('waits for a clear direction, then keeps that axis', () => {
    expect(constrainToAxis([0.05, 0.02], null, 0.1)).toEqual({ delta: [0, 0], axis: null });
    expect(constrainToAxis([0.5, 0.2], null, 0.1)).toEqual({ delta: [0.5, 0], axis: 0 });
    expect(constrainToAxis([0.1, -0.3], null, 0.1)).toEqual({ delta: [0, -0.3], axis: 1 });
    // Once locked to the first axis, moving mostly along the second still slides along the first.
    expect(constrainToAxis([0.2, 3], 0, 0.1)).toEqual({ delta: [0.2, 0], axis: 0 });
  });

  it('releasing the key frees the drag and forgets the axis', () => {
    const lock = new AxisLock(0.1);
    expect(lock.apply([1, 0.2], true)).toEqual([1, 0]);
    expect(lock.apply([1, 2], true)).toEqual([1, 0]);
    expect(lock.apply([1, 2], false)).toEqual([1, 2]);
    expect(lock.apply([0.1, 2], true)).toEqual([0, 2]);
  });
});
