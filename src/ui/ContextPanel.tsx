import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useStore, currentFrame } from '../store/store';
import { PALETTE } from '../model/defaults';
import { POSE_LABELS, POSE_ORDER } from '../model/poses';
import { clearObjectMotion, hasMotion, objectStateAt, resolveFrame } from '../model/scene';
import { cameraStateFor } from '../model/cameras';
import { selectedGroup, topLevelOf } from '../model/groups';
import type { ObjectState, SceneObject } from '../model/types';
import { kindHeight, viewportApi } from '../viewport/shared';
import { useTransient } from '../viewport/shared';
import { Icon } from './icons';
import { CameraPicker, CameraTabs, LookThroughButton, openFraming } from './CameraTools';
import { STRIP_HEIGHT, TOP_BAR_HEIGHT } from './layout';

/** Floating panel next to the selection: the only place object properties appear. */
export function ContextPanel() {
  const selection = useStore((s) => s.selection);
  // Camera view has its own camera chips, so the camera panel only opens in Director view.
  const cameraId = useStore((s) => (s.viewMode === 'director' ? s.selectedCameraId : null));
  const playing = useStore((s) => !!s.playback);
  const dragging = useTransient((s) => s.dragging);
  const ref = useRef<HTMLDivElement>(null);

  useAnchorToSelection(ref, selection.length > 0 || !!cameraId);

  if (playing || (!selection.length && !cameraId)) return null;
  return (
    <div ref={ref} className={`floating context-panel${dragging ? ' faded' : ''}`}>
      {cameraId ? <CameraSection id={cameraId} /> : <ObjectSection ids={selection} />}
    </div>
  );
}

/** Keeps the panel beside the selected objects (or camera) on screen, every frame. */
function useAnchorToSelection(ref: React.RefObject<HTMLDivElement | null>, active: boolean) {
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const p = new THREE.Vector3();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const el = ref.current;
      const cam = viewportApi.camera;
      const canvas = viewportApi.canvas;
      if (!el || !cam || !canvas) return;
      const s = useStore.getState();
      const { shotIndex, t } = currentFrame(s);
      // Approximate world-space bounds of the selection.
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      const grow = (x: number, y: number, z: number, r: number, h: number) => {
        min[0] = Math.min(min[0], x - r);
        min[1] = Math.min(min[1], y);
        min[2] = Math.min(min[2], z - r);
        max[0] = Math.max(max[0], x + r);
        max[1] = Math.max(max[1], y + h);
        max[2] = Math.max(max[2], z + r);
      };
      if (s.selectedCameraId) {
        if (!s.project.cameras.some((c) => c.id === s.selectedCameraId)) return;
        const c = cameraStateFor(s.project, shotIndex, t, s.selectedCameraId);
        grow(c.position[0], c.position[1] - 0.15, c.position[2], 0.2, 0.3);
      } else {
        const objs = s.project.objects.filter((o) => s.selection.includes(o.id));
        if (!objs.length) return;
        const states = resolveFrame(s.project, shotIndex, t);
        for (const o of objs) {
          const st = states[o.id];
          grow(st.position[0], st.position[1], st.position[2], 0.4 * Math.max(st.scale[0], st.scale[2]), kindHeight(o) * st.scale[1]);
        }
      }
      // Project the box corners and sit beside their screen footprint.
      const rect = canvas.getBoundingClientRect();
      let left = Infinity;
      let right = -Infinity;
      let top = Infinity;
      let bottom = -Infinity;
      let visible = 0;
      for (let i = 0; i < 8; i++) {
        p.set(i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]).project(cam);
        if (p.z > 1) continue;
        visible++;
        const x = rect.left + ((p.x + 1) / 2) * rect.width;
        const y = rect.top + ((1 - p.y) / 2) * rect.height;
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
      const w = el.offsetWidth;
      let sx: number;
      let sy: number;
      if (!visible) {
        sx = rect.right - w - 16;
        sy = TOP_BAR_HEIGHT + 16;
      } else {
        const gap = 24;
        const fitsRight = right + gap + w < window.innerWidth - 12;
        const fitsLeft = left - gap - w > 84;
        sx = fitsRight || !fitsLeft ? right + gap : left - gap - w;
        sy = (top + bottom) / 2 - el.offsetHeight / 2;
      }
      sx = Math.max(84, Math.min(sx, window.innerWidth - w - 12));
      // Stay above the shot strip, and above the timeline when it is open.
      const floor = document.querySelector('.timeline')?.getBoundingClientRect().top ?? window.innerHeight - STRIP_HEIGHT;
      sy = Math.max(TOP_BAR_HEIGHT + 8, Math.min(sy, floor - el.offsetHeight - 16));
      el.style.transform = `translate(${Math.round(sx)}px, ${Math.round(sy)}px)`;
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [ref, active]);
}

