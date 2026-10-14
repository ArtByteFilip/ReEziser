import { create } from 'zustand';
import { produce } from 'immer';
import type { CameraState, ObjectKind, ObjectState, Project, SceneObject, ShotPhase } from '../model/types';
import { createObject, createProject } from '../model/defaults';
import { History } from '../model/history';
import { aspectValue } from '../model/lens';
import { addCamera, deleteCamera, setShotCamera } from '../model/cameras';
import {
  applyAngle,
  frameSubject,
  pickSubject,
  subjectFrom,
  type CameraAngle,
  type ShotType,
} from '../model/framing';
import { applyCameraMove, parseMoveId, type MoveDirection, type MoveKind } from '../model/cameraMoves';
import { createGroup, expandToGroups, ungroup } from '../model/groups';
import {
  cameraStateAt,
  deleteObjects,
  duplicateObjects,
  insertShot,
  locateTime,
  objectStateAt,
  phaseT,
  resolveFrame,
  setCameraState,
  setObjectState,
  shotStartTime,
  totalDuration,
} from '../model/scene';

export type ViewMode = 'director' | 'camera';

export interface Playback {
  /** Film time in seconds. */
  time: number;
  /** When set, only this shot plays, in a loop. */
  loopShot: number | null;
  /** Viewport mode to return to when playback stops. */
  returnTo: ViewMode;
}

export interface Hint {
  id: string;
  text: string;
}

interface State {
  project: Project;
  shotIndex: number;
  phase: ShotPhase;
  selection: string[];
  /** The camera whose panel is open, if any. */
  selectedCameraId: string | null;
  /** What one-click framing and orbits aim at: the last object the user picked. */
  subjectId: string | null;
  viewMode: ViewMode;
  playback: Playback | null;
  hint: Hint | null;
  seenHints: string[];
  canUndo: boolean;
  canRedo: boolean;
  /** Shot id -> data URL; not part of the project. */
  thumbnails: Record<string, string>;
  /** Bumped on every project change; used to debounce thumbnail rendering. */
  revision: number;
}

interface Actions {
  /** Changes the project; recorded for undo unless inside a gesture. */
  apply(recipe: (draft: Project) => void): void;
  beginGesture(): void;
  endGesture(): void;
  undo(): void;
  redo(): void;
  loadProject(project: Project): void;

  /** Selects objects; picking one member of a group selects the whole group. */
  select(ids: string[], additive?: boolean): void;
  /** Opens a camera's panel; without an id, the current shot's camera. */
  selectCamera(id?: string): void;
  clearSelection(): void;
  selectShot(index: number): void;
  setPhase(phase: ShotPhase): void;
  setViewMode(mode: ViewMode): void;

  addObject(kind: ObjectKind): void;
  /** Adds a floor arrow from one point to another (x, z). */
  addArrow(from: [number, number], to: [number, number]): void;
  /** Rewrites the state of objects at the current shot and phase. */
  setObjectStates(states: Record<string, ObjectState>): void;
  setCamera(state: CameraState): void;
  deleteSelection(): void;
  duplicateSelection(): void;
  groupSelection(): void;
  ungroupSelection(): void;
  newShot(): void;

  /** Adds a camera and films the current shot with it. */
  addCamera(): void;
  /** Films the current shot with this camera. */
  useCamera(id: string): void;
  deleteCamera(id: string): void;
  /** One-click framing of the subject with the current shot's camera. */
  frameShot(type: ShotType, angle?: CameraAngle): void;
  setAngle(angle: CameraAngle): void;
  applyMove(kind: MoveKind, dir: MoveDirection): void;

  play(fromShot?: number): void;
  loopShot(): void;
  stop(): void;
  tick(dt: number): void;

  /** Shows a one-time hint; does nothing if this hint was shown before. */
  showHint(id: string, text: string): void;
  /** Shows a short message. */
  notify(text: string): void;
  dismissHint(): void;
  setThumbnail(shotId: string, url: string): void;
}

export type Store = State & Actions;

const history = new History<Project>();

