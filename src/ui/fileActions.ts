import { useStore } from '../store/store';
import { openProject, saveProject } from '../io/files';

export async function saveProjectFlow(saveAs: boolean): Promise<void> {
  const { project, notify } = useStore.getState();
  try {
    if (await saveProject(project, saveAs)) notify('Saved');
  } catch {
    notify('Could not save the project.');
  }
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