function ObjectSection({ ids }: { ids: string[] }) {
  const project = useStore((s) => s.project);
  const shotIndex = useStore((s) => s.shotIndex);
  const phase = useStore((s) => s.phase);
  const apply = useStore((s) => s.apply);
  const setObjectStates = useStore((s) => s.setObjectStates);
  const [more, setMore] = useState(false);

  const objs = project.objects.filter((o) => ids.includes(o.id));
  if (!objs.length) return null;
  const single = objs.length === 1 ? objs[0] : null;
  const figures = objs.filter((o) => o.kind === 'figure');
  const states = Object.fromEntries(objs.map((o) => [o.id, objectStateAt(project, shotIndex, phase, o)]));
  const shot = project.shots[shotIndex];
  const moving = objs.some((o) => hasMotion(shot, o.id));
  const allLocked = objs.every((o) => o.locked);
  const allHidden = objs.every((o) => !states[o.id].visible);
  const group = selectedGroup(project, ids);
  const canGroup = new Set(ids.map((id) => topLevelOf(project, id))).size >= 2;
  const frameable = objs.find((o) => o.kind !== 'arrow' && o.kind !== 'label');
  const movable = single && single.kind !== 'label' && !single.locked ? single : null;

  const updateDefs = (fn: (o: SceneObject) => void) =>
    apply((d) => d.objects.filter((o) => ids.includes(o.id)).forEach(fn));
  const updateStates = (fn: (s: ObjectState, o: SceneObject) => ObjectState) =>
    setObjectStates(Object.fromEntries(objs.map((o) => [o.id, fn(states[o.id], o)])));

  const commonPose = figures.length && figures.every((f) => states[f.id].pose === states[figures[0].id].pose)
    ? states[figures[0].id].pose
    : undefined;

  return (
    <>
      <div className="panel-title">{group ? group.name : single ? single.name : `${objs.length} selected`}</div>
      <div className="swatches">
        {PALETTE.map((c) => (
          <button
            key={c}
            className={`swatch${objs.every((o) => o.color === c) ? ' on' : ''}`}
            style={{ background: c }}
            title="Colour"
            aria-label={`Colour ${c}`}
            onClick={() => updateDefs((o) => void (o.color = c))}
          />
        ))}
      </div>
      {single?.kind === 'label' ? (
        <LabelField obj={single} field="text" />
      ) : (
        single && single.kind !== 'arrow' && <LabelField obj={single} field="label" />
      )}
      {figures.length > 0 && (
        <>
          <div className="chips">
            {POSE_ORDER.map((p) => (
              <button
                key={p}
                className={`chip${commonPose === p ? ' on' : ''}`}
                onClick={() => updateStates((s, o) => (o.kind === 'figure' ? { ...s, pose: p } : s))}
              >
                {POSE_LABELS[p]}
              </button>
            ))}
          </div>
          <div className="segmented small">
            {(['adult', 'child'] as const).map((size) => (
              <button
                key={size}
                className={figures.every((f) => (f.figureSize ?? 'adult') === size) ? 'on' : ''}
                onClick={() =>
                  apply((d) =>
                    d.objects
                      .filter((o) => ids.includes(o.id) && o.kind === 'figure')
                      .forEach((o) => void (o.figureSize = size)),
                  )
                }
              >
                {size === 'adult' ? 'Adult' : 'Child'}
              </button>
            ))}
          </div>
        </>
      )}
      {moving && (
        <button
          className="text-btn"
          title="Make it stay where it starts in this shot"
          onClick={() => apply((d) => ids.forEach((id) => clearObjectMotion(d, shotIndex, id)))}
        >
          <Icon.still /> Remove motion
        </button>
      )}
      {movable && (
        <div className="row-btns">
          <button
            className="text-btn"
            title="Draw a path on the floor; it follows it through the shot"
            onClick={() => {
              useTransient.getState().setTool('path', movable.id);
              useStore.getState().notify('Draw the path on the floor. Esc cancels.');
            }}
          >
            <Icon.path /> Draw path
          </button>
          <button
            className="text-btn"
            title="Perform the move: drag it while the shot plays"
            onClick={() => useStore.getState().startTake(movable.id)}
          >
            <Icon.record /> Record
          </button>
        </div>
      )}
      {(canGroup || group || frameable) && (
        <div className="row-btns">
          {frameable && (
            <button
              className="text-btn"
              title="Frame it with the shot's camera"
              onClick={() => openFraming(frameable.id)}
            >
              <Icon.frame /> Frame
            </button>
          )}
          {group ? (
            <button className="text-btn" title="Ungroup (Ctrl+Shift+G)" onClick={() => useStore.getState().ungroupSelection()}>
              <Icon.ungroup /> Ungroup
            </button>
          ) : (
            canGroup && (
              <button className="text-btn" title="Group (Ctrl+G): move them as one" onClick={() => useStore.getState().groupSelection()}>
                <Icon.group /> Group
              </button>
            )
          )}
        </div>
      )}
      <div className="actions">
        <button title="Duplicate (Ctrl+D)" onClick={() => useStore.getState().duplicateSelection()}>
          <Icon.duplicate />
          <span>Duplicate</span>
        </button>
        <button title={allLocked ? 'Unlock' : 'Lock in place'} onClick={() => updateDefs((o) => void (o.locked = !allLocked))}>
          <Icon.lock open={allLocked} />
          <span>{allLocked ? 'Unlock' : 'Lock'}</span>
        </button>
        <button
          title={allHidden ? 'Show in this shot' : 'Hide in this shot'}
          onClick={() => updateStates((s) => ({ ...s, visible: allHidden }))}
        >
          <Icon.eye off={!allHidden} />
          <span>{allHidden ? 'Show' : 'Hide'}</span>
        </button>
        <button title="Delete (Del)" onClick={() => useStore.getState().deleteSelection()}>
          <Icon.trash />
          <span>Delete</span>
        </button>
      </div>
      {single && (
        <button className="more-toggle" onClick={() => setMore((m) => !m)}>
          {more ? 'Less' : 'More…'}
        </button>
      )}
      {single && more && (
        <PreciseFields state={states[single.id]} onChange={(s) => setObjectStates({ [single.id]: s })} />
      )}
    </>
  );
}

