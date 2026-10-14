import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { aspectValue } from '../model/lens';
import { deleteShot, duplicateShot, moveShot } from '../model/scene';
import { crossesAxis } from '../model/axis';
import { shotTypeInfo } from '../model/framing';
import { moveLabel } from '../model/cameraMoves';
import type { Shot } from '../model/types';
import { Icon } from './icons';

const CARD_HEIGHT = 66;
const MIN_DURATION = 0.5;

/** The row of shots at the bottom, plus the Start | End switch for the selected one. */
export function ShotStrip() {
  const project = useStore((s) => s.project);
  const shots = project.shots;
  // Cuts that jump across the 180° line, computed once per change.
  const crossings = useMemo(() => project.shots.map((_, i) => crossesAxis(project, i)), [project]);
  const aspect = useStore((s) => aspectValue(s.project.aspectRatio));
  const shotIndex = useStore((s) => s.shotIndex);
  const phase = useStore((s) => s.phase);
  const setPhase = useStore((s) => s.setPhase);
  const newShot = useStore((s) => s.newShot);
  const [menu, setMenu] = useState<{ index: number; x: number; y: number } | null>(null);
  const [reorder, setReorder] = useState<{ from: number; to: number } | null>(null);
  const cardsRef = useRef<HTMLDivElement>(null);

  const cardWidth = Math.round(Math.min(150, Math.max(54, CARD_HEIGHT * aspect)));

  return (
    <div className="strip-area">
      <div className="phase-switch segmented" role="tablist" aria-label="Edit the start or end of the shot">
        <button className={phase === 'start' ? 'on' : ''} onClick={() => setPhase('start')} title="Edit how the shot starts">
          Start
        </button>
        <button className={phase === 'end' ? 'on end' : ''} onClick={() => setPhase('end')} title="Edit how the shot ends">
          End
        </button>
      </div>
      <div className="strip" ref={cardsRef}>
        {shots.map((shot, i) => (
          <ShotCard
            key={shot.id}
            shot={shot}
            index={i}
            width={cardWidth}
            selected={i === shotIndex}
            crosses={crossings[i]}
            dropBefore={reorder !== null && reorder.to === i && reorder.from !== i && reorder.from !== i - 1}
            dropAfter={reorder !== null && i === shots.length - 1 && reorder.to === shots.length && reorder.from !== i}
            onMenu={(x, y) => setMenu({ index: i, x, y })}
            onReorder={setReorder}
            containerRef={cardsRef}
          />
        ))}
        <button className="shot-add" title="New shot (N) — continues from where the current shot ends" onClick={newShot}>
          <Icon.plus />
        </button>
      </div>
      {menu && <ShotMenu {...menu} onClose={() => setMenu(null)} />}
    </div>
  );
}

