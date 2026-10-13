import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { catmullRom, ease, evaluateObjectTrack, lerpAngle, locate } from './interpolate';
import { aspectValue, expandFov, fitFrame, sensorFrame, verticalFov } from './lens';
import { createObject, createProject } from './defaults';
import {
  clearObjectMotion,
  deleteObjects,
  deleteShot,
  duplicateObjects,
  hasMotion,
  insertShot,
  locateTime,
  moveShot,
  objectStateAt,
  resolveCamera,
  resolveObjectState,
  setCameraState,
  setObjectState,
  totalDuration,
} from './scene';
import { History } from './history';
import { blendPose, jointsFor, POSES } from './poses';
import { parseProject, ProjectFileError, serializeProject } from './projectFile';
import type { Key, ObjectState, Project } from './types';

const st = (x: number, extra: Partial<ObjectState> = {}): ObjectState => ({
  position: [x, 0, 0],
  rotationY: 0,
  scale: [1, 1, 1],
  visible: true,
  ...extra,
});

function projectWithFigure(): { project: Project; id: string } {
  const project = createProject();
  const obj = createObject('figure', []);
  project.objects.push(obj);
  return { project, id: obj.id };
}

describe('easing', () => {
  it('hits the endpoints for every curve', () => {
    for (const e of ['smooth', 'linear', 'easeIn', 'easeOut'] as const) {
      expect(ease(e, 0)).toBeCloseTo(0);
      expect(ease(e, 1)).toBeCloseTo(1);
    }
  });
  it('smooth is symmetric around the middle', () => {
    expect(ease('smooth', 0.5)).toBeCloseTo(0.5);
    expect(ease('smooth', 0.25) + ease('smooth', 0.75)).toBeCloseTo(1);
  });
  it('clamps out-of-range input', () => {
    expect(ease('linear', -1)).toBe(0);
    expect(ease('linear', 2)).toBe(1);
  });
});

describe('interpolation', () => {
  it('lerpAngle takes the shortest path across ±π', () => {
    const a = (170 * Math.PI) / 180;
    const b = (-170 * Math.PI) / 180;
    const mid = lerpAngle(a, b, 0.5);
    expect(Math.abs(Math.cos(mid) - Math.cos(Math.PI))).toBeLessThan(1e-9);
    expect(mid).toBeGreaterThan(a);
  });

  it('catmullRom passes through its control points', () => {
    const p0: [number, number, number] = [0, 0, 0];
    const p1: [number, number, number] = [1, 0, 0];
    const p2: [number, number, number] = [2, 1, 0];
    const p3: [number, number, number] = [3, 1, 0];
    expect(catmullRom(p0, p1, p2, p3, 0)).toEqual(p1);
    const end = catmullRom(p0, p1, p2, p3, 1);
    end.forEach((v, i) => expect(v).toBeCloseTo(p2[i]));
  });

  it('locate finds the right segment for middle keys', () => {
    const keys: Key<number>[] = [
      { t: 0, value: 0, easing: 'linear' },
      { t: 0.5, value: 1, easing: 'linear' },
      { t: 1, value: 2, easing: 'linear' },
    ];
    expect(locate(keys, 0.25)).toEqual({ i: 0, u: 0.5 });
    expect(locate(keys, 0.75)).toEqual({ i: 1, u: 0.5 });
    expect(locate(keys, 1)).toEqual({ i: 1, u: 1 });
  });

  it('evaluates an object track with smooth easing and pose blend', () => {
    const keys: Key<ObjectState>[] = [
      { t: 0, value: st(0, { pose: 'stand' }), easing: 'smooth' },
      { t: 1, value: st(10, { pose: 'walk' }), easing: 'smooth' },
    ];
    const mid = evaluateObjectTrack(keys, 0.5);
    expect(mid.position[0]).toBeCloseTo(5);
    expect(mid.poseBlend).toEqual({ from: 'stand', to: 'walk', w: 0.5 });
    expect(evaluateObjectTrack(keys, 0.1).position[0]).toBeLessThan(1); // eased start
    expect(evaluateObjectTrack(keys, 1).position[0]).toBe(10);
  });
});

