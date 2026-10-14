import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useStore, currentFrame } from '../store/store';
import { aspectValue } from '../model/lens';
import { cameraStateAt, resolveCamera } from '../model/scene';
import { crossesAxis } from '../model/axis';
import { angleInfo, shotTypeInfo } from '../model/framing';
import { moveLabel } from '../model/cameraMoves';
import { GUIDE_LABELS, useSettings, type Guides } from '../store/settings';
import { useTransient, viewportApi, type CameraChip } from '../viewport/shared';
import { cameraFrameRect } from './layout';
import type { ShotPhase } from '../model/types';
import { CameraPicker, FramingTools, MoveTools, ShotLens } from './CameraTools';
import { Icon } from './icons';

export function useWindowSize() {
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

type Rect = { x: number; y: number; width: number; height: number };

/** "Start", "End", or the time of a middle key ("1.4 s"). */
export function phaseLabel(phase: ShotPhase, duration: number): string {
  if (phase === 'start') return 'Start';
  if (phase === 'end') return 'End';
  return `${(phase * duration).toFixed(1)} s`;
}

/** In Camera view: the frame, darkened surroundings, guides, and the camera chips. */
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
          <FrameGuides rect={r} />
          <div
            className={`frame-border${phase === 'end' ? ' end' : typeof phase === 'number' ? ' mid' : ''}`}
            style={{ left: r.x, top: r.y, width: r.width, height: r.height }}
          />
          <FrameInfo x={r.x} y={r.y} />
          <CameraChips x={r.x + r.width / 2} y={r.y + r.height - 42} />
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
  const duration = useStore((s) => s.project.shots[s.shotIndex].duration);
  const crosses = useStore((s) => crossesAxis(s.project, s.shotIndex));
  return (
    <div className="frame-info" style={{ left: x + 10, top: y + 8 }}>
      {name} · {focal} mm · <b className={phase === 'end' ? 'end' : typeof phase === 'number' ? 'mid' : ''}>{phaseLabel(phase, duration)}</b>
      {crosses && (
        <span className="axis-warning" title="The camera jumped to the other side of the two people since the last shot, so they swap sides on screen.">
          <Icon.warning /> Crosses the 180° line
        </span>
      )}
    </div>
  );
}


/** Chips along the bottom of the frame; each opens its tools above it. */
function CameraChips({ x, y }: { x: number; y: number }) {
  const open = useTransient((s) => s.cameraChip);
  const setOpen = useTransient((s) => s.setCameraChip);
  const ref = useRef<HTMLDivElement>(null);
  const cameraName = useStore((s) => s.project.cameras.find((c) => c.id === s.project.shots[s.shotIndex].cameraId)?.name);
  const several = useStore((s) => s.project.cameras.length > 1);
  const focal = useStore((s) => cameraStateAt(s.project, s.shotIndex, s.phase).focalLength);
  const framing = useStore((s) => {
    const shot = s.project.shots[s.shotIndex];
    const type = shotTypeInfo(shot.shotType)?.label;
    const angle = shot.cameraAngle && shot.cameraAngle !== 'eye-level' ? angleInfo(shot.cameraAngle)?.label : undefined;
    return [type, angle].filter(Boolean).join(' · ');
  });
  const move = useStore((s) => moveLabel(s.project.shots[s.shotIndex].cameraMove));
  const guidesOn = useSettings((s) => Object.values(s.guides).some(Boolean));

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const chip = (id: CameraChip, label: React.ReactNode, title: string, extra = '') => (
    <button
      className={`pill-btn cam-chip${extra}${open === id ? ' active' : ''}`}
      title={title}
      onClick={() => setOpen(open === id ? null : id)}
    >
      {label}
    </button>
  );

  return (
    <div className="camera-chips" style={{ left: x, top: y }} ref={ref}>
      {open && (
        <div className="floating chip-pop">
          {open === 'camera' && <CameraPicker onPicked={() => setOpen(null)} />}
          {open === 'lens' && <ShotLens />}
          {open === 'framing' && <FramingTools />}
          {open === 'move' && <MoveTools />}
          {open === 'guides' && <GuideToggles />}
        </div>
      )}
      <div className="chip-row">
        {several
          ? chip('camera', cameraName, 'Which camera films this shot')
          : chip('camera', <Icon.plus size={16} />, 'Cameras: add another angle', ' icon-only')}
        {chip('lens', `${Math.round(focal)} mm`, 'Change lens', ' lens-chip')}
        {chip('framing', framing || 'Framing', 'Shot type and angle')}
        {chip('move', move || 'Static', 'Camera move')}
        {chip('guides', <Icon.guides />, 'Frame guides', guidesOn ? ' icon-only lit' : ' icon-only')}
      </div>
    </div>
  );
}

