import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { createObject, createProject } from './defaults';
import {
  hasMotion,
  insertShot,
  objectStateAt,
  resolveCamera,
  resolveObjectState,
  setCameraState,
  setObjectState,
  totalDuration,
} from './scene';
import { deleteKey, moveKey, setSegmentEasing, splitShot } from './timeline';
import { detectBeats, mixDown, snapToBeat, waveformPeaks } from './audio';
import { cameraPathKeys, pathKeys, poseForSpeed, simplify, smoothTimeFor, takeKeys, type Point2, type TakeSample } from './paths';
import type { CameraState, ObjectState, Project } from './types';

const st = (x: number, z = 0, extra: Partial<ObjectState> = {}): ObjectState => ({
  position: [x, 0, z],
  rotationY: 0,
  scale: [1, 1, 1],
  visible: true,
  ...extra,
});

function withBox(): { project: Project; id: string } {
  const project = createProject();
  const obj = createObject('box', []);
  project.objects.push(obj);
  return { project, id: obj.id };
}

const xAt = (p: Project, shot: number, t: number) => resolveObjectState(p, shot, t, p.objects[0]).position[0];

describe('middle keys', () => {
  it('editing in the middle of a still shot makes a there-and-back move', () => {
    const { project, id } = withBox();
    const p = produce(project, (d) => setObjectState(d, 0, 0.5, id, st(4)));
    expect(p.shots[0].objectTracks[id].map((k) => k.t)).toEqual([0, 0.5, 1]);
    expect(xAt(p, 0, 0)).toBe(0);
    expect(xAt(p, 0, 0.5)).toBe(4);
    expect(xAt(p, 0, 1)).toBe(0);
  });

  it('adds a key inside a move, and edits it again in place', () => {
    const { project, id } = withBox();
    let p = produce(project, (d) => setObjectState(d, 0, 'end', id, st(10)));
    p = produce(p, (d) => setObjectState(d, 0, 0.3, id, st(5, 2)));
    p = produce(p, (d) => setObjectState(d, 0, 0.3, id, st(6, 2)));
    const keys = p.shots[0].objectTracks[id];
    expect(keys.map((k) => k.t)).toEqual([0, 0.3, 1]);
    expect(objectStateAt(p, 0, 0.3, p.objects[0]).position).toEqual([6, 0, 2]);
    expect(xAt(p, 0, 1)).toBe(10);
  });

  it('a new middle key keeps the easing of the stretch it splits', () => {
    const { project, id } = withBox();
    let p = produce(project, (d) => setObjectState(d, 0, 'end', id, st(10)));
    p = produce(p, (d) => setSegmentEasing(d, 0, { kind: 'object', id }, 0, 'linear'));
    p = produce(p, (d) => setObjectState(d, 0, 0.5, id, st(3)));
    expect(p.shots[0].objectTracks[id].map((k) => k.easing)).toEqual(['linear', 'linear', 'smooth']);
  });

  it('start and end still follow the Phase 1 rules with middle keys present', () => {
    const { project, id } = withBox();
    let p = produce(project, (d) => setObjectState(d, 0, 'end', id, st(10)));
    p = produce(p, (d) => setObjectState(d, 0, 0.5, id, st(5, 3)));
    p = produce(p, (d) => setObjectState(d, 0, 'start', id, st(-2)));
    expect(xAt(p, 0, 0)).toBe(-2);
    expect(xAt(p, 0, 0.5)).toBe(5);
    expect(xAt(p, 0, 1)).toBe(10);
  });

  it('camera middle keys', () => {
    const project = createProject();
    const base = resolveCamera(project, 0, 0);
    const p = produce(project, (d) => setCameraState(d, 0, 0.5, { ...base, focalLength: 85 }));
    expect(resolveCamera(p, 0, 0.5).focalLength).toBe(85);
    expect(resolveCamera(p, 0, 1).focalLength).toBe(35);
  });
});

