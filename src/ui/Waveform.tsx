import { useEffect, useRef } from 'react';
import { useStore } from '../store/store';
import { shotStartTime } from '../model/scene';
import { decodedTrack, peaksFor } from '../audio/soundtrack';
import { useTransient } from '../viewport/shared';

const HEIGHT = 14;
/** Pixels per second of film; matches the time-scaled shot cards. */
const PX_PER_SECOND = 40;

/**
 * The slice of the soundtrack under one shot card: its waveform and beats.
 * Dragging it sideways slides the music against the film.
 */
export function Waveform({ index, width }: { index: number; width: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const project = useStore((s) => s.project);
  const audioVersion = useTransient((s) => s.audioVersion);
  const track = project.audio;
  const shot = project.shots[index];

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !track?.data) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(HEIGHT * dpr);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, HEIGHT);
    const buffer = decodedTrack(track.data);
    if (!buffer) return;
    const from = shotStartTime(project, index);
    const to = from + shot.duration;
    const peaks = peaksFor(track, buffer, from, to, Math.max(1, Math.round(width / 2)));
    ctx.fillStyle = 'rgba(199, 166, 255, 0.55)';
    const bar = width / peaks.length;
    peaks.forEach((p, i) => {
      const h = Math.max(1, p * (HEIGHT - 2));
      ctx.fillRect(i * bar, (HEIGHT - h) / 2, Math.max(1, bar - 0.5), h);
    });
    ctx.fillStyle = '#f5a524';
    for (const b of track.beats ?? []) {
      const t = track.offset + b;
      if (t < from || t > to) continue;
      ctx.fillRect(((t - from) / (to - from)) * width - 0.5, 0, 1.5, HEIGHT);
    }
  }, [project, track, shot, index, width, audioVersion]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || !track) return;
    e.stopPropagation();
    const x0 = e.clientX;
    const offset0 = track.offset;
    let started = false;
    const move = (ev: PointerEvent) => {
      if (!started) {
        if (Math.abs(ev.clientX - x0) < 3) return;
        started = true;
        useStore.getState().beginGesture();
      }
      const offset = Math.round((offset0 + (ev.clientX - x0) / PX_PER_SECOND) * 100) / 100;
      useStore.getState().apply((d) => {
        if (d.audio) d.audio.offset = offset;
      });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (started) useStore.getState().endGesture();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <canvas
      ref={ref}
      className="waveform"
      style={{ width, height: HEIGHT }}
      title={`${track?.file ?? 'Music'}: drag sideways to slide the music against the film`}
      onPointerDown={onPointerDown}
    />
  );
}
