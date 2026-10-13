import type { Project } from '../model/types';
import { FILE_EXTENSION, parseProject, serializeProject } from '../model/projectFile';

const AUTOSAVE_KEY = 'reeziser.autosave';

// Minimal typings for the File System Access API (Chromium; also what Tauri's webview offers).
interface FileHandle {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
}
type PickerWindow = Window & {
  showSaveFilePicker?: (opts: unknown) => Promise<FileHandle>;
  showOpenFilePicker?: (opts: unknown) => Promise<FileHandle[]>;
};

const pickerTypes = [{ description: 'ReEziser project', accept: { 'application/json': [FILE_EXTENSION] } }];

let currentHandle: FileHandle | null = null;

export function forgetFileHandle(): void {
  currentHandle = null;
}

function safeFileName(name: string): string {
  return (name.trim() || 'Untitled scene').replace(/[\\/:*?"<>|]+/g, '-');
}

/** Saves the project. Returns false when the user cancelled. */
export async function saveProject(project: Project, saveAs = false): Promise<boolean> {
  const text = serializeProject(project);
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
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = safeFileName(project.name) + FILE_EXTENSION;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

/** Lets the user pick a project file. Resolves null when cancelled. */
export async function openProject(): Promise<Project | null> {
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

export function writeAutosave(project: Project): void {
  try {
    localStorage.setItem(AUTOSAVE_KEY, serializeProject(project));
  } catch {
    // Storage can be unavailable (private mode, quota); autosave is best effort.
  }
}

export function readAutosave(): Project | null {
  try {
    const text = localStorage.getItem(AUTOSAVE_KEY);
    return text ? parseProject(text) : null;
  } catch {
    return null;
  }
}
