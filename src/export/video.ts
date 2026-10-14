import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  WebMOutputFormat,
  canEncodeAudio,
  canEncodeVideo,
} from 'mediabunny';
import { renderForFilm } from '../audio/soundtrack';
import type { Fps, Project } from '../model/types';
import { aspectValue } from '../model/lens';
import { locateTime, totalDuration } from '../model/scene';
import { viewportApi } from '../viewport/shared';
import { videoSize } from './layout';

export interface VideoOptions {
  fps: Fps;
  /** Shot number and name in the corner of every frame. */
  burnIn: boolean;
  /** Floor arrows and label text. */
  annotations: boolean;
}

export interface ExportResult {
  blob: Blob;
  extension: string;
}

export class ExportCancelled extends Error {}

/**
 * Renders the whole film frame by frame through each shot's camera and encodes
 * it with the platform's H.264 encoder (WebCodecs) into an MP4, with the
 * soundtrack (AAC, or Opus where AAC can't be encoded). Where H.264 is not
 * available it falls back to VP9 in WebM.
 */
export async function exportVideo(
  project: Project,
  opts: VideoOptions,
  onProgress: (fraction: number) => void,
  signal: AbortSignal,
): Promise<ExportResult> {
  const { width, height } = videoSize(aspectValue(project.aspectRatio));
  const mp4 = await canEncodeVideo('avc', { width, height, quality: QUALITY_HIGH, frameRate: opts.fps });
  if (!mp4 && !(await canEncodeVideo('vp9', { width, height, quality: QUALITY_HIGH }))) {
    throw new Error('This computer cannot encode video.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const output = new Output({
    format: mp4 ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(),
    target: new BufferTarget(),
  });
  const source = new CanvasSource(canvas, { codec: mp4 ? 'avc' : 'vp9', quality: QUALITY_HIGH });
  output.addVideoTrack(source, { frameRate: opts.fps });

  // The soundtrack, cut to the film's length.
  const film = totalDuration(project);
  const music = await renderForFilm(project.audio, film);
  let audioSource: AudioBufferSource | null = null;
  if (music) {
    const aac = mp4 && (await canEncodeAudio('aac', { numberOfChannels: 2, sampleRate: music.sampleRate }));
    if (aac || (await canEncodeAudio('opus', { numberOfChannels: 2, sampleRate: music.sampleRate }))) {
      audioSource = new AudioBufferSource({ codec: aac ? 'aac' : 'opus', quality: QUALITY_HIGH });
      output.addAudioTrack(audioSource);
    }
  }
  await output.start();
  if (audioSource && music) await audioSource.add(music);

  const frames = Math.max(1, Math.round(film * opts.fps));
  try {
    for (let i = 0; i < frames; i++) {
      if (signal.aborted) throw new ExportCancelled();
      // Sample the middle of each frame's time span.
      const { shotIndex, t } = locateTime(project, (i + 0.5) / opts.fps);
      const still = await viewportApi.renderStill({ project, shotIndex, t, width, height, annotations: opts.annotations });
      ctx.drawImage(still, 0, 0);
      if (opts.burnIn) drawShotTitle(ctx, width, height, shotIndex + 1, project.shots[shotIndex].name);
      await source.add(i / opts.fps, 1 / opts.fps);
      onProgress((i + 1) / frames);
    }
    await output.finalize();
  } catch (e) {
    if (output.state !== 'finalized') await output.cancel();
    throw e;
  }
  const buffer = (output.target as BufferTarget).buffer!;
  return { blob: new Blob([buffer], { type: mp4 ? 'video/mp4' : 'video/webm' }), extension: mp4 ? '.mp4' : '.webm' };
}

/** Shot number and name, bottom left, on a soft dark pill. */
function drawShotTitle(ctx: CanvasRenderingContext2D, w: number, h: number, number: number, name: string): void {
  const size = Math.round(Math.min(w, h) / 30);
  const pad = size * 0.7;
  const x = Math.round(Math.min(w, h) * 0.04);
  const y = h - x;
  ctx.font = `600 ${size}px "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif`;
  const num = String(number);
  const numW = ctx.measureText(num).width;
  ctx.font = `400 ${size}px "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif`;
  const nameW = ctx.measureText(name).width;
  const boxW = pad * 3 + numW + nameW;
  const boxH = size * 1.8;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.beginPath();
  ctx.roundRect(x, y - boxH, boxW, boxH, boxH / 2);
  ctx.fill();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#f5a524';
  ctx.font = `600 ${size}px "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif`;
  ctx.fillText(num, x + pad, y - boxH / 2);
  ctx.fillStyle = '#ffffff';
  ctx.font = `400 ${size}px "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif`;
  ctx.fillText(name, x + pad * 2 + numW, y - boxH / 2);
}
