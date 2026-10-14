import type { ObjectKind, ObjectState, SceneObject } from './types';
import { POSES } from './poses';

export const CHILD_SCALE = 0.68;
export const ADULT_HEIGHT = 1.75;
/** Height of a free label's text above the floor, in metres. */
export const LABEL_HEIGHT = 1.3;

/** Approximate height of an object at scale 1, in metres. */
export function kindHeight(obj: Pick<SceneObject, 'kind' | 'figureSize'>): number {
  const map: Partial<Record<ObjectKind, number>> = { plane: 2.4, figure: ADULT_HEIGHT, arrow: 0.05, label: LABEL_HEIGHT };
  const h = map[obj.kind] ?? 1;
  return obj.kind === 'figure' && obj.figureSize === 'child' ? h * CHILD_SCALE : h;
}

/** Approximate footprint radius at scale 1, in metres. */
export function kindRadius(kind: ObjectKind): number {
  return kind === 'plane' ? 1 : kind === 'ramp' ? 1 : kind === 'figure' ? 0.3 : kind === 'label' ? 0.15 : 0.5;
}

/** Height of an object in a given state: scale, child size and the figure's pose. */
export function objectHeight(obj: Pick<SceneObject, 'kind' | 'figureSize'>, state: ObjectState): number {
  let h = kindHeight(obj);
  if (obj.kind === 'figure') {
    const size = obj.figureSize === 'child' ? CHILD_SCALE : 1;
    const pose = state.pose ?? 'stand';
    h = pose === 'lie' ? 0.32 * size : (ADULT_HEIGHT + POSES[pose].drop) * size;
  }
  return h * state.scale[1];
}