interface CardProps {
  shot: Shot;
  index: number;
  width: number;
  selected: boolean;
  crosses: boolean;
  dropBefore: boolean;
  dropAfter: boolean;
  onMenu: (x: number, y: number) => void;
  onReorder: (r: { from: number; to: number } | null) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

function ShotCard({ shot, index, width, selected, crosses, dropBefore, dropAfter, onMenu, onReorder, containerRef }: CardProps) {
  const thumb = useStore((s) => s.thumbnails[shot.id]);
  const selectShot = useStore((s) => s.selectShot);
  const playingHere = useStore((s) => s.playback !== null && s.shotIndex === index);
  const cameraName = useStore((s) =>
    s.project.cameras.length > 1 ? s.project.cameras.find((c) => c.id === shot.cameraId)?.name : undefined,
  );
  const type = shotTypeInfo(shot.shotType);
  const move = moveLabel(shot.cameraMove);
  const summary = [cameraName, type?.label, move].filter(Boolean).join(' · ');
  const [renaming, setRenaming] = useState(false);

  /** Click selects; dragging the card reorders it. */
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || renaming) return;
    selectShot(index);
    const x0 = e.clientX;
    let dragging = false;
    let to = index;
    const cards = () => [...(containerRef.current?.querySelectorAll<HTMLElement>('.shot-card') ?? [])];
    const move = (ev: PointerEvent) => {
      if (!dragging && Math.abs(ev.clientX - x0) < 6) return;
      dragging = true;
      const mids = cards().map((c) => {
        const r = c.getBoundingClientRect();
        return r.left + r.width / 2;
      });
      to = mids.findIndex((m) => ev.clientX < m);
      if (to === -1) to = mids.length;
      onReorder({ from: index, to });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      onReorder(null);
      if (!dragging) return;
      const target = to > index ? to - 1 : to;
      if (target !== index) {
        useStore.getState().apply((d) => moveShot(d, index, target));
        useStore.getState().selectShot(target);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  /** Dragging the right edge changes the duration (0.5 s steps; Shift for 0.1 s). */
  const onResizeDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const x0 = e.clientX;
    const d0 = shot.duration;
    let started = false;
    const move = (ev: PointerEvent) => {
      if (!started) {
        started = true;
        useStore.getState().beginGesture();
      }
      const step = ev.shiftKey ? 0.1 : 0.5;
      const raw = d0 + (ev.clientX - x0) / 40;
      const next = Math.max(MIN_DURATION, Math.round(raw / step) * step);
      useStore.getState().apply((d) => {
        const s = d.shots.find((x) => x.id === shot.id);
        if (s && s.duration !== next) s.duration = Math.round(next * 10) / 10;
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
    <div
      className={`shot-card${selected ? ' selected' : ''}${dropBefore ? ' drop-before' : ''}${dropAfter ? ' drop-after' : ''}`}
      style={{ width }}
      onPointerDown={onPointerDown}
      onContextMenu={(e) => {
        e.preventDefault();
        selectShot(index);
        onMenu(e.clientX, e.clientY);
      }}
      data-playing={playingHere || undefined}
      title={summary || undefined}
    >
      <div className="thumb" style={{ height: CARD_HEIGHT }}>
        {thumb ? <img src={thumb} alt="" draggable={false} /> : <div className="thumb-empty" />}
        <span className="shot-num">{index + 1}</span>
        {cameraName && <span className="shot-cam">{cameraName.replace(/^Cam /, '')}</span>}
        {(type || move) && (
          <span className="shot-type">
            {type?.short}
            {type && move ? ' · ' : ''}
            {move}
          </span>
        )}
        {crosses && (
          <span className="shot-warn" title="Crosses the 180° line from the previous shot">
            <Icon.warning />
          </span>
        )}
        <div className="resize-handle" onPointerDown={onResizeDown} title="Drag to change length" />
      </div>
      <div className="shot-meta">
        {renaming ? (
          <ShotNameInput shot={shot} onDone={() => setRenaming(false)} />
        ) : (
          <span className="shot-name" onDoubleClick={() => setRenaming(true)} title="Double-click to rename">
            {shot.name}
          </span>
        )}
        <span className="shot-dur">{shot.duration.toFixed(1)}s</span>
      </div>
    </div>
  );
}

function ShotNameInput({ shot, onDone }: { shot: Shot; onDone: () => void }) {
  const [draft, setDraft] = useState(shot.name);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.select(), []);
  const commit = () => {
    const next = draft.trim();
    if (next && next !== shot.name) {
      useStore.getState().apply((d) => {
        const s = d.shots.find((x) => x.id === shot.id);
        if (s) s.name = next;
      });
    }
    onDone();
  };
  return (
    <input
      ref={ref}
      className="shot-name-input"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') onDone();
      }}
    />
  );
}

function ShotMenu({ index, x, y, onClose }: { index: number; x: number; y: number; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
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
  const { apply, selectShot } = useStore.getState();
  return (
    <div className="floating menu shot-menu" ref={ref} style={{ left: x, top: y - 8, transform: 'translateY(-100%)' }}>
      <button
        className="menu-item"
        onClick={() => {
          let at = index;
          apply((d) => {
            at = duplicateShot(d, index);
          });
          selectShot(at);
          onClose();
        }}
      >
        Duplicate
      </button>
      <button
        className="menu-item"
        onClick={() => {
          apply((d) => deleteShot(d, index));
          selectShot(Math.max(0, index - 1));
          onClose();
        }}
      >
        Delete
      </button>
    </div>
  );
}
