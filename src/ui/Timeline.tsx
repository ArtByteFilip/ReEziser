import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store/store';
import { cameraStatesEqual, objectStatesEqual, phaseT } from '../model/scene';
import { deleteKey, EASINGS, moveKey, setSegmentEasing, type TrackRef } from '../model/timeline';
import type { Easing, Key, Shot } from '../model/types';
import { useTransient } from '../viewport/shared';
import { Icon } from './icons';

const LABEL_W = 116;
const COL_GAP = 10;
/** Clicking within this many pixels of a key lands on the key. */
const SNAP_PX = 7;

interface Row {
  ref: TrackRef;
  label: string;
  keys: Key<unknown>[];
  equal: (a: never, b: never) => boolean;
}

function rowsFor(shot: Shot, objects: { id: string; name: string; label?: string }[], selection: string[], cameraName: string): Row[] {
  const rows: Row[] = [
    { ref: { kind: 'camera' }, label: cameraName, keys: shot.cameraTrack, equal: cameraStatesEqual as Row['equal'] },
  ];
  for (const o of objects) {
    const keys = shot.objectTracks[o.id];
    if (!keys && !selection.includes(o.id)) continue;
    rows.push({ ref: { kind: 'object', id: o.id }, label: o.label || o.name, keys: keys ?? [], equal: objectStatesEqual as Row['equal'] });
  }
  return rows;
}

/**
 * The detailed timeline of one shot (expert level): a row per moving thing,
 * keys as diamonds, the stretches between them with their easing, and a
 * playhead. Moving the playhead into the shot edits a middle key there.
 */
