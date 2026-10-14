import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open, save } from '@tauri-apps/plugin-dialog';

/**
 * The desktop (Tauri) side of file handling. `desktop` is null in a plain
 * browser, so callers fall back to web APIs there.
 */
export interface Desktop {
  pickSavePath(suggestedName: string, description: string, extension: string): Promise<string | null>;
  pickOpenPath(description: string, extension: string): Promise<string | null>;
  readTextFile(path: string): Promise<string>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  readAutosave(): Promise<string | null>;
  writeAutosave(text: string): Promise<void>;
  /** The project file the app was started with (double-click in Explorer). */
  launchFile(): Promise<{ path: string; text: string } | null>;
  /** Runs `beforeClose` (autosave) when the window is closed, then closes it. */
  onClose(beforeClose: () => Promise<void>): Promise<() => void>;
  setTitle(title: string): Promise<void>;
}

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** UTF-8 hex, because the path travels in an HTTP-style header that must be ASCII. */
function hexUtf8(s: string): string {
  return [...new TextEncoder().encode(s)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const desktop: Desktop | null = isTauri
  ? {
      async pickSavePath(suggestedName, description, extension) {
        return save({ defaultPath: suggestedName, filters: [{ name: description, extensions: [extension.replace(/^\./, '')] }] });
      },
      async pickOpenPath(description, extension) {
        const picked = await open({
          multiple: false,
          directory: false,
          filters: [{ name: description, extensions: [extension.replace(/^\./, '')] }],
        });
        return typeof picked === 'string' ? picked : null;
      },
      readTextFile: (path) => invoke<string>('read_text_file', { path }),
      writeFile: (path, data) => invoke<void>('write_file', data, { headers: { path: hexUtf8(path) } }),
      readAutosave: () => invoke<string | null>('autosave_read'),
      writeAutosave: (text) => invoke<void>('autosave_write', { text }),
      async launchFile() {
        const found = await invoke<[string, string] | null>('launch_file');
        return found ? { path: found[0], text: found[1] } : null;
      },
      onClose(beforeClose) {
        return getCurrentWindow().onCloseRequested(async () => {
          // The window closes once this resolves.
          await beforeClose();
        });
      },
      setTitle: (title) => getCurrentWindow().setTitle(title),
    }
  : null;
