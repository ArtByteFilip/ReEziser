import { useEffect, useState } from 'react';
import { useStore, currentFrame } from '../store/store';
import { aspectValue } from '../model/lens';
import { cameraStateAt, resolveCamera } from '../model/scene';
import { cameraFrameRect } from './layout';
import { LensTiles } from './ContextPanel';

function useWindowSize() {
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

/** In Camera view: the frame, darkened surroundings, and the lens chip. */
export function CameraOverlay() {
  const viewMode = useStore((s) => s.viewMode);
  const playing = useStore((s) => !!s.playback);
  const aspect = useStore((s) => aspectValue(s.project.aspectRatio));
  const phase = useStore((s) => s.phase);
  const { w, h } = useWindowSize();
  if (viewMode !== 'camera') return null;
  const r = cameraFrameRect(aspect, w, h, playing);
  const dim = playing ? 'rgba(0,0,0,1)' : 'rgba(10,11,13,0.72)';
  return (
    <div className="camera-overlay" aria-hidden={playing}>
      <div className="dim" style={{ left: 0, top: 0, width: w, height: r.y, background: dim }} />
      <div className="dim" style={{ left: 0, top: r.y + r.height, width: w, height: h - r.y - r.height, background: dim }} />
      <div className="dim" style={{ left: 0, top: r.y, width: r.x, height: r.height, background: dim }} />
      <div
        className="dim"
        style={{ left: r.x + r.width, top: r.y, width: w - r.x - r.width, height: r.height, background: dim }}
      />
      {!playing && (
        <>
          <div
            className={`frame-border${phase === 'end' ? ' end' : ''}`}
            style={{ left: r.x, top: r.y, width: r.width, height: r.height }}
          />
          <FrameInfo x={r.x} y={r.y} />
          <LensChip x={r.x + r.width / 2} y={r.y + r.height - 42} />
        </>
      )}
    </div>
  );
}

function FrameInfo({ x, y }: { x: number; y: number }) {
  const name = useStore((s) => {
    const shot = s.project.shots[s.shotIndex];
    return s.project.cameras.find((c) => c.id === shot.cameraId)?.name ?? '';
  });
  const focal = useStore((s) => Math.round(resolveCamera(s.project, currentFrame(s).shotIndex, currentFrame(s).t).focalLength));
  const phase = useStore((s) => s.phase);
  return (
    <div className="frame-info" style={{ left: x + 10, top: y + 8 }}>
      {name} · {focal} mm · <b className={phase === 'end' ? 'end' : ''}>{phase === 'start' ? 'Start' : 'End'}</b>
    </div>
  );
}

function LensChip({ x, y }: { x: number; y: number }) {
  const [open, setOpen] = useState(false);
  const focal = useStore((s) => cameraStateAt(s.project, s.shotIndex, s.phase).focalLength);
  const pick = (f: number) => {
    const s = useStore.getState();
    s.setCamera({ ...cameraStateAt(s.project, s.shotIndex, s.phase), focalLength: f });
  };
  return (
    <div className="lens-chip-wrap" style={{ left: x, top: y }}>
      {open ? (
        <div className="floating lens-pop" onPointerLeave={() => setOpen(false)}>
          <LensTiles value={focal} onPick={pick} />
        </div>
      ) : (
        <button className="pill-btn lens-chip" title="Change lens" onClick={() => setOpen(true)}>
          {Math.round(focal)} mm
        </button>
      )}
    </div>
  );
}