describe('lenses', () => {
  it('uses the full sensor width for wide frames', () => {
    expect(sensorFrame(16 / 9)).toEqual({ width: 36, height: 20.25 });
    expect(sensorFrame(9 / 16).height).toBe(24);
  });
  it('gives the textbook FOV for 3:2', () => {
    expect(verticalFov(50, 1.5)).toBeCloseTo(26.99, 1);
  });
  it('longer lenses narrow the view', () => {
    const fovs = [14, 35, 135].map((f) => verticalFov(f, aspectValue('16:9')));
    expect(fovs[0]).toBeGreaterThan(fovs[1]);
    expect(fovs[1]).toBeGreaterThan(fovs[2]);
  });
  it('expandFov is identity when the frame fills the viewport', () => {
    expect(expandFov(40, 500, 500)).toBeCloseTo(40);
    expect(expandFov(40, 250, 500)).toBeGreaterThan(40);
  });
  it('fitFrame letterboxes inside the available area', () => {
    const r = fitFrame(2, 1000, 1000, { top: 0, right: 0, bottom: 0, left: 0 });
    expect(r).toEqual({ x: 0, y: 250, width: 1000, height: 500 });
  });
});

describe('shot state rules', () => {
  it('editing the start of a fresh shot places the object statically', () => {
    const { project, id } = projectWithFigure();
    const next = produce(project, (d) => setObjectState(d, 0, 'start', id, st(2)));
    expect(hasMotion(next.shots[0], id)).toBe(false);
    expect(resolveObjectState(next, 0, 1, next.objects[0]).position[0]).toBe(2);
  });

  it('editing the end creates motion from the start', () => {
    const { project, id } = projectWithFigure();
    let p = produce(project, (d) => setObjectState(d, 0, 'start', id, st(2)));
    p = produce(p, (d) => setObjectState(d, 0, 'end', id, st(6)));
    expect(hasMotion(p.shots[0], id)).toBe(true);
    expect(resolveObjectState(p, 0, 0, p.objects[0]).position[0]).toBe(2);
    expect(resolveObjectState(p, 0, 0.5, p.objects[0]).position[0]).toBeCloseTo(4);
  });

  it('editing the start of a moving track keeps the end', () => {
    const { project, id } = projectWithFigure();
    let p = produce(project, (d) => setObjectState(d, 0, 'end', id, st(6)));
    p = produce(p, (d) => setObjectState(d, 0, 'start', id, st(1)));
    expect(resolveObjectState(p, 0, 0, p.objects[0]).position[0]).toBe(1);
    expect(resolveObjectState(p, 0, 1, p.objects[0]).position[0]).toBe(6);
  });

  it('a new shot inherits the end of the previous one', () => {
    const { project, id } = projectWithFigure();
    let p = produce(project, (d) => setObjectState(d, 0, 'end', id, st(6)));
    p = produce(p, (d) => {
      insertShot(d, 0);
    });
    expect(p.shots).toHaveLength(2);
    expect(resolveObjectState(p, 1, 0, p.objects[0]).position[0]).toBe(6);
    expect(objectStateAt(p, 1, 'end', p.objects[0]).position[0]).toBe(6);
  });

  it('inheritance follows later changes to earlier shots', () => {
    const { project, id } = projectWithFigure();
    let p = produce(project, (d) => {
      insertShot(d, 0);
    });
    p = produce(p, (d) => setObjectState(d, 0, 'end', id, st(3)));
    expect(resolveObjectState(p, 1, 0.5, p.objects[0]).position[0]).toBe(3);
  });

  it('drops tracks that add nothing over the inherited state', () => {
    const { project, id } = projectWithFigure();
    let p = produce(project, (d) => setObjectState(d, 0, 'start', id, st(2)));
    p = produce(p, (d) => setObjectState(d, 0, 'start', id, st(0, { pose: 'stand' })));
    expect(p.shots[0].objectTracks[id]).toBeUndefined();
  });

  it('clearObjectMotion freezes the object at its start', () => {
    const { project, id } = projectWithFigure();
    let p = produce(project, (d) => setObjectState(d, 0, 'end', id, st(6)));
    p = produce(p, (d) => clearObjectMotion(d, 0, id));
    expect(p.shots[0].objectTracks[id]).toBeUndefined();
    expect(resolveObjectState(p, 0, 1, p.objects[0]).position[0]).toBe(0);
  });

  it('camera tracks follow the same rules', () => {
    const project = createProject();
    const base = resolveCamera(project, 0, 0);
    let p = produce(project, (d) =>
      setCameraState(d, 0, 'end', { ...base, position: [0, 1.6, 3] }),
    );
    expect(resolveCamera(p, 0, 0).position[2]).toBe(7);
    expect(resolveCamera(p, 0, 1).position[2]).toBe(3);
    p = produce(p, (d) => {
      insertShot(d, 0);
    });
    expect(resolveCamera(p, 1, 0).position[2]).toBe(3);
  });
});

