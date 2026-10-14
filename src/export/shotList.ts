import type { Project } from '../model/types';
import { resolveCamera } from '../model/scene';
import { angleInfo, shotTypeInfo } from '../model/framing';
import { moveLabel } from '../model/cameraMoves';

/** "35 mm", or "35–70 mm" when the lens changes during the shot. */
export function lensText(project: Project, shotIndex: number): string {
  const a = Math.round(resolveCamera(project, shotIndex, 0).focalLength);
  const b = Math.round(resolveCamera(project, shotIndex, 1).focalLength);
  return a === b ? `${a} mm` : `${a}–${b} mm`;
}

export interface ShotRow {
  number: number;
  name: string;
  camera: string;
  lens: string;
  type: string;
  angle: string;
  move: string;
  duration: string;
  note: string;
}

/** The facts about each shot that the shot list and the storyboard print. */
export function shotRows(project: Project): ShotRow[] {
  return project.shots.map((shot, i) => ({
    number: i + 1,
    name: shot.name,
    camera: project.cameras.find((c) => c.id === shot.cameraId)?.name ?? '',
    lens: lensText(project, i),
    type: shotTypeInfo(shot.shotType)?.label ?? '',
    angle: angleInfo(shot.cameraAngle)?.label ?? '',
    move: moveLabel(shot.cameraMove),
    duration: shot.duration.toFixed(1),
    note: shot.note,
  }));
}

function csvField(value: string | number): string {
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * The shot list as CSV (RFC 4180, comma separated). Starts with a UTF-8 byte
 * order mark so Excel reads accented characters correctly.
 */
export function shotListCsv(project: Project): string {
  const header = ['Shot', 'Name', 'Camera', 'Lens', 'Shot type', 'Angle', 'Move', 'Duration (s)', 'Note'];
  const lines = shotRows(project).map((r) =>
    [r.number, r.name, r.camera, r.lens, r.type, r.angle, r.move, r.duration, r.note].map(csvField).join(','),
  );
  return '﻿' + [header.join(','), ...lines].join('\r\n') + '\r\n';
}