describe('timeline edits', () => {
  function threeKeys() {
    const { project, id } = withBox();
    let p = produce(project, (d) => setObjectState(d, 0, 'end', id, st(10)));
    p = produce(p, (d) => setObjectState(d, 0, 0.5, id, st(2, 4)));
    return { p, id, ref: { kind: 'object' as const, id } };
  }

  it('moves a middle key but not past its neighbours or the ends', () => {
    const { p, id, ref } = threeKeys();
    let q = produce(p, (d) => moveKey(d, 0, ref, 1, 0.8));
    expect(q.shots[0].objectTracks[id][1].t).toBe(0.8);
    q = produce(q, (d) => moveKey(d, 0, ref, 1, 2));
    expect(q.shots[0].objectTracks[id][1].t).toBeCloseTo(0.99);
    q = produce(q, (d) => moveKey(d, 0, ref, 0, 0.5));
    expect(q.shots[0].objectTracks[id][0].t).toBe(0);
  });

  it('deletes middle keys only', () => {
    const { p, id, ref } = threeKeys();
    let q = produce(p, (d) => deleteKey(d, 0, ref, 0));
    expect(q.shots[0].objectTracks[id]).toHaveLength(3);
    q = produce(q, (d) => deleteKey(d, 0, ref, 1));
    expect(q.shots[0].objectTracks[id].map((k) => k.t)).toEqual([0, 1]);
  });
});

describe('split shot', () => {
  it('splits into two shots that play the same and inherit correctly', () => {
    const { project, id } = withBox();
    let p = produce(project, (d) => {
      setObjectState(d, 0, 'end', id, st(10));
      d.shots[0].duration = 4;
      d.shots[0].shotType = 'wide';
      d.shots[0].note = 'keep';
      setCameraState(d, 0, 'end', { ...d.cameras[0].base, position: [3, 1.6, 7] } as CameraState);
    });
    const original = (u: number) => xAt(p, 0, u);
    const samples = [0, 0.1, 0.25, 0.4, 0.6, 0.75, 0.9, 1].map(original);
    const camMid = resolveCamera(p, 0, 0.6).position[0];
    let at = -1;
    p = produce(p, (d) => {
      at = splitShot(d, 0, 0.25);
    });
    expect(at).toBe(1);
    expect(p.shots).toHaveLength(2);
    expect(p.shots.map((s) => s.duration)).toEqual([1, 3]);
    expect(totalDuration(p)).toBe(4);
    expect(p.shots[1].shotType).toBe('wide');
    expect(p.shots[0].note).toBe('keep');
    expect(p.shots[1].note).toBe('');
    // Film time u maps to shot 1 for u < 0.25, shot 2 after.
    const split = (u: number) => (u <= 0.25 ? xAt(p, 0, u / 0.25) : xAt(p, 1, (u - 0.25) / 0.75));
    [0, 0.1, 0.25, 0.4, 0.6, 0.75, 0.9, 1].forEach((u, i) => expect(split(u)).toBeCloseTo(samples[i], 1));
    expect(resolveCamera(p, 1, (0.6 - 0.25) / 0.75).position[0]).toBeCloseTo(camMid, 1);
    // The second shot's motion continues; a later shot inherits its end.
    expect(hasMotion(p.shots[1], id)).toBe(true);
    p = produce(p, (d) => {
      insertShot(d, 1);
    });
    expect(xAt(p, 2, 0)).toBeCloseTo(10);
  });

  it('refuses to split at the very ends', () => {
    const p = createProject();
    produce(p, (d) => {
      expect(splitShot(d, 0, 0.01)).toBe(-1);
      expect(splitShot(d, 0, 0.995)).toBe(-1);
    });
  });

  it('drops still halves that just repeat what they inherit', () => {
    const { project, id } = withBox();
    let p = produce(project, (d) => setObjectState(d, 0, 'start', id, st(3)));
    p = produce(p, (d) => {
      splitShot(d, 0, 0.5);
    });
    expect(p.shots[1].objectTracks[id]).toBeUndefined();
    expect(xAt(p, 1, 0.5)).toBe(3);
  });
});