function GuideToggles() {
  const guides = useSettings((s) => s.guides);
  const toggle = useSettings((s) => s.toggleGuide);
  return (
    <div className="toggles">
      {(Object.keys(GUIDE_LABELS) as (keyof Guides)[]).map((k) => (
        <label key={k} className="toggle" title={GUIDE_LABELS[k].hint}>
          <input type="checkbox" checked={guides[k]} onChange={() => toggle(k)} />
          <span className="switch" />
          {GUIDE_LABELS[k].label}
        </label>
      ))}
    </div>
  );
}

/** Rule of thirds, safe areas and the horizon, drawn inside the frame. */
function FrameGuides({ rect: r }: { rect: Rect }) {
  const guides = useSettings((s) => s.guides);
  const inset = (f: number) => ({
    left: r.x + (r.width * (1 - f)) / 2,
    top: r.y + (r.height * (1 - f)) / 2,
    width: r.width * f,
    height: r.height * f,
  });
  return (
    <>
      {guides.thirds && (
        <div className="guide-thirds" style={{ left: r.x, top: r.y, width: r.width, height: r.height }}>
          <i style={{ left: '33.333%' }} />
          <i style={{ left: '66.666%' }} />
          <i className="h" style={{ top: '33.333%' }} />
          <i className="h" style={{ top: '66.666%' }} />
        </div>
      )}
      {guides.safe && (
        <>
          <div className="guide-safe" style={inset(0.93)} title="Action safe" />
          <div className="guide-safe title" style={inset(0.9)}>
            <span>Title safe</span>
          </div>
        </>
      )}
      {guides.horizon && <Horizon rect={r} />}
    </>
  );
}

/**
 * The true horizon as the camera sees it: where every horizontal direction
 * vanishes. Turns green when the camera is level (no roll).
 */
function Horizon({ rect: r }: { rect: Rect }) {
  const lineRef = useRef<SVGLineElement>(null);
  useEffect(() => {
    let raf = 0;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const fwd = new THREE.Vector3();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const cam = viewportApi.camera;
      const canvas = viewportApi.canvas;
      const line = lineRef.current;
      if (!cam || !canvas || !line) return;
      cam.getWorldDirection(fwd);
      fwd.y = 0;
      if (fwd.lengthSq() < 1e-6) {
        line.style.opacity = '0';
        return;
      }
      fwd.normalize();
      // Any point level with the lens lies on the horizon; take two ahead, either side.
      const side = new THREE.Vector3(-fwd.z, 0, fwd.x);
      a.copy(cam.position).addScaledVector(fwd, 10).addScaledVector(side, 3).project(cam);
      b.copy(cam.position).addScaledVector(fwd, 10).addScaledVector(side, -3).project(cam);
      if (a.z > 1 || b.z > 1) {
        line.style.opacity = '0';
        return;
      }
      const cr = canvas.getBoundingClientRect();
      const toPx = (p: THREE.Vector3) => [((p.x + 1) / 2) * cr.width - r.x + cr.left, ((1 - p.y) / 2) * cr.height - r.y + cr.top];
      const [ax, ay] = toPx(a);
      const [bx, by] = toPx(b);
      // Extend across the whole frame.
      const dx = bx - ax;
      const dy = by - ay;
      const len = Math.hypot(dx, dy) || 1;
      const ext = (r.width + r.height) / len;
      line.setAttribute('x1', String(ax - dx * ext));
      line.setAttribute('y1', String(ay - dy * ext));
      line.setAttribute('x2', String(bx + dx * ext));
      line.setAttribute('y2', String(by + dy * ext));
      const level = Math.abs(dy / len) < 0.004;
      line.classList.toggle('level', level);
      line.style.opacity = '1';
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [r.x, r.y, r.width, r.height]);
  return (
    <svg className="guide-horizon" style={{ left: r.x, top: r.y, width: r.width, height: r.height }}>
      <line ref={lineRef} />
    </svg>
  );
}
