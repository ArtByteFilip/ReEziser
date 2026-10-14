import { useEffect, useRef } from 'react';
import { useStore } from '../store/store';
import { ASPECT_RATIOS } from '../model/lens';
import { createProject } from '../model/defaults';
import type { Fps } from '../model/types';
import { forgetFileHandle } from '../io/files';
import { addMusicFlow, openProjectFlow, saveProjectFlow } from './fileActions';
import { useTransient } from '../viewport/shared';

const FPS_OPTIONS: Fps[] = [24, 25, 30];

export function AppMenu({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const aspect = useStore((s) => s.project.aspectRatio);
  const fps = useStore((s) => s.project.fps);
  const canUndo = useStore((s) => s.canUndo);
  const canRedo = useStore((s) => s.canRedo);
  const apply = useStore((s) => s.apply);
  const music = useStore((s) => s.project.audio?.file);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (!ref.current?.contains(target) && !target.closest('.top-left')) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };

  return (
    <div className="floating menu" ref={ref} role="menu">
      <MenuItem
        label="New scene"
        onClick={run(() => {
          // New scene is undoable rather than confirmed.
          const fresh = createProject();
          forgetFileHandle();
          apply((d) => Object.assign(d, fresh));
          useStore.setState({ shotIndex: 0, phase: 'start', selection: [], selectedCameraId: null, subjectId: null });
        })}
      />
      <MenuItem label="Open…" shortcut="Ctrl+O" onClick={run(openProjectFlow)} />
      <MenuItem label="Save" shortcut="Ctrl+S" onClick={run(() => saveProjectFlow(false))} />
      <MenuItem label="Save as…" shortcut="Ctrl+Shift+S" onClick={run(() => saveProjectFlow(true))} />
      <MenuItem label="Export…" shortcut="Ctrl+E" onClick={run(() => useTransient.getState().setExportOpen(true))} />
      <div className="menu-sep" />
      <MenuItem label={music ? 'Replace music…' : 'Add music…'} onClick={run(addMusicFlow)} />
      {music && <MenuItem label={`Remove music (${music})`} onClick={run(() => apply((d) => void delete d.audio))} />}
      <div className="menu-sep" />
      <MenuItem label="Undo" shortcut="Ctrl+Z" disabled={!canUndo} onClick={() => useStore.getState().undo()} />
      <MenuItem label="Redo" shortcut="Ctrl+Shift+Z" disabled={!canRedo} onClick={() => useStore.getState().redo()} />
      <div className="menu-sep" />
      <div className="menu-label">Frame</div>
      <div className="segmented wrap">
        {ASPECT_RATIOS.map((r) => (
          <button
            key={r}
            className={r === aspect ? 'on' : ''}
            onClick={() => apply((d) => void (d.aspectRatio = r))}
          >
            {r}
          </button>
        ))}
      </div>
      <div className="menu-label">Frame rate</div>
      <div className="segmented">
        {FPS_OPTIONS.map((f) => (
          <button key={f} className={f === fps ? 'on' : ''} onClick={() => apply((d) => void (d.fps = f))}>
            {f} fps
          </button>
        ))}
      </div>
    </div>
  );
}

function MenuItem(props: { label: string; shortcut?: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button className="menu-item" role="menuitem" disabled={props.disabled} onClick={props.onClick}>
      <span>{props.label}</span>
      {props.shortcut && <kbd>{props.shortcut}</kbd>}
    </button>
  );
}