describe('drawn paths', () => {
  const line = (n: number, len: number): Point2[] => Array.from({ length: n }, (_, i) => [(i / (n - 1)) * len, 0]);

  it('simplifies a straight stroke to its ends and keeps corners', () => {
    expect(simplify(line(50, 5), 0.05)).toHaveLength(2);
    const corner: Point2[] = [...line(20, 3), ...Array.from({ length: 20 }, (_, i) => [3, ((i + 1) / 20) * 3] as Point2)];
    const s = simplify(corner, 0.05);
    expect(s).toHaveLength(3);
    expect(s[1]).toEqual([3, 0]);
  });

  it('starts at the object, ends at the stroke end, and turns figures along the way', () => {
    const start = st(0, 0, { pose: 'stand' });
    const stroke: Point2[] = [[0.2, 0], ...line(30, 4).slice(1), [4, 0.1], [4, 2]];
    const keys = pathKeys(stroke, start, { isFigure: true, duration: 3 });
    expect(keys[0].t).toBe(0);
    expect(keys[keys.length - 1].t).toBe(1);
    expect(keys[0].value.position).toEqual([0, 0, 0]);
    expect(keys[keys.length - 1].value.position).toEqual([4, 0, 2]);
    keys.slice(1).forEach((k, i) => expect(k.t).toBeGreaterThan(keys[i].t));
    expect(keys[0].value.rotationY).toBeCloseTo(Math.PI / 2); // heading +X
    expect(keys[keys.length - 1].value.rotationY).toBeCloseTo(0, 1); // heading +Z
    expect(keys[0].value.pose).toBe('walk');
  });

  it('a stroke far from the object gets a leg from the object first', () => {
    const keys = pathKeys(line(10, 3).map(([x, z]) => [x + 5, z + 5] as Point2), st(0), { isFigure: false, duration: 3 });
    expect(keys[0].value.position).toEqual([0, 0, 0]);
    expect(keys[1].value.position).toEqual([5, 0, 5]);
    expect(keys[0].value.rotationY).toBe(0); // props don't turn
  });

  it('picks the pose from the speed', () => {
    expect(pathKeys(line(10, 2), st(0), { isFigure: true, duration: 4 })[0].value.pose).toBe('walk');
    expect(pathKeys(line(10, 20), st(0), { isFigure: true, duration: 4 })[0].value.pose).toBe('run');
    expect(poseForSpeed(0.1)).toBe('stand');
  });

  it('eases in and out overall: the middle is reached at mid-shot', () => {
    const keys = pathKeys(line(41, 4).map(([x]) => [x, Math.sin(x * 3) * 0.5] as Point2), st(0), { isFigure: false, duration: 3 });
    const mid = keys.find((k) => k.value.position[0] > 1.9 && k.value.position[0] < 2.1);
    if (mid) expect(mid.t).toBeCloseTo(0.5, 1);
    expect(smoothTimeFor(0.5)).toBeCloseTo(0.5);
    expect(smoothTimeFor(0.1)).toBeGreaterThan(0.1);
  });

  it('a too-short stroke makes no keys', () => {
    expect(pathKeys([[0, 0], [0.01, 0]], st(0), { isFigure: true, duration: 3 })).toEqual([]);
  });

  it('moves the camera along the path keeping height, lens and view direction', () => {
    const start: CameraState = { position: [0, 1.6, 6], target: [0, 1.2, 0], roll: 0, focalLength: 50 };
    const keys = cameraPathKeys(line(10, 4), start);
    const end = keys[keys.length - 1].value;
    expect(end.position).toEqual([4, 1.6, 0]);
    expect(end.target).toEqual([4, 1.2, -6]);
    expect(end.focalLength).toBe(50);
  });
});

