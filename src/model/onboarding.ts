import type { Project } from './types';
import { cameraHasMotion, hasMotion } from './scene';

/**
 * First-run tips (Phase 4): three short hints, each next to the
 * control it is about, each gone as soon as the user has done that step.
 * 0: add a person, 1: make something move, 2: play the film, 3: done.
 */
export type OnboardingStep = 0 | 1 | 2 | 3;

export const ONBOARDING_DONE: OnboardingStep = 3;

function anythingMoves(project: Project): boolean {
  return project.shots.some((s) => cameraHasMotion(s) || project.objects.some((o) => hasMotion(s, o.id)));
}

/**
 * The step to show now. Steps already done (even out of order, or in an
 * opened project) are skipped; the step never goes back.
 */
export function onboardingStep(current: OnboardingStep, project: Project, played: boolean): OnboardingStep {
  let step = current;
  if (step === 0 && project.objects.length > 0) step = 1;
  if (step === 1 && anythingMoves(project)) step = 2;
  if (step === 2 && played) step = 3;
  return step;
}
