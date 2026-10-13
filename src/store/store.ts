import { create } from 'zustand';
import { produce } from 'immer';
import type { CameraState, ObjectKind, ObjectState, Project, ShotPhase } from '../model/types';
import { createObject, createProject } from '../model/defaults';
import { History } from '../model/history';
import {
  cameraStateAt,
  deleteObjects,
  duplicateObjects,
  insertShot,
  locateTime,
  objectStateAt,
  phaseT,
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
  cameraSelected: boolean;
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

  select(ids: string[], additive?: boolean): void;
  selectCamera(): void;
  clearSelection(): void;
  selectShot(index: number): void;
  setPhase(phase: ShotPhase): void;
  setViewMode(mode: ViewMode): void;

  addObject(kind: ObjectKind): void;
  /** Rewrites the state of objects at the current shot and phase. */
  setObjectStates(states: Record<string, ObjectState>): void;
  setCamera(state: CameraState): void;
  deleteSelection(): void;
  duplicateSelection(): void;
  newShot(): void;

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

export const useStore = create<Store>()((set, get) => ({
  project: createProject(),
  shotIndex: 0,
  phase: 'start',
  selection: [],
  cameraSelected: false,
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
    set((s) => ({
      project: next,
      shotIndex: Math.min(s.shotIndex, next.shots.length - 1),
      selection: validSelection(next, s.selection),
      revision: s.revision + 1,
      ...syncHistory(),
    }));
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
    set((s) => ({
      project: prev,
      shotIndex: Math.min(s.shotIndex, prev.shots.length - 1),
      selection: validSelection(prev, s.selection),
      revision: s.revision + 1,
      ...syncHistory(),
    }));
  },

  redo() {
    const next = history.redo(get().project);
    if (!next) return;
    set((s) => ({
      project: next,
      shotIndex: Math.min(s.shotIndex, next.shots.length - 1),
      selection: validSelection(next, s.selection),
      revision: s.revision + 1,
      ...syncHistory(),
    }));
  },

  loadProject(project) {
    history.clear();
    set((s) => ({
      project,
      shotIndex: 0,
      phase: 'start',
      selection: [],
      cameraSelected: false,
      playback: null,
      thumbnails: {},
      revision: s.revision + 1,
      ...syncHistory(),
    }));
  },

  select(ids, additive = false) {
    set((s) => {
      if (!additive) return { selection: ids, cameraSelected: false };
      const sel = new Set(s.selection);
      for (const id of ids) {
        if (sel.has(id)) sel.delete(id);
        else sel.add(id);
      }
      return { selection: [...sel], cameraSelected: false };
    });
  },

  selectCamera() {
    set({ selection: [], cameraSelected: true });
  },

  clearSelection() {
    set({ selection: [], cameraSelected: false });
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
    set({ selection: [obj.id], cameraSelected: false });
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

  newShot() {
    let index = 0;
    get().apply((d) => {
      index = insertShot(d, get().shotIndex);
    });
    set({ shotIndex: index, phase: 'start' });
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