describe('performance takes', () => {
  it('keeps the rhythm: a pause in the take stays a pause', () => {
    const samples: TakeSample[] = [];
    // Walk 2 m in the first third, stand for a third, walk 2 m more.
    for (let i = 0; i <= 60; i++) {
      const t = i / 60;
      const x = t < 1 / 3 ? t * 6 : t < 2 / 3 ? 2 : 2 + (t - 2 / 3) * 6;
      samples.push({ t, x, z: 0 });
    }
    const keys = takeKeys(samples, st(0, 0, { pose: 'stand' }), { isFigure: true, duration: 3 });
    expect(keys.length).toBeLessThan(8);
    expect(keys[0].t).toBe(0);
    expect(keys[keys.length - 1].t).toBe(1);
    const p = (t: number) => {
      let i = 0;
      while (i < keys.length - 2 && keys[i + 1].t < t) i++;
      const a = keys[i];
      const b = keys[i + 1];
      const u = (t - a.t) / (b.t - a.t);
      return a.value.position[0] + (b.value.position[0] - a.value.position[0]) * u;
    };
    expect(p(0.4)).toBeCloseTo(2, 1);
    expect(p(0.6)).toBeCloseTo(2, 1);
    expect(p(1)).toBeCloseTo(4, 1);
    expect(keys.some((k) => k.value.pose === 'stand')).toBe(true);
    expect(keys.some((k) => k.value.pose === 'walk')).toBe(true);
  });

  it('holds the last position when the take ends early', () => {
    const keys = takeKeys(
      [
        { t: 0, x: 0, z: 0 },
        { t: 0.25, x: 1, z: 0 },
        { t: 0.5, x: 2, z: 0 },
      ],
      st(0),
      { isFigure: false, duration: 3 },
    );
    expect(keys[keys.length - 1]).toMatchObject({ t: 1, value: { position: [2, 0, 0] } });
  });

  it('merges samples that land on the same moment', () => {
    const keys = takeKeys(
      [
        { t: 0, x: 0, z: 0 },
        { t: 0.001, x: 0.5, z: 0 },
        { t: 0.5, x: 3, z: 0 },
        { t: 1, x: 3, z: 3 },
      ],
      st(0),
      { isFigure: false, duration: 3 },
    );
    keys.slice(1).forEach((k, i) => expect(k.t - keys[i].t).toBeGreaterThan(0.004));
  });
});

describe('soundtrack', () => {
  const rate = 22050;
  /** Quiet noise with a short loud click at each given time. */
  function clicks(times: number[], seconds: number): Float32Array {
    const s = new Float32Array(Math.round(seconds * rate));
    let seed = 1;
    for (let i = 0; i < s.length; i++) {
      seed = (seed * 16807) % 2147483647;
      s[i] = ((seed / 2147483647) * 2 - 1) * 0.02;
    }
    for (const t of times) {
      const at = Math.round(t * rate);
      for (let i = 0; i < 2000 && at + i < s.length; i++) s[at + i] += Math.sin(i * 0.3) * 0.8 * Math.exp(-i / 600);
    }
    return s;
  }

  it('finds evenly spaced beats', () => {
    const times = [0.5, 1, 1.5, 2, 2.5, 3, 3.5];
    const beats = detectBeats(clicks(times, 4), rate);
    expect(beats).toHaveLength(times.length);
    beats.forEach((b, i) => expect(Math.abs(b - times[i])).toBeLessThan(0.05));
  });

  it('finds nothing in steady noise', () => {
    expect(detectBeats(clicks([], 3), rate).length).toBeLessThanOrEqual(1);
  });

  it('draws peaks per slice', () => {
    const p = waveformPeaks(new Float32Array([0, 0.5, -1, 0.2]), 2);
    expect([...p]).toEqual([0.5, 1]);
  });

  it('snaps to the nearest beat within the tolerance, counting the offset', () => {
    expect(snapToBeat(2.04, [1, 2, 3], 0, 0.1)).toBe(2);
    expect(snapToBeat(2.5, [1, 2, 3], 0, 0.1)).toBeNull();
    expect(snapToBeat(2.52, [1, 2, 3], 0.5, 0.1)).toBe(2.5);
    expect(snapToBeat(1, undefined, 0, 0.1)).toBeNull();
  });

  it('mixes stereo to mono', () => {
    expect([...mixDown([new Float32Array([1, 0]), new Float32Array([0, 1])])]).toEqual([0.5, 0.5]);
  });
});