describe('shots and objects', () => {
  it('maps film time to shots', () => {
    const p = produce(createProject(), (d) => {
      insertShot(d, 0);
      d.shots[1].duration = 2;
    });
    expect(totalDuration(p)).toBe(5);
    expect(locateTime(p, 1.5)).toEqual({ shotIndex: 0, t: 0.5 });
    expect(locateTime(p, 4)).toEqual({ shotIndex: 1, t: 0.5 });
    expect(locateTime(p, 99)).toEqual({ shotIndex: 1, t: 1 });
  });

  it('renumbers default shot names on reorder', () => {
    const p = produce(createProject(), (d) => {
      insertShot(d, 0);
      d.shots[1].name = 'Chase';
      insertShot(d, 1);
      moveShot(d, 2, 0);
    });
    expect(p.shots.map((s) => s.name)).toEqual(['Shot 1', 'Shot 2', 'Chase']);
  });

  it('never leaves a project without shots', () => {
    const p = produce(createProject(), (d) => deleteShot(d, 0));
    expect(p.shots).toHaveLength(1);
  });

  it('deleting objects removes their tracks', () => {
    const { project, id } = projectWithFigure();
    let p = produce(project, (d) => setObjectState(d, 0, 'end', id, st(6)));
    p = produce(p, (d) => deleteObjects(d, [id]));
    expect(p.objects).toHaveLength(0);
    expect(p.shots[0].objectTracks[id]).toBeUndefined();
  });

  it('duplicates objects at their current state with an offset', () => {
    const { project, id } = projectWithFigure();
    let p = produce(project, (d) => setObjectState(d, 0, 'end', id, st(6)));
    let newIds: string[] = [];
    p = produce(p, (d) => {
      newIds = duplicateObjects(d, [id], 0, 'end');
    });
    const copy = p.objects.find((o) => o.id === newIds[0])!;
    expect(copy.base.position).toEqual([6.5, 0, 0.5]);
  });
});

describe('poses', () => {
  it('blends joint angles', () => {
    const mid = blendPose(POSES.stand, POSES.sit, 0.5);
    expect(mid.lHip).toBeCloseTo(POSES.sit.lHip / 2);
  });
  it('uses the blend when present', () => {
    const j = jointsFor({ ...st(0), poseBlend: { from: 'stand', to: 'lie', w: 1 } });
    expect(j.pitch).toBeCloseTo(POSES.lie.pitch);
  });
});

describe('history', () => {
  it('undoes and redoes discrete steps', () => {
    const h = new History<number>();
    h.record(1);
    h.record(2);
    expect(h.undo(3)).toBe(2);
    expect(h.undo(2)).toBe(1);
    expect(h.undo(1)).toBeNull();
    expect(h.redo(1)).toBe(2);
  });

  it('groups a gesture into one step and skips empty gestures', () => {
    const h = new History<object>();
    const a = {};
    const b = {};
    h.begin(a);
    h.record(a); // ignored during a gesture
    h.end(b);
    expect(h.undo(b)).toBe(a);
    expect(h.canUndo).toBe(false);
    h.begin(a);
    h.end(a);
    expect(h.canUndo).toBe(false);
  });

  it('a new change clears redo', () => {
    const h = new History<number>();
    h.record(1);
    h.undo(2);
    h.record(1);
    expect(h.canRedo).toBe(false);
  });
});

describe('project file', () => {
  it('round-trips', () => {
    const { project } = projectWithFigure();
    expect(parseProject(serializeProject(project))).toEqual(project);
  });
  it('rejects junk and future versions', () => {
    expect(() => parseProject('nope')).toThrow(ProjectFileError);
    expect(() => parseProject(JSON.stringify({ ...createProject(), version: 2 }))).toThrow(ProjectFileError);
  });
});
