import type { Project } from './types';

export const FILE_EXTENSION = '.reeziser';

export function serializeProject(project: Project): string {
  return JSON.stringify(project, null, 2);
}

export class ProjectFileError extends Error {}

/** Parses and sanity-checks a project file. Throws ProjectFileError on bad input. */
export function parseProject(text: string): Project {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ProjectFileError('This file is not a ReEziser project.');
  }
  if (!data || typeof data !== 'object') throw new ProjectFileError('This file is not a ReEziser project.');
  const p = data as Partial<Project>;
  if (p.version !== 1) throw new ProjectFileError('This project was made with a newer version of ReEziser.');
  if (!Array.isArray(p.objects) || !Array.isArray(p.cameras) || !Array.isArray(p.shots)) {
    throw new ProjectFileError('This project file is damaged.');
  }
  if (p.cameras.length === 0 || p.shots.length === 0) throw new ProjectFileError('This project file is damaged.');
  return p as Project;
}
