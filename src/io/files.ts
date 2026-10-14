import type { Project } from '../model/types';
import { FILE_EXTENSION, parseProject, serializeProject } from '../model/projectFile';
import { desktop } from './desktop';

/**
 * Saving, opening and autosave. In the desktop app (Tauri) these go through
 * native dialogs and the file system, and autosave lives in
 * %APPDATA%/ReEziser/autosave. In a plain browser they use the File System
 * Access API where available (else download / file input) and localStorage.
 */

const AUTOSAVE_KEY = 'reeziser.autosave';

// Minimal typings for the File System Access API (Chromium).
interface FileHandle {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: string | Blob): Promise<void>; close(): Promise<void> }>;
}
type PickerWindow = Window & {
  showSaveFilePicker?: (opts: unknown) => Promise<FileHandle>;
  showOpenFilePicker?: (opts: unknown) => Promise<FileHandle[]>;
};

const pickerTypes = [{ description: 'ReEziser project', accept: { 'application/json': [FILE_EXTENSION] } }];

/** Where Save writes without asking: a browser file handle or a desktop path. */
let currentHandle: FileHandle | null = null;
let currentPath: string | null = null;

export function forgetFileHandle(): void {
  currentHandle = null;
  currentPath = null;
}

/** Remembers the file a project came from (desktop: opened by double-click). */
export function rememberPath(path: string): void {
  currentPath = path;
}

function safeFileName(name: string): string {
  return (name.trim() || 'Untitled scene').replace(/[\\/:*?"<>|]+/g, '-');
}

/** Saves the project. Returns false when the user cancelled. */
export async function saveProject(project: Project, saveAs = false): Promise<boolean> {
  const text = serializeProject(project);
  if (desktop) {
    if (!currentPath || saveAs) {
      const path = await desktop.pickSavePath(safeFileName(project.name) + FILE_EXTENSION, 'ReEziser project', FILE_EXTENSION);
      if (!path) return false;
      currentPath = path;
    }
    await desktop.writeFile(currentPath, new TextEncoder().encode(text));
    return true;
  }
  const w = window as PickerWindow;
  if (w.showSaveFilePicker) {
    try {
      if (!currentHandle || saveAs) {
        currentHandle = await w.showSaveFilePicker({
          suggestedName: safeFileName(project.name) + FILE_EXTENSION,
          types: pickerTypes,
        });
      }
      const writable = await currentHandle.createWritable();
      await writable.write(text);
      await writable.close();
      return true;
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return false;
      throw e;
    }
  }
  download(new Blob([text], { type: 'application/json' }), safeFileName(project.name) + FILE_EXTENSION);
  return true;
}

/** Lets the user pick a project file. Resolves null when cancelled. */
export async function openProject(): Promise<Project | null> {
  if (desktop) {
    const path = await desktop.pickOpenPath('ReEziser project', FILE_EXTENSION);
    if (!path) return null;
    const project = parseProject(await desktop.readTextFile(path));
    currentPath = path;
    return project;
  }
  const w = window as PickerWindow;
  if (w.showOpenFilePicker) {
    try {
      const [handle] = await w.showOpenFilePicker({ types: pickerTypes, multiple: false });
      const project = parseProject(await (await handle.getFile()).text());
      currentHandle = handle;
      return project;
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return null;
      throw e;
    }
  }
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = FILE_EXTENSION + ',application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        resolve(parseProject(await file.text()));
      } catch (e) {
        reject(e);
      }
    };
    input.click();
  });
}

/**
 * Saves an exported file (video, PDF, CSV). Asks where to save when the
 * platform can; otherwise downloads it. Returns false when the user cancelled.
 */
export async function saveExport(blob: Blob, baseName: string, extension: string, description: string): Promise<boolean> {
  const name = safeFileName(baseName) + extension;
  if (desktop) {
    const path = await desktop.pickSavePath(name, description, extension);
    if (!path) return false;
    await desktop.writeFile(path, new Uint8Array(await blob.arrayBuffer()));
    return true;
  }
  const w = window as PickerWindow;
  if (w.showSaveFilePicker) {
    try {
      const handle = await w.showSaveFilePicker({
        suggestedName: name,
        types: [{ description, accept: { [blob.type || 'application/octet-stream']: [extension] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return false;
      throw e;
    }
  }
  download(blob, name);
  return true;
}

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Best effort: autosave must never interrupt the user. */
export async function writeAutosave(project: Project): Promise<void> {
  const text = serializeProject(project);
  try {
    if (desktop) await desktop.writeAutosave(text);
    else {
      try {
        localStorage.setItem(AUTOSAVE_KEY, text);
      } catch {
        // Browser storage is small: keep at least the scene, without the music itself.
        const { audio, ...rest } = project;
        const light = audio ? { ...rest, audio: { ...audio, data: undefined } } : rest;
        localStorage.setItem(AUTOSAVE_KEY, serializeProject(light as Project));
      }
    }
  } catch {
    // Storage can be unavailable (private mode, quota, disk); autosave is best effort.
  }
}

export async function readAutosave(): Promise<Project | null> {
  try {
    const text = desktop ? await desktop.readAutosave() : localStorage.getItem(AUTOSAVE_KEY);
    return text ? parseProject(text) : null;
  } catch {
    return null;
  }
}
