import { useStore } from '../store/store';
import { forgetFileHandle, openProject, saveProject } from '../io/files';
import type { Project } from '../model/types';
import { soundtrackFromFile } from '../audio/soundtrack';

export async function saveProjectFlow(saveAs: boolean): Promise<void> {
  const { project, notify } = useStore.getState();
  try {
    if (await saveProject(project, saveAs)) notify('Saved');
  } catch {
    notify('Could not save the project.');
  }
}

/** New scene and the sample replace the scene undoably, rather than asking first. */
export function replaceScene(next: Project): void {
  forgetFileHandle();
  useStore.getState().apply((d) => {
    for (const key of Object.keys(d) as (keyof Project)[]) delete d[key];
    Object.assign(d, next);
  });
  useStore.setState({ shotIndex: 0, phase: 'start', selection: [], selectedCameraId: null, subjectId: null });
}

/** Picks a music or dialogue file and puts it under the film. */
export function addMusicFlow(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'audio/*,.mp3,.wav,.m4a,.ogg';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    const { apply, notify } = useStore.getState();
    notify(`Reading ${file.name}…`);
    try {
      const track = await soundtrackFromFile(file);
      apply((d) => void (d.audio = track));
      const beats = track.beats?.length ?? 0;
      notify(
        beats > 1
          ? `Music added. ${beats} beats found: shot edges snap to them (Shift: no snapping).`
          : 'Music added.',
      );
    } catch {
      notify('Could not read that audio file. MP3 and WAV work best.');
    }
  };
  input.click();
}

export async function openProjectFlow(): Promise<void> {
  const { loadProject, notify } = useStore.getState();
  try {
    const project = await openProject();
    if (project) loadProject(project);
  } catch (e) {
    notify(e instanceof Error ? e.message : 'Could not open that file.');
  }
}
