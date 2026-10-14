import type { Project, Vec3 } from './types';
import { resolveCamera, resolveFrame } from './scene';

/**
 * The 180° rule: with two people in a scene, an imaginary line runs through
 * them, and cutting to a camera on the other side of it flips who looks
 * left and who looks right.
 */

/** The two people the line runs through: the first two visible figures. */
export function axisPair(project: Project, shotIndex: number, t: number): [string, string] | null {
  const states = resolveFrame(project, shotIndex, t);
  const figures = project.objects.filter((o) => o.kind === 'figure' && states[o.id]?.visible);
  return figures.length >= 2 ? [figures[0].id, figures[1].id] : null;
}

/** The pair's floor positions at a shot and time. */
export function axisLine(project: Project, shotIndex: number, t: number): [Vec3, Vec3] | null {
  const pair = axisPair(project, shotIndex, t);
  if (!pair) return null;
  const states = resolveFrame(project, shotIndex, t);
  return [states[pair[0]].position, states[pair[1]].position];
}

/** Which side of the line A→B a point is on: 1, -1, or 0 when (nearly) on it. */
export function sideOfLine(a: Vec3, b: Vec3, p: Vec3, tolerance = 0.15): 1 | -1 | 0 {
  const abx = b[0] - a[0];
  const abz = b[2] - a[2];
  const len = Math.hypot(abx, abz);
  if (len < 1e-3) return 0;
  // Signed distance of p from the line, in metres.
  const d = (abx * (p[2] - a[2]) - abz * (p[0] - a[0])) / len;
  return Math.abs(d) < tolerance ? 0 : d > 0 ? 1 : -1;
}

/**
 * True when the cut into this shot puts the camera on the other side of the
 * line from where the previous shot ended. Only checked when both shots
 * frame the same two people.
 */
export function crossesAxis(project: Project, shotIndex: number): boolean {
  if (shotIndex <= 0 || shotIndex >= project.shots.length) return false;
  const before = axisPair(project, shotIndex - 1, 1);
  const after = axisPair(project, shotIndex, 0);
  if (!before || !after || before[0] !== after[0] || before[1] !== after[1]) return false;
  const lineBefore = axisLine(project, shotIndex - 1, 1)!;
  const lineAfter = axisLine(project, shotIndex, 0)!;
  const sideBefore = sideOfLine(lineBefore[0], lineBefore[1], resolveCamera(project, shotIndex - 1, 1).position);
  const sideAfter = sideOfLine(lineAfter[0], lineAfter[1], resolveCamera(project, shotIndex, 0).position);
  return sideBefore !== 0 && sideAfter !== 0 && sideBefore !== sideAfter;
}
