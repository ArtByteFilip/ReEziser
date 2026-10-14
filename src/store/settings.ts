import { create } from 'zustand';
import type { StoryboardGrid } from '../export/layout';
import type { Paper } from '../export/pdf';

/** Frame guides in Camera view. Off by default; the frame itself is always shown. */
export interface Guides {
  thirds: boolean;
  safe: boolean;
  axis: boolean;
  horizon: boolean;
}

export const GUIDE_LABELS: Record<keyof Guides, { label: string; hint: string }> = {
  thirds: { label: 'Rule of thirds', hint: 'Lines that split the frame in three' },
  safe: { label: 'Safe areas', hint: 'Keep action and titles inside these on any screen' },
  axis: { label: '180° line', hint: 'The line between two people; cutting across it flips them' },
  horizon: { label: 'Horizon', hint: 'Where the horizon is, and whether the camera is level' },
};

export type ExportKind = 'video' | 'storyboard' | 'shotlist';

export interface ExportPrefs {
  kind: ExportKind;
  burnIn: boolean;
  annotations: boolean;
  grid: StoryboardGrid;
  paper: Paper;
  startEnd: boolean;
}

interface Settings {
  guides: Guides;
  exportPrefs: ExportPrefs;
  toggleGuide(key: keyof Guides): void;
  setExportPrefs(p: Partial<ExportPrefs>): void;
}

const KEY = 'reeziser.settings';

function load(): Partial<Pick<Settings, 'guides' | 'exportPrefs'>> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

function save(s: Pick<Settings, 'guides' | 'exportPrefs'>) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ guides: s.guides, exportPrefs: s.exportPrefs }));
  } catch {
    // Preferences are best effort.
  }
}

const stored = load();

/** Per-machine preferences: not part of the project and not undoable. */
export const useSettings = create<Settings>()((set, get) => ({
  guides: { thirds: false, safe: false, axis: false, horizon: false, ...stored.guides },
  exportPrefs: {
    kind: 'video',
    burnIn: true,
    annotations: true,
    grid: '2x3',
    // Letter where the browser locale is US or Canadian English, A4 elsewhere.
    paper: /^en-(US|CA)$/.test(navigator.language) ? 'letter' : 'a4',
    startEnd: true,
    ...stored.exportPrefs,
  },
  toggleGuide(key) {
    set({ guides: { ...get().guides, [key]: !get().guides[key] } });
    save(get());
  },
  setExportPrefs(p) {
    set({ exportPrefs: { ...get().exportPrefs, ...p } });
    save(get());
  },
}));