function syncHistory(): Pick<State, 'canUndo' | 'canRedo'> {
  return { canUndo: history.canUndo, canRedo: history.canRedo };
}

function validSelection(project: Project, ids: string[]): string[] {
  const live = new Set(project.objects.map((o) => o.id));
  return ids.filter((id) => live.has(id));
}

/** Selection-like state that must follow the project after undo, redo or edits. */
function followProject(s: State, project: Project): Partial<State> {
  return {
    project,
    shotIndex: Math.min(s.shotIndex, project.shots.length - 1),
    selection: validSelection(project, s.selection),
    selectedCameraId: project.cameras.some((c) => c.id === s.selectedCameraId) ? s.selectedCameraId : null,
    revision: s.revision + 1,
    ...syncHistory(),
  };
}

export const useStore = create<Store>()((set, get) => ({
  project: createProject(),
  shotIndex: 0,
  phase: 'start',
  selection: [],
  selectedCameraId: null,
  subjectId: null,
  viewMode: 'director',
  playback: null,
  hint: null,
  seenHints: [],
  canUndo: false,
  canRedo: false,
  thumbnails: {},
  revision: 0,

  apply(recipe) {
    const prev = get().project;
    const next = produce(prev, recipe);
    if (next === prev) return;
    history.record(prev);
    set((s) => followProject(s, next));
  },

  beginGesture() {
    history.begin(get().project);
  },

  endGesture() {
    history.end(get().project);
    set(syncHistory());
  },

  undo() {
    const prev = history.undo(get().project);
    if (!prev) return;
    set((s) => followProject(s, prev));
  },

  redo() {
    const next = history.redo(get().project);
    if (!next) return;
    set((s) => followProject(s, next));
  },

  loadProject(project) {
    history.clear();
    set((s) => ({
      project,
      shotIndex: 0,
      phase: 'start',
      selection: [],
      selectedCameraId: null,
      subjectId: null,
      playback: null,
      thumbnails: {},
      revision: s.revision + 1,
      ...syncHistory(),
    }));
  },

  select(ids, additive = false) {
    set((s) => {
      const picked = expandToGroups(s.project, ids);
      const subjectId = ids.length ? ids[ids.length - 1] : s.subjectId;
      if (!additive) return { selection: picked, selectedCameraId: null, subjectId };
      const sel = new Set(s.selection);
      // Toggle whole groups: if the first member is in, take them all out.
      const remove = picked.length > 0 && sel.has(picked[0]);
      for (const id of picked) {
        if (remove) sel.delete(id);
        else sel.add(id);
      }
      return { selection: [...sel], selectedCameraId: null, subjectId };
    });
  },

  selectCamera(id) {
    const { project, shotIndex } = get();
    set({ selection: [], selectedCameraId: id ?? project.shots[shotIndex].cameraId });
  },

  clearSelection() {
    set({ selection: [], selectedCameraId: null });
  },

  selectShot(index) {
    const { project } = get();
    if (index < 0 || index >= project.shots.length) return;
    set({ shotIndex: index, phase: 'start' });
  },

  setPhase(phase) {
    set({ phase });
  },

  setViewMode(mode) {
    set({ viewMode: mode });
    if (mode === 'camera' && !get().playback) {
      get().showHint('walk-camera', 'W A S D move the camera, Q / E lower and raise it, Shift goes faster.');
    }
  },

  addObject(kind) {
    const { project, shotIndex, phase } = get();
    // Place new objects near the middle of what the shot camera sees, avoiding overlaps.
    const cam = cameraStateAt(project, shotIndex, phase);
    const dir = [cam.target[0] - cam.position[0], cam.target[2] - cam.position[2]];
    const len = Math.hypot(dir[0], dir[1]) || 1;
    const distance = Math.min(5, Math.max(2, len));
    let x = cam.position[0] + (dir[0] / len) * distance;
    let z = cam.position[2] + (dir[1] / len) * distance;
    x = Math.round(x * 4) / 4;
    z = Math.round(z * 4) / 4;
    const taken = (px: number, pz: number) =>
      project.objects.some((o) => {
        const s = objectStateAt(project, shotIndex, phase, o);
        return Math.abs(s.position[0] - px) < 1.1 && Math.abs(s.position[2] - pz) < 1.1;
      });
    for (let i = 0; i < 12 && taken(x, z); i++) x += 1.25;
    const obj = createObject(kind, project.objects, [x, 0, z]);
    get().apply((d) => {
      d.objects.push(obj);
    });
    const isAnnotation = kind === 'label' || kind === 'arrow';
    set({ selection: [obj.id], selectedCameraId: null, subjectId: isAnnotation ? get().subjectId : obj.id });
  },

  addArrow(from, to) {
    const { project } = get();
    const dx = to[0] - from[0];
    const dz = to[1] - from[1];
    const length = Math.hypot(dx, dz);
    const obj = createObject('arrow', project.objects, [(from[0] + to[0]) / 2, 0, (from[1] + to[1]) / 2]);
    // The arrow model points along +Z; turn it to point from `from` to `to`.
    obj.base = { ...obj.base, rotationY: Math.atan2(dx, dz), scale: [1, 1, Math.max(0.5, length)] };
    get().apply((d) => {
      d.objects.push(obj);
    });
    set({ selection: [obj.id], selectedCameraId: null });
  },

  setObjectStates(states) {
    const { shotIndex, phase } = get();
    get().apply((d) => {
      for (const [id, state] of Object.entries(states)) setObjectState(d, shotIndex, phase, id, state);
    });
    maybeHintEnd(get);
  },

  setCamera(state) {
    const { shotIndex, phase } = get();
    get().apply((d) => setCameraState(d, shotIndex, phase, state));
    maybeHintEnd(get);
  },

  deleteSelection() {
    const { selection } = get();
    if (!selection.length) return;
    get().apply((d) => deleteObjects(d, selection));
    set({ selection: [] });
  },

  duplicateSelection() {
    const { selection, shotIndex, phase } = get();
    if (!selection.length) return;
    let ids: string[] = [];
    get().apply((d) => {
      ids = duplicateObjects(d, selection, shotIndex, phase);
    });
    set({ selection: ids });
  },

  groupSelection() {
    const { selection } = get();
    let id: string | null = null;
    get().apply((d) => {
      id = createGroup(d, selection);
    });
    if (id) get().notify('Grouped: they now move as one. Ctrl+Shift+G ungroups.');
  },

  ungroupSelection() {
    const { selection, project } = get();
    if (!project.groups?.length || !selection.length) return;
    get().apply((d) => ungroup(d, selection));
  },

  newShot() {
    let index = 0;
    get().apply((d) => {
      index = insertShot(d, get().shotIndex);
    });
    set({ shotIndex: index, phase: 'start' });
  },

  addCamera() {
    const { shotIndex, phase } = get();
    let id = '';
    get().apply((d) => {
      id = addCamera(d, shotIndex, phase);
    });
    set({ selection: [], selectedCameraId: id });
  },

  useCamera(id) {
    const { shotIndex } = get();
    get().apply((d) => setShotCamera(d, shotIndex, id));
    set({ selection: [], selectedCameraId: id });
  },

  deleteCamera(id) {
    get().apply((d) => deleteCamera(d, id));
    set({ selectedCameraId: null });
  },

  frameShot(type, angle) {
    const s = get();
    const subject = currentSubject(s);
    if (!subject) {
      s.notify('Add a person or an object first, then frame it.');
      return;
    }
    const { project, shotIndex, phase } = s;
    const shot = project.shots[shotIndex];
    const useAngle = angle ?? (shot.cameraAngle as CameraAngle | undefined) ?? 'eye-level';
    const next = frameSubject(
      cameraStateAt(project, shotIndex, phase),
      subjectFrom(subject.obj, subject.state),
      type,
      useAngle,
      aspectValue(project.aspectRatio),
    );
    const pivot = subject.state.position;
    s.apply((d) => {
      setCameraState(d, shotIndex, phase, next);
      const sh = d.shots[shotIndex];
      sh.shotType = type;
      sh.cameraAngle = useAngle;
      // A preset move keeps going from the new framing.
      const move = parseMoveId(sh.cameraMove);
      if (move && phase === 'start') applyCameraMove(d, shotIndex, move.kind, move.dir, pivot);
    });
  },

  setAngle(angle) {
    const s = get();
    const { project, shotIndex, phase } = s;
    const shot = project.shots[shotIndex];
    if (shot.shotType && currentSubject(s)) {
      s.frameShot(shot.shotType as ShotType, angle);
      return;
    }
    const next = applyAngle(cameraStateAt(project, shotIndex, phase), angle);
    s.apply((d) => {
      setCameraState(d, shotIndex, phase, next);
      d.shots[shotIndex].cameraAngle = angle;
    });
  },

  applyMove(kind, dir) {
    const s = get();
    const pivot = currentSubject(s)?.state.position;
    s.apply((d) => applyCameraMove(d, s.shotIndex, kind, dir, pivot));
    if (kind !== 'static') s.showHint('move-end', 'Switch to End to fine-tune where the move ends.');
  },

  play(fromShot) {
    const { project, viewMode } = get();
    const time = fromShot === undefined ? 0 : shotStartTime(project, fromShot);
    set({ playback: { time, loopShot: null, returnTo: viewMode }, viewMode: 'camera' });
  },

  loopShot() {
    const { project, shotIndex, viewMode, playback } = get();
    if (playback) return get().stop();
    set({
      playback: { time: shotStartTime(project, shotIndex), loopShot: shotIndex, returnTo: viewMode },
      viewMode: 'camera',
    });
  },

  stop() {
    const { playback } = get();
    if (!playback) return;
    set({ playback: null, viewMode: playback.returnTo });
  },

  tick(dt) {
    const { playback, project } = get();
    if (!playback) return;
    let time = playback.time + dt;
    if (playback.loopShot !== null) {
      const start = shotStartTime(project, playback.loopShot);
      const d = project.shots[playback.loopShot].duration;
      if (time >= start + d) time = start + ((time - start) % d);
    } else if (time >= totalDuration(project)) {
      get().stop();
      return;
    }
    set({ playback: { ...playback, time } });
  },

  showHint(id, text) {
    const { seenHints } = get();
    if (seenHints.includes(id)) return;
    set({ hint: { id, text }, seenHints: [...seenHints, id] });
  },

  notify(text) {
    set({ hint: { id: `note-${Date.now()}`, text } });
  },

  dismissHint() {
    set({ hint: null });
  },

  setThumbnail(shotId, url) {
    set((s) => ({ thumbnails: { ...s.thumbnails, [shotId]: url } }));
  },
}));

