import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useStore, currentFrame } from '../store/store';
import { resolveFrame, shotStartTime, totalDuration } from '../model/scene';
import { kindHeight, useTransient, viewportApi } from '../viewport/shared';
import { Icon } from './icons';

/** While playing: a thin progress bar and a stop button; everything else hides. */
export function PlaybackOverlay() {
  const playback = useStore((s) => s.playback);
  const project = useStore((s) => s.project);
  const stop = useStore((s) => s.stop);
  if (!playback) return null;
  const total = totalDuration(project);
  const { shotIndex } = currentFrame({ ...useStore.getState(), playback });
  return (
    <div className="playback-overlay">
      <div className="progress">
        {project.shots.map((s, i) => (
          <div
            key={s.id}
            className="progress-seg"
            style={{ left: `${(shotStartTime(project, i) / total) * 100}%`, width: `${(s.duration / total) * 100}%` }}
          />
        ))}
        <div className="progress-fill" style={{ width: `${(playback.time / total) * 100}%` }} />
      </div>
      <div className="playback-controls">
        <span className="playback-shot">
          {shotIndex + 1} / {project.shots.length}
          {playback.loopShot !== null && ' · loop'}
        </span>
        <button className="icon-btn" title="Stop (Space)" aria-label="Stop" onClick={stop}>
          <Icon.stop />
        </button>
      </div>
    </div>
  );
}

/** While performing a take: what to do, the shot's progress, and how to get out. */
export function TakeOverlay() {
  const take = useStore((s) => s.take);
  const duration = useStore((s) => (s.take ? s.project.shots[s.take.shotIndex].duration : 1));
  const name = useStore((s) => (s.take ? s.project.objects.find((o) => o.id === s.take!.objectId)?.name : ''));
  if (!take) return null;
  return (
    <div className="take-overlay">
      <div className="take-badge">
        <span className={`rec-dot${take.running ? ' live' : ''}`} />
        {take.running ? 'Recording' : 'Ready'} · {name}
      </div>
      <div className="take-hint">
        {take.running
          ? 'Keep holding and move. Let go to finish.'
          : 'Press anywhere and drag: the shot plays while you hold, and the move is recorded. Esc cancels.'}
      </div>
      <div className="take-progress">
        <div style={{ width: `${(take.time / duration) * 100}%` }} />
      </div>
    </div>
  );
}

export function HintToast() {
  const hint = useStore((s) => s.hint);
  const dismiss = useStore((s) => s.dismissHint);
  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(dismiss, hint.id.startsWith('note-') ? 2200 : 7000);
    return () => clearTimeout(t);
  }, [hint, dismiss]);
  if (!hint) return null;
  return (
    <div className="hint" role="status" onClick={dismiss}>
      {hint.text}
    </div>
  );
}

/**
 * Wraps the viewport: dragging on empty space draws a selection rectangle;
 * a plain click on empty space clears the selection.
 */
export function MarqueeLayer({ children }: { children: React.ReactNode }) {
  const [rect, setRect] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const rectRef = useRef(rect);
  rectRef.current = rect;

  const onPointerDownCapture = (e: React.PointerEvent) => {
    viewportApi.pointerHitObject = false;
    const tool = useTransient.getState().tool;
    if (e.button !== 0) return;
    // Drawing and performing win over picking: keep the event away from objects and orbiting.
    if (useStore.getState().take) {
      e.stopPropagation();
      performTake(e);
    } else if (tool === 'arrow') {
      e.stopPropagation();
      drawArrow(e);
    } else if (tool === 'path') {
      e.stopPropagation();
      drawPath(e);
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || viewportApi.pointerHitObject || useStore.getState().playback || useStore.getState().take) return;
    if ((e.target as HTMLElement).tagName !== 'CANVAS') return;
    const additive = e.shiftKey;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
      moved = true;
      setRect({ x0, y0, x1: ev.clientX, y1: ev.clientY });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setRect(null);
      const store = useStore.getState();
      if (!moved) {
        if (!additive) store.clearSelection();
        return;
      }
      const ids = objectsInRect(x0, y0, ev.clientX, ev.clientY);
      if (additive) store.select(ids.filter((id) => !store.selection.includes(id)), true);
      else store.select(ids);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div className="viewport" onPointerDownCapture={onPointerDownCapture} onPointerDown={onPointerDown}>
      {children}
      {rect && (
        <div
          className="marquee"
          style={{
            left: Math.min(rect.x0, rect.x1),
            top: Math.min(rect.y0, rect.y1),
            width: Math.abs(rect.x1 - rect.x0),
            height: Math.abs(rect.y1 - rect.y0),
          }}
        />
      )}
    </div>
  );
}

