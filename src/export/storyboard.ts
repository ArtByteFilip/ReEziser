import type { Project } from '../model/types';
import { aspectValue } from '../model/lens';
import { cameraHasMotion, hasMotion } from '../model/scene';
import { viewportApi } from '../viewport/shared';
import { buildPdf, PAPER, type Paper, type PdfPage } from './pdf';
import { storyboardCells, wrapText, type Rect, type StoryboardGrid } from './layout';
import { shotRows } from './shotList';
import { ExportCancelled, type ExportResult } from './video';

export interface StoryboardOptions {
  grid: StoryboardGrid;
  paper: Paper;
  /** Start and end of each moving shot side by side, with an arrow between. */
  startEnd: boolean;
  annotations: boolean;
}

/** Page resolution: 150 dpi is sharp on paper and keeps files small. */
const DPI = 150;
const FONT = '"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif';
const INK = '#1b1d21';
const DIM = '#6b717c';
const ACCENT = '#d98a0b';

/**
 * A printable storyboard: landscape pages with a grid of shots, each with
 * its picture, number, name, shot type, lens, length, move and note.
 */
export async function exportStoryboard(
  project: Project,
  opts: StoryboardOptions,
  onProgress: (fraction: number) => void,
  signal: AbortSignal,
): Promise<ExportResult> {
  const paper = PAPER[opts.paper];
  const pageW = Math.round((paper.w / 72) * DPI);
  const pageH = Math.round((paper.h / 72) * DPI);
  const aspect = aspectValue(project.aspectRatio);
  const base = pageH / 40;
  const lineHeight = Math.round(base * 0.95);
  const cells = storyboardCells(pageW, pageH, opts.grid, aspect, {
    margin: Math.round(base * 1.6),
    header: Math.round(base * 1.8),
    gap: Math.round(base * 1.2),
    captionLines: opts.grid === '2x3' ? 5 : 4,
    lineHeight,
  });
  const rows = shotRows(project);
  const perPage = cells.length;
  const pageCount = Math.max(1, Math.ceil(project.shots.length / perPage));
  const date = new Date().toLocaleDateString();
  const pages: PdfPage[] = [];

  const canvas = document.createElement('canvas');
  canvas.width = pageW;
  canvas.height = pageH;
  const ctx = canvas.getContext('2d')!;

  for (let page = 0; page < pageCount; page++) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, pageW, pageH);
    drawHeader(ctx, cells[0].cell.x, cells[0].cell.y - base * 0.9, pageW - cells[0].cell.x * 2, base, project.name, `${date} · Page ${page + 1} of ${pageCount}`);

    for (let c = 0; c < perPage; c++) {
      const i = page * perPage + c;
      if (i >= project.shots.length) break;
      if (signal.aborted) throw new ExportCancelled();
      const shot = project.shots[i];
      const { picture, textTop, cell } = cells[c];
      const moves = cameraHasMotion(shot) || project.objects.some((o) => hasMotion(shot, o.id));
      if (opts.startEnd && moves) {
        const gap = picture.width * 0.07;
        const half = (picture.width - gap) / 2;
        const h = half / aspect;
        const top = picture.y + (picture.height - h) / 2;
        await drawStill(ctx, project, i, 0, { x: picture.x, y: top, width: half, height: h }, opts.annotations);
        await drawStill(ctx, project, i, 1, { x: picture.x + half + gap, y: top, width: half, height: h }, opts.annotations);
        drawArrow(ctx, picture.x + half + gap * 0.2, picture.x + half + gap * 0.8, top + h / 2, gap * 0.35);
      } else {
        await drawStill(ctx, project, i, 0, picture, opts.annotations);
      }
      drawCaption(ctx, rows[i], cell.x, textTop, cell.width, lineHeight, opts.grid === '2x3' ? 3 : 2, project.cameras.length > 1);
      onProgress((i + 1) / project.shots.length);
    }

    const jpeg = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not draw the page.'))), 'image/jpeg', 0.9),
    );
    pages.push({ jpeg: new Uint8Array(await jpeg.arrayBuffer()), width: pageW, height: pageH });
  }

  const bytes = buildPdf(pages, paper, `${project.name} — storyboard`);
  return { blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }), extension: '.pdf' };
}

async function drawStill(
  ctx: CanvasRenderingContext2D,
  project: Project,
  shotIndex: number,
  t: number,
  r: Rect,
  annotations: boolean,
): Promise<void> {
  const width = Math.max(2, Math.round(r.width));
  const height = Math.max(2, Math.round(r.height));
  const still = await viewportApi.renderStill({ project, shotIndex, t, width, height, annotations });
  ctx.drawImage(still, r.x, r.y, r.width, r.height);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.lineWidth = 1;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.width - 1, r.height - 1);
}

function drawHeader(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, base: number, title: string, right: string) {
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = INK;
  ctx.font = `600 ${Math.round(base * 1.05)}px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText(title, x, y);
  ctx.fillStyle = DIM;
  ctx.font = `400 ${Math.round(base * 0.7)}px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(right, x + w, y);
  ctx.textAlign = 'left';
}

function drawCaption(
  ctx: CanvasRenderingContext2D,
  row: ReturnType<typeof shotRows>[number],
  x: number,
  top: number,
  width: number,
  lineHeight: number,
  noteLines: number,
  showCamera: boolean,
): void {
  const size = Math.round(lineHeight * 0.72);
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  let y = top;

  // Line 1: number and name, length on the right.
  ctx.font = `700 ${size}px ${FONT}`;
  ctx.fillStyle = ACCENT;
  const num = String(row.number);
  ctx.fillText(num, x, y);
  const numW = ctx.measureText(num).width + size * 0.5;
  ctx.fillStyle = INK;
  ctx.font = `600 ${size}px ${FONT}`;
  const dur = `${row.duration} s`;
  const durW = ctx.measureText(dur).width;
  ctx.fillText(fit(ctx, row.name, width - numW - durW - size), x + numW, y);
  ctx.fillStyle = DIM;
  ctx.font = `400 ${size}px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(dur, x + width, y);
  ctx.textAlign = 'left';
  y += lineHeight;

  // Line 2: camera, shot type, angle, lens, move.
  const facts = [showCamera ? row.camera : '', row.type, row.angle, row.lens, row.move].filter(Boolean).join(' · ');
  ctx.fillStyle = INK;
  ctx.fillText(fit(ctx, facts, width), x, y);
  y += lineHeight;

  // The note, wrapped.
  if (row.note) {
    ctx.fillStyle = DIM;
    ctx.font = `italic 400 ${size}px ${FONT}`;
    for (const line of wrapText(row.note, width, noteLines, (s) => ctx.measureText(s).width)) {
      ctx.fillText(line, x, y);
      y += lineHeight;
    }
  }
}

/** Shortens text with an ellipsis to fit a width. */
function fit(ctx: CanvasRenderingContext2D, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text;
  let s = text;
  while (s && ctx.measureText(s + '…').width > width) s = s.slice(0, -1);
  return s.trimEnd() + '…';
}

function drawArrow(ctx: CanvasRenderingContext2D, x1: number, x2: number, y: number, head: number) {
  ctx.strokeStyle = ACCENT;
  ctx.fillStyle = ACCENT;
  ctx.lineWidth = Math.max(2, head / 4);
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2 - head * 0.8, y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y);
  ctx.lineTo(x2 - head, y - head * 0.6);
  ctx.lineTo(x2 - head, y + head * 0.6);
  ctx.closePath();
  ctx.fill();
}