/** Edits an object's floating label, or the text of a free label. */
function LabelField({ obj, field }: { obj: SceneObject; field: 'label' | 'text' }) {
  const apply = useStore((s) => s.apply);
  const value = obj[field] ?? '';
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [obj.id, value]);
  const commit = () => {
    const next = draft.trim();
    if (next !== value) {
      apply((d) => {
        const o = d.objects.find((x) => x.id === obj.id);
        if (!o) return;
        if (next) o[field] = next;
        else delete o[field];
      });
    }
  };
  return (
    <input
      className="text-field"
      autoFocus={field === 'text' && value === 'Label'}
      onFocus={(e) => e.target.select()}
      placeholder={field === 'text' ? 'Text' : 'Label (e.g. Peter)'}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

const RAD = 180 / Math.PI;

/** Expert level: exact numbers, hidden behind "More…". */
function PreciseFields({ state, onChange }: { state: ObjectState; onChange: (s: ObjectState) => void }) {
  const field = (label: string, value: number, set: (v: number) => ObjectState, unit: string) => (
    <label className="num-field">
      <span>{label}</span>
      <NumberInput value={value} onCommit={(v) => onChange(set(v))} />
      <em>{unit}</em>
    </label>
  );
  const p = state.position;
  const s = state.scale;
  return (
    <div className="precise">
      {field('Left/right', p[0], (v) => ({ ...state, position: [v, p[1], p[2]] }), 'm')}
      {field('Height', p[1], (v) => ({ ...state, position: [p[0], Math.max(0, v), p[2]] }), 'm')}
      {field('Front/back', p[2], (v) => ({ ...state, position: [p[0], p[1], v] }), 'm')}
      {field('Turn', state.rotationY * RAD, (v) => ({ ...state, rotationY: v / RAD }), '°')}
      {field('Width', s[0], (v) => ({ ...state, scale: [Math.max(0.01, v), s[1], s[2]] }), '×')}
      {field('Height', s[1], (v) => ({ ...state, scale: [s[0], Math.max(0.01, v), s[2]] }), '×')}
      {field('Depth', s[2], (v) => ({ ...state, scale: [s[0], s[1], Math.max(0.01, v)] }), '×')}
    </div>
  );
}

function NumberInput({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const shown = String(Math.round(value * 100) / 100);
  const [draft, setDraft] = useState(shown);
  useEffect(() => setDraft(shown), [shown]);
  const commit = () => {
    const v = parseFloat(draft.replace(',', '.'));
    if (Number.isFinite(v) && String(v) !== shown) onCommit(v);
    else setDraft(shown);
  };
  return (
    <input
      value={draft}
      inputMode="decimal"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

function CameraSection({ id }: { id: string }) {
  const cam = useStore((s) => s.project.cameras.find((c) => c.id === id));
  const active = useStore((s) => s.project.shots[s.shotIndex].cameraId === id);
  const several = useStore((s) => s.project.cameras.length > 1);
  if (!cam) return null;
  if (!active) {
    return (
      <>
        <div className="panel-title">{cam.name}</div>
        <div className="tool-note">Not filming this shot.</div>
        <button className="text-btn strong" onClick={() => useStore.getState().useCamera(id)}>
          <Icon.camera /> Film this shot with {cam.name}
        </button>
        <button className="text-btn" onClick={() => useStore.getState().deleteCamera(id)}>
          <Icon.trash /> Delete camera
        </button>
      </>
    );
  }
  return (
    <>
      <div className="panel-title">{cam.name}</div>
      {several && <CameraPicker />}
      <CameraTabs />
      <div className="row-btns">
        <LookThroughButton />
        {!several && (
          <button className="text-btn" title="Add a camera at a new angle" onClick={() => useStore.getState().addCamera()}>
            <Icon.plus size={18} /> Camera
          </button>
        )}
      </div>
    </>
  );
}
