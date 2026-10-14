import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { createSampleProject } from './sample';
import { onboardingStep } from './onboarding';
import { MultiFingerTap, pinchOf } from './gestures';
import { createObject, createProject } from './defaults';
import { crossesAxis } from './axis';
import { cameraHasMotion, hasMotion, resolveObjectState, setObjectState, totalDuration } from './scene';
import { parseProject, serializeProject } from './projectFile';

describe('sample scene', () => {
  const p = createSampleProject();

  it('is a valid project of four shots on three cameras', () => {
    expect(parseProject(serializeProject(p))).toEqual(p);
    expect(p.shots).toHaveLength(4);
    expect(p.cameras).toHaveLength(3);
    expect(totalDuration(p)).toBe(13.5);
    expect(p.shots.map((s) => s.name)).toEqual(['Anna arrives', 'Peter looks up', 'Anna sits', 'Together']);
  });

  it('shows motion of people and cameras', () => {
    const anna = p.objects.find((o) => o.name === 'Anna')!;
    expect(hasMotion(p.shots[0], anna.id)).toBe(true);
    expect(cameraHasMotion(p.shots[0])).toBe(true);
    expect(cameraHasMotion(p.shots[3])).toBe(true);
    expect(resolveObjectState(p, 2, 1, anna).pose).toBe('sit');
    // Shot 2 continues from where shot 1 left Anna.
    expect(resolveObjectState(p, 1, 0, anna).position).toEqual(resolveObjectState(p, 0, 1, anna).position);
  });

  it('never crosses the 180° line', () => {
    for (let i = 1; i < p.shots.length; i++) expect(crossesAxis(p, i)).toBe(false);
  });

  it('labels shot types and moves', () => {
    expect(p.shots.map((s) => s.shotType)).toEqual(['wide', 'medium-close-up', 'medium', 'wide']);
    expect(p.shots.map((s) => s.cameraMove)).toEqual(['pan-right', 'dolly-in', undefined, 'crane-up']);
  });
});

describe('first-run tips', () => {
  it('moves on as each step is done, and never goes back', () => {
    const empty = createProject();
    expect(onboardingStep(0, empty, false)).toBe(0);
    const withPerson = produce(empty, (d) => {
      d.objects.push(createObject('figure', []));
    });
    expect(onboardingStep(0, withPerson, false)).toBe(1);
    const moving = produce(withPerson, (d) =>
      setObjectState(d, 0, 'end', d.objects[0].id, { ...d.objects[0].base, position: [3, 0, 0] }),
    );
    expect(onboardingStep(1, moving, false)).toBe(2);
    expect(onboardingStep(2, moving, true)).toBe(3);
    // An opened project that already moves skips straight to "play".
    expect(onboardingStep(0, moving, false)).toBe(2);
    expect(onboardingStep(3, empty, false)).toBe(3);
  });
});

describe('touch taps', () => {
  it('two fingers tapping is undo, three is redo', () => {
    const g = new MultiFingerTap();
    g.press(1, 100, 100, 0);
    g.press(2, 200, 100, 20);
    expect(g.release(1, 120)).toBeNull();
    expect(g.release(2, 140)).toBe('undo');
    g.press(1, 100, 100, 1000);
    g.press(2, 150, 100, 1010);
    g.press(3, 200, 100, 1020);
    g.release(3, 1100);
    g.release(1, 1110);
    expect(g.release(2, 1120)).toBe('redo');
  });

  it('a pinch, a slow press or one finger is not a tap', () => {
    const g = new MultiFingerTap();
    g.press(1, 100, 100, 0);
    g.press(2, 200, 100, 10);
    g.move(2, 260, 100);
    g.release(1, 100);
    expect(g.release(2, 110)).toBeNull();
    g.press(1, 100, 100, 0);
    g.press(2, 200, 100, 10);
    g.release(1, 600);
    expect(g.release(2, 610)).toBeNull();
    g.press(1, 100, 100, 0);
    expect(g.release(1, 50)).toBeNull();
  });

  it('measures a pinch', () => {
    expect(pinchOf({ x: 0, y: 0 }, { x: 6, y: 8 })).toEqual({ distance: 10, x: 3, y: 4 });
  });
});