/** Raycasts screen coordinates onto a level plane (the floor by default). */
function floorPoint(cx: number, cy: number, height = 0): [number, number] | null {
  const cam = viewportApi.camera;
  const canvas = viewportApi.canvas;
  if (!cam || !canvas) return null;
  const r = canvas.getBoundingClientRect();
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), cam);
  const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -height), new THREE.Vector3());
  return hit ? [hit.x, hit.z] : null;
}

/** Arrow tool: press, drag along the floor, release. A click alone draws a short arrow away from the camera. */
function drawArrow(e: React.PointerEvent) {
  const start = floorPoint(e.clientX, e.clientY);
  const transient = useTransient.getState();
  if (!start) return;
  let end = start;
  const move = (ev: PointerEvent) => {
    const p = floorPoint(ev.clientX, ev.clientY);
    if (!p) return;
    end = p;
    transient.setArrowDraft([start[0], start[1], end[0], end[1]]);
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    let to = end;
    if (Math.hypot(to[0] - start[0], to[1] - start[1]) < 0.3) {
      const cam = viewportApi.camera!;
      const dir = new THREE.Vector3();
      cam.getWorldDirection(dir);
      const len = Math.hypot(dir.x, dir.z) || 1;
      to = [start[0] + (dir.x / len) * 2, start[1] + (dir.z / len) * 2];
    }
    useTransient.getState().setTool(null);
    useStore.getState().addArrow(start, to);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

/** Path tool: the stroke on the floor becomes the object's (or camera's) motion through the shot. */
function drawPath(e: React.PointerEvent) {
  const first = floorPoint(e.clientX, e.clientY);
  const transient = useTransient.getState();
  const target = transient.pathTarget;
  if (!first || !target) return;
  const points: [number, number][] = [first];
  transient.setPathDraft(points.slice());
  const move = (ev: PointerEvent) => {
    const p = floorPoint(ev.clientX, ev.clientY);
    if (!p) return;
    const last = points[points.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.03) return;
    points.push(p);
    transient.setPathDraft(points.slice());
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    useTransient.getState().setTool(null);
    useStore.getState().applyPath(target, points);
    if (target !== 'camera') useStore.getState().select([target]);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

/**
 * A take: pressing starts the shot; while the button is held, the object
 * follows the pointer across the floor and is recorded. Letting go (or the
 * shot ending) keeps the take.
 */
function performTake(e: React.PointerEvent) {
  const store = useStore.getState();
  const take = store.take;
  if (!take || take.running) return;
  const grab = floorPoint(e.clientX, e.clientY, take.start.position[1]);
  if (!grab) return;
  const x0 = take.start.position[0];
  const z0 = take.start.position[2];
  let heading: number | null = null;
  let last: [number, number] = [x0, z0];
  const transient = useTransient.getState();
  transient.setTakePos({ x: x0, z: z0, heading });
  store.runTake();
  const move = (ev: PointerEvent) => {
    const p = floorPoint(ev.clientX, ev.clientY, take.start.position[1]);
    if (!p) return;
    const x = x0 + p[0] - grab[0];
    const z = z0 + p[1] - grab[1];
    // Face the way the object travels, once it has gone a few centimetres.
    if (Math.hypot(x - last[0], z - last[1]) > 0.04) {
      heading = Math.atan2(x - last[0], z - last[1]);
      last = [x, z];
    }
    transient.setTakePos({ x, z, heading });
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    useStore.getState().finishTake();
    useTransient.getState().setTakePos(null);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

function objectsInRect(x0: number, y0: number, x1: number, y1: number): string[] {
  const cam = viewportApi.camera;
  const canvas = viewportApi.canvas;
  if (!cam || !canvas) return [];
  const s = useStore.getState();
  const { shotIndex, t } = currentFrame(s);
  const states = resolveFrame(s.project, shotIndex, t);
  const r = canvas.getBoundingClientRect();
  const [minX, maxX] = [Math.min(x0, x1), Math.max(x0, x1)];
  const [minY, maxY] = [Math.min(y0, y1), Math.max(y0, y1)];
  const p = new THREE.Vector3();
  return s.project.objects
    .filter((o) => {
      if (o.kind === 'label' && s.viewMode !== 'director') return false;
      const st = states[o.id];
      p.set(st.position[0], st.position[1] + (kindHeight(o) * st.scale[1]) / 2, st.position[2]).project(cam);
      if (p.z > 1) return false;
      const sx = r.left + ((p.x + 1) / 2) * r.width;
      const sy = r.top + ((1 - p.y) / 2) * r.height;
      return sx >= minX && sx <= maxX && sy >= minY && sy <= maxY;
    })
    .map((o) => o.id);
}
