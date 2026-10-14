import type { Group, ObjectState, Project } from './types';
import { newId } from './defaults';

/**
 * Groups (Ctrl+G) make several objects behave as one: clicking any member
 * selects them all, and dragging, turning or scaling acts on the whole set
 * around its centre. A group has no state of its own; it is only membership.
 */

function groups(project: Project): Group[] {
  return project.groups ?? [];
}

function parentOf(project: Project, id: string): Group | undefined {
  return groups(project).find((g) => g.children.includes(id));
}

/** The outermost group containing an object or group, or the id itself when ungrouped. */
export function topLevelOf(project: Project, id: string): string {
  let current = id;
  for (let guard = 0; guard < 64; guard++) {
    const parent = parentOf(project, current);
    if (!parent) return current;
    current = parent.id;
  }
  return current;
}

/** All object ids inside a group, through nested groups. */
export function leavesOf(project: Project, id: string): string[] {
  const group = groups(project).find((g) => g.id === id);
  if (!group) return [id];
  return group.children.flatMap((c) => leavesOf(project, c));
}

/** Widens a list of object ids to whole groups. Keeps order and drops duplicates. */
export function expandToGroups(project: Project, ids: string[]): string[] {
  const out = new Set<string>();
  for (const id of ids) for (const leaf of leavesOf(project, topLevelOf(project, id))) out.add(leaf);
  return [...out];
}

/** The group whose members are exactly this selection, if there is one. */
export function selectedGroup(project: Project, selection: string[]): Group | null {
  if (selection.length < 2) return null;
  const top = topLevelOf(project, selection[0]);
  const group = groups(project).find((g) => g.id === top);
  if (!group) return null;
  const leaves = leavesOf(project, top);
  const sel = new Set(selection);
  return leaves.length === sel.size && leaves.every((l) => sel.has(l)) ? group : null;
}

/** Groups the selected objects (and the groups they belong to). Returns the new group id, or null. */
export function createGroup(project: Project, ids: string[]): string | null {
  const units = [...new Set(ids.map((id) => topLevelOf(project, id)))];
  if (units.length < 2) return null;
  const list = (project.groups ??= []);
  const group: Group = { id: newId(), name: `Group ${list.length + 1}`, children: units };
  list.push(group);
  return group.id;
}

/** Dissolves the outermost groups of the given objects; nested groups survive one level down. */
export function ungroup(project: Project, ids: string[]): void {
  const tops = new Set(ids.map((id) => topLevelOf(project, id)));
  project.groups = groups(project).filter((g) => !tops.has(g.id));
  if (!project.groups.length) delete project.groups;
}

/** Drops deleted objects from groups, and dissolves groups left with fewer than two members. */
export function pruneGroups(project: Project, removedIds: string[]): void {
  if (!project.groups) return;
  const removed = new Set(removedIds);
  for (const g of project.groups) g.children = g.children.filter((c) => !removed.has(c));
  for (let changed = true; changed; ) {
    changed = false;
    for (const g of project.groups) {
      if (g.children.length >= 2) continue;
      // Hand a lone survivor to the parent group, then drop this one.
      const parent = parentOf(project, g.id);
      if (parent) parent.children = parent.children.flatMap((c) => (c === g.id ? g.children : [c]));
      project.groups = project.groups.filter((x) => x !== g);
      changed = true;
      break;
    }
  }
  if (!project.groups.length) delete project.groups;
}

/** After duplicating objects, recreates groups whose every member was copied. */
export function duplicateGroups(project: Project, copies: Record<string, string>): void {
  const source = groups(project).filter((g) => !parentOf(project, g.id));
  for (const g of source) {
    const leaves = leavesOf(project, g.id);
    if (!leaves.every((l) => copies[l])) continue;
    // Nested structure is flattened; the copy still moves as one.
    (project.groups ??= []).push({ id: newId(), name: `${g.name} copy`, children: leaves.map((l) => copies[l]) });
  }
}

// ---------------------------------------------------------------------------
// Turning and scaling a set of objects around their common centre
// ---------------------------------------------------------------------------

/** Centre of the footprints on the floor (x, z). */
export function floorCentre(states: ObjectState[]): [number, number] {
  if (!states.length) return [0, 0];
  let x = 0;
  let z = 0;
  for (const s of states) {
    x += s.position[0];
    z += s.position[2];
  }
  return [x / states.length, z / states.length];
}

/** Turns a state about a vertical axis through `centre`; positive turns counter-clockwise seen from above. */
export function turnAround(state: ObjectState, centre: [number, number], angle: number): ObjectState {
  const dx = state.position[0] - centre[0];
  const dz = state.position[2] - centre[1];
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return {
    ...state,
    position: [centre[0] + dx * c + dz * s, state.position[1], centre[1] - dx * s + dz * c],
    rotationY: state.rotationY + angle,
  };
}

/** Scales a state's size and its distance from `centre` (height above the floor scales too). */
export function scaleAround(state: ObjectState, centre: [number, number], f: number): ObjectState {
  return {
    ...state,
    position: [
      centre[0] + (state.position[0] - centre[0]) * f,
      state.position[1] * f,
      centre[1] + (state.position[2] - centre[1]) * f,
    ],
    scale: [state.scale[0] * f, state.scale[1] * f, state.scale[2] * f],
  };
}