export function Timeline() {
  const project = useStore((s) => s.project);
  const shotIndex = useStore((s) => s.shotIndex);
  const phase = useStore((s) => s.phase);
  const selection = useStore((s) => s.selection);
  const selectedCameraId = useStore((s) => s.selectedCameraId);
  const close = () => useTransient.getState().setTimelineOpen(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const [easingMenu, setEasingMenu] = useState<{ ref: TrackRef; index: number; x: number; y: number } | null>(null);

  const shot = project.shots[shotIndex];
  const camera = project.cameras.find((c) => c.id === shot.cameraId);
  const rows = rowsFor(shot, project.objects, selection, camera?.name ?? 'Camera');
  const t = phaseT(phase);
  const ticks = rulerTicks(shot.duration);

  /** Shot time under a screen x, snapped to keys nearby. */
  const timeAt = (clientX: number): number => {
    const r = trackRef.current!.getBoundingClientRect();
    let u = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    const px = SNAP_PX / r.width;
    for (const row of rows) for (const k of row.keys) if (Math.abs(k.t - u) < px) u = k.t;
    return u;
  };

  /** Drag on the ruler or an empty spot moves the playhead. */
  const onScrub = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const set = (x: number) => useStore.getState().setPhase(timeAt(x));
    set(e.clientX);
    const move = (ev: PointerEvent) => set(ev.clientX);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const focusRow = (ref: TrackRef) => {
    const s = useStore.getState();
    if (ref.kind === 'camera') s.selectCamera();
    else s.select([ref.id]);
  };

  /** Click a key to go there; drag a middle key to retime it. */
  const onKeyDown = (e: React.PointerEvent, row: Row, index: number) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    focusRow(row.ref);
    const s = useStore.getState();
    s.setPhase(row.keys[index].t);
    if (index === 0 || index === row.keys.length - 1) return;
    const r = trackRef.current!.getBoundingClientRect();
    const x0 = e.clientX;
    let started = false;
    const move = (ev: PointerEvent) => {
      if (!started) {
        if (Math.abs(ev.clientX - x0) < 3) return;
        started = true;
        useStore.getState().beginGesture();
      }
      const u = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
      const st = useStore.getState();
      st.apply((d) => moveKey(d, st.shotIndex, row.ref, index, u));
      const moved = row.ref.kind === 'camera' ? useStore.getState().project.shots[st.shotIndex].cameraTrack : useStore.getState().project.shots[st.shotIndex].objectTracks[row.ref.id];
      if (moved?.[index]) st.setPhase(moved[index].t);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (started) useStore.getState().endGesture();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const removeKey = (e: React.MouseEvent, row: Row, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (index === 0 || index === row.keys.length - 1) return;
    const s = useStore.getState();
    s.apply((d) => deleteKey(d, s.shotIndex, row.ref, index));
  };

  const isSelected = (ref: TrackRef) =>
    ref.kind === 'camera' ? selectedCameraId === shot.cameraId : selection.includes(ref.id);

  return (
    <div className="floating timeline" role="region" aria-label="Shot timeline">
      <div className="timeline-head">
        <span className="panel-title">
          {shot.name} <small>{shot.duration.toFixed(1)} s</small>
        </span>
        <span className="tool-note">
          {typeof phase === 'number'
            ? 'Anything you move now adds a step at the playhead.'
            : 'Drag the playhead into the shot to add steps in between.'}
        </span>
        <div className="row-btns">
          <button
            className="text-btn"
            disabled={typeof phase !== 'number'}
            title="Cut this shot in two at the playhead"
            onClick={() => useStore.getState().splitShot()}
          >
            <Icon.split /> Split here
          </button>
          <button className="icon-btn ghost" title="Close the timeline" aria-label="Close timeline" onClick={close}>
            <Icon.chevronDown />
          </button>
        </div>
      </div>

      <div className="timeline-grid" style={{ gridTemplateColumns: `${LABEL_W}px 1fr`, columnGap: COL_GAP }}>
        <div className="tl-label" />
        <div className="tl-ruler" onPointerDown={onScrub}>
          {ticks.map((tick) => (
            <span key={tick.at} className={tick.major ? 'major' : ''} style={{ left: `${tick.at * 100}%` }}>
              {tick.major ? `${tick.seconds}s` : ''}
            </span>
          ))}
        </div>
        {rows.map((row) => (
          <TimelineRow
            key={row.ref.kind === 'camera' ? 'camera' : row.ref.id}
            row={row}
            t={t}
            selected={isSelected(row.ref)}
            onLabel={() => focusRow(row.ref)}
            onScrub={onScrub}
            onKeyDown={onKeyDown}
            onKeyContext={removeKey}
            onSegment={(index, x, y) => setEasingMenu({ ref: row.ref, index, x, y })}
          />
        ))}
        <div className="tl-track-area" ref={trackRef} aria-hidden style={{ left: LABEL_W + COL_GAP }}>
          <div className="tl-playhead" style={{ left: `${t * 100}%` }} />
        </div>
      </div>

      {easingMenu && (
        <EasingMenu
          {...easingMenu}
          current={
            (easingMenu.ref.kind === 'camera'
              ? shot.cameraTrack[easingMenu.index]
              : shot.objectTracks[easingMenu.ref.id]?.[easingMenu.index]
            )?.easing ?? 'smooth'
          }
          onPick={(easing) => {
            const s = useStore.getState();
            s.apply((d) => setSegmentEasing(d, s.shotIndex, easingMenu.ref, easingMenu.index, easing));
            setEasingMenu(null);
          }}
          onClose={() => setEasingMenu(null)}
        />
      )}
    </div>
  );
}

function TimelineRow(props: {
  row: Row;
  t: number;
  selected: boolean;
  onLabel: () => void;
  onScrub: (e: React.PointerEvent) => void;
  onKeyDown: (e: React.PointerEvent, row: Row, index: number) => void;
  onKeyContext: (e: React.MouseEvent, row: Row, index: number) => void;
  onSegment: (index: number, x: number, y: number) => void;
}) {
  const { row, t, selected } = props;
  return (
    <>
      <button className={`tl-label${selected ? ' on' : ''}`} onClick={props.onLabel} title={row.label}>
        {row.ref.kind === 'camera' ? <Icon.camera /> : null}
        <span>{row.label}</span>
      </button>
      <div className={`tl-track${selected ? ' on' : ''}`} onPointerDown={props.onScrub}>
        {row.keys.slice(0, -1).map((k, i) => {
          const next = row.keys[i + 1];
          const moving = !row.equal(k.value as never, next.value as never);
          const label = EASINGS.find((e) => e.id === k.easing)?.label;
          return (
            <button
              key={`seg${i}`}
              className={`tl-seg${moving ? ' moving' : ''}`}
              style={{ left: `${k.t * 100}%`, width: `${(next.t - k.t) * 100}%` }}
              title={moving ? `${label}: click to change how it moves` : 'No change here'}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => moving && props.onSegment(i, e.clientX, e.clientY)}
            >
              {moving && <span>{label}</span>}
            </button>
          );
        })}
        {row.keys.map((k, i) => {
          const end = i === 0 || i === row.keys.length - 1;
          return (
            <button
              key={`key${i}`}
              className={`tl-key${Math.abs(k.t - t) < 0.005 ? ' at' : ''}${end ? ' end' : ''}`}
              style={{ left: `${k.t * 100}%` }}
              title={end ? (i === 0 ? 'Start' : 'End') : 'Drag to retime · right-click to remove'}
              aria-label={end ? (i === 0 ? 'Start key' : 'End key') : 'Step'}
              onPointerDown={(e) => props.onKeyDown(e, row, i)}
              onContextMenu={(e) => props.onKeyContext(e, row, i)}
            />
          );
        })}
      </div>
    </>
  );
}

function EasingMenu(props: {
  x: number;
  y: number;
  current: Easing;
  onPick: (e: Easing) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { onClose } = props;
  useEffect(() => {
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  // In a portal: the timeline's transform would otherwise move a fixed menu.
  return createPortal(
    <div className="floating menu easing-menu" ref={ref} style={{ left: props.x, top: props.y - 8 }} role="menu">
      {EASINGS.map((e) => (
        <button key={e.id} className={`menu-item${e.id === props.current ? ' on' : ''}`} title={e.hint} onClick={() => props.onPick(e.id)}>
          <span>{e.label}</span>
          <EasingCurve easing={e.id} />
        </button>
      ))}
    </div>,
    document.body,
  );
}

/** A tiny drawing of the speed curve. */
function EasingCurve({ easing }: { easing: Easing }) {
  const d: Record<Easing, string> = {
    smooth: 'M2 14 C9 14 9 2 16 2',
    linear: 'M2 14 L16 2',
    easeOut: 'M2 14 C3 4 8 2 16 2',
    easeIn: 'M2 14 C10 14 15 12 16 2',
  };
  return (
    <svg width="18" height="16" viewBox="0 0 18 16" aria-hidden>
      <path d={d[easing]} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** Ruler ticks: every half second, labelled every second (sparser for long shots). */
function rulerTicks(duration: number): { at: number; seconds: number; major: boolean }[] {
  const step = duration > 20 ? 5 : duration > 8 ? 1 : 0.5;
  const majorEvery = duration > 20 ? 10 : duration > 8 ? 2 : 1;
  const out: { at: number; seconds: number; major: boolean }[] = [];
  for (let s = 0; s <= duration + 1e-6; s += step) {
    const seconds = Math.round(s * 10) / 10;
    out.push({ at: seconds / duration, seconds, major: Math.abs(seconds / majorEvery - Math.round(seconds / majorEvery)) < 1e-6 });
  }
  return out;
}