/**
 * The object to frame or orbit: the selected one, else the last one the user
 * picked, if it is still visible; otherwise the one nearest the camera's line of sight.
 */
export function currentSubject(
  s: Pick<State, 'project' | 'shotIndex' | 'phase' | 'subjectId' | 'selection'>,
): { obj: SceneObject; state: ObjectState } | null {
  const { project, shotIndex, phase } = s;
  const states = resolveFrame(project, shotIndex, phaseT(phase));
  const candidates = project.objects
    .filter((o) => o.kind !== 'arrow' && o.kind !== 'label' && states[o.id]?.visible)
    .map((obj) => ({ obj, state: states[obj.id] as ObjectState }));
  const picked =
    candidates.find((c) => c.obj.id === s.selection[0]) ?? candidates.find((c) => c.obj.id === s.subjectId);
  if (picked) return picked;
  return pickSubject(cameraStateAt(project, shotIndex, phase), candidates);
}

function maybeHintEnd(get: () => Store): void {
  if (get().phase === 'start') {
    get().showHint('switch-to-end', 'Switch to End and move something to create motion.');
  }
}

/** The shot and normalized time currently shown in the viewport. */
export function currentFrame(s: Pick<State, 'project' | 'shotIndex' | 'phase' | 'playback'>): {
  shotIndex: number;
  t: number;
} {
  if (s.playback) return locateTime(s.project, s.playback.time);
  return { shotIndex: s.shotIndex, t: phaseT(s.phase) };
}
