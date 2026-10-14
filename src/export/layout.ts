/** Pure layout maths for exports. */

/**
 * Video frame size for "1080p" in the project's aspect: 1920 wide for wide
 * frames (1080 tall when that fits), 1080 wide for tall ones. Always even,
 * as H.264 requires.
 */
export function videoSize(aspect: number): { width: number; height: number } {
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  if (aspect >= 1) {
    const height = Math.min(1080, 1920 / aspect);
    return { width: even(height * aspect), height: even(height) };
  }
  return { width: 1080, height: even(1080 / aspect) };
}

export type StoryboardGrid = '2x3' | '3x3';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StoryboardCell {
  /** The whole cell. */
  cell: Rect;
  /** Where the picture (or the start/end pair) goes. */
  picture: Rect;
  /** Top of the caption below the picture. */
  textTop: number;
}

/**
 * Cells of a storyboard page, left to right then top to bottom. '2x3' is two
 * rows of three, '3x3' three rows of three. The picture keeps the frame's
 * aspect and leaves room for a few lines of caption.
 */
export function storyboardCells(
  pageW: number,
  pageH: number,
  grid: StoryboardGrid,
  aspect: number,
  opts: { margin: number; header: number; gap: number; captionLines: number; lineHeight: number },
): StoryboardCell[] {
  const cols = 3;
  const rows = grid === '2x3' ? 2 : 3;
  const { margin, header, gap, captionLines, lineHeight } = opts;
  const areaW = pageW - margin * 2;
  const areaH = pageH - margin * 2 - header;
  const cellW = (areaW - gap * (cols - 1)) / cols;
  const cellH = (areaH - gap * (rows - 1)) / rows;
  const caption = captionLines * lineHeight + lineHeight * 0.4;
  let picW = cellW;
  let picH = picW / aspect;
  if (picH > cellH - caption) {
    picH = Math.max(10, cellH - caption);
    picW = picH * aspect;
  }
  const cells: StoryboardCell[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = margin + c * (cellW + gap);
      const y = margin + header + r * (cellH + gap);
      cells.push({
        cell: { x, y, width: cellW, height: cellH },
        picture: { x: x + (cellW - picW) / 2, y, width: picW, height: picH },
        textTop: y + picH + lineHeight * 0.4,
      });
    }
  }
  return cells;
}

/** Splits text into lines that fit `maxWidth`, measured by `measure`. Ends with "…" past `maxLines`. */
export function wrapText(text: string, maxWidth: number, maxLines: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (measure(next) <= maxWidth || !line) line = next;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  const trimmed = lines.filter((l, i) => l || i < lines.length - 1);
  if (trimmed.length <= maxLines) return trimmed;
  const kept = trimmed.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last && measure(last + '…') > maxWidth) last = last.slice(0, -1);
  kept[maxLines - 1] = last.trimEnd() + '…';
  return kept;
}
