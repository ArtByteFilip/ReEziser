import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { createProject } from '../model/defaults';
import { addCamera } from '../model/cameras';
import { applyCameraMove } from '../model/cameraMoves';
import { insertShot } from '../model/scene';
import { lensText, shotListCsv } from './shotList';
import { buildPdf, PAPER } from './pdf';
import { storyboardCells, videoSize, wrapText } from './layout';

describe('shot list', () => {
  it('lists every shot with camera, lens, type, move and note', () => {
    const p = produce(createProject(), (d) => {
      d.shots[0].shotType = 'close-up';
      d.shots[0].cameraAngle = 'low';
      d.shots[0].note = 'Peter says "no", then leaves';
      applyCameraMove(d, 0, 'zoom', 1);
      insertShot(d, 0);
      addCamera(d, 1, 'start');
    });
    const csv = shotListCsv(p);
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.slice(1).trim().split('\r\n');
    expect(lines[0]).toBe('Shot,Name,Camera,Lens,Shot type,Angle,Move,Duration (s),Note');
    expect(lines[1]).toBe('1,Shot 1,Cam A,35–70 mm,Close-up,Low angle,Zoom in,3.0,"Peter says ""no"", then leaves"');
    // The new camera starts from the current view, including the zoomed-in lens.
    expect(lines[2]).toBe('2,Shot 2,Cam B,70 mm,,,,3.0,');
  });

  it('shows a lens range only when the lens changes', () => {
    const p = createProject();
    expect(lensText(p, 0)).toBe('35 mm');
  });
});

describe('video size', () => {
  it('is 1080p in the frame aspect, with even sides', () => {
    expect(videoSize(16 / 9)).toEqual({ width: 1920, height: 1080 });
    expect(videoSize(4 / 3)).toEqual({ width: 1440, height: 1080 });
    expect(videoSize(1)).toEqual({ width: 1080, height: 1080 });
    expect(videoSize(9 / 16)).toEqual({ width: 1080, height: 1920 });
    const scope = videoSize(2.39);
    expect(scope.width).toBe(1920);
    expect(scope.height % 2).toBe(0);
    expect(scope.height).toBeLessThan(1080);
  });
});

describe('storyboard layout', () => {
  const opts = { margin: 50, header: 40, gap: 30, captionLines: 4, lineHeight: 20 };

  it('makes 6 or 9 cells inside the page', () => {
    for (const [grid, n] of [['2x3', 6], ['3x3', 9]] as const) {
      const cells = storyboardCells(1754, 1240, grid, 16 / 9, opts);
      expect(cells).toHaveLength(n);
      for (const c of cells) {
        expect(c.cell.x).toBeGreaterThanOrEqual(50);
        expect(c.cell.x + c.cell.width).toBeLessThanOrEqual(1754 - 50 + 1e-6);
        expect(c.cell.y + c.cell.height).toBeLessThanOrEqual(1240 - 50 + 1e-6);
        expect(c.picture.width / c.picture.height).toBeCloseTo(16 / 9);
        expect(c.textTop + 4 * 20).toBeLessThanOrEqual(c.cell.y + c.cell.height + 1e-6);
      }
    }
  });

  it('shrinks tall frames to leave room for the caption', () => {
    const [cell] = storyboardCells(1754, 1240, '3x3', 9 / 16, opts);
    expect(cell.picture.width).toBeLessThan(cell.cell.width);
    expect(cell.picture.width / cell.picture.height).toBeCloseTo(9 / 16);
  });

  it('wraps text and ends long notes with an ellipsis', () => {
    const measure = (s: string) => s.length * 10;
    expect(wrapText('one two three', 80, 3, measure)).toEqual(['one two', 'three']);
    const lines = wrapText('a b c d e f g h i j k l m n o p', 30, 2, measure);
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith('…')).toBe(true);
    expect(wrapText('', 100, 2, measure)).toEqual([]);
  });
});

describe('pdf', () => {
  it('writes a well-formed file with one page per image', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const bytes = buildPdf(
      [
        { jpeg, width: 10, height: 7 },
        { jpeg, width: 10, height: 7 },
      ],
      PAPER.a4,
      'Scéna 1',
    );
    const text = new TextDecoder('latin1').decode(bytes);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(text).toContain('/Count 2');
    expect(text.match(/\/Type \/Page /g)).toHaveLength(2);
    // startxref points at the xref table.
    const start = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(start, start + 4)).toBe('xref');
    // Every xref offset points at its object.
    const entries = [...text.slice(start).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    entries.forEach((off, i) => expect(text.slice(off).startsWith(`${i + 1} 0 obj`)).toBe(true));
    expect(text).toContain('/Title <FEFF');
  });
});
