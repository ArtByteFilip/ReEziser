import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { useSettings, type ExportKind } from '../store/settings';
import type { Fps } from '../model/types';
import { totalDuration } from '../model/scene';
import { exportVideo, ExportCancelled, type ExportResult } from '../export/video';
import { exportStoryboard } from '../export/storyboard';
import { shotListCsv } from '../export/shotList';
import { exportGltf } from '../export/gltf';
import { saveExport } from '../io/files';
import { Icon } from './icons';

const KINDS: { id: ExportKind; label: string; detail: string; icon: () => React.ReactNode }[] = [
  { id: 'video', label: 'Video', detail: 'MP4 animatic, 1080p', icon: Icon.play },
  { id: 'storyboard', label: 'Storyboard', detail: 'PDF to print or send', icon: Icon.storyboard },
  { id: 'shotlist', label: 'Shot list', detail: 'CSV for spreadsheets', icon: Icon.list },
  { id: 'gltf', label: '3D scene', detail: 'glTF for Blender and other 3D apps', icon: Icon.cube },
];

const FPS_OPTIONS: Fps[] = [24, 25, 30];

/** Export the film as a video, a printable storyboard or a shot list. Opens from the menu. */
export function ExportPanel({ onClose }: { onClose: () => void }) {
  const prefs = useSettings((s) => s.exportPrefs);
  const setPrefs = useSettings((s) => s.setExportPrefs);
  const fps = useStore((s) => s.project.fps);
  const length = useStore((s) => totalDuration(s.project));
  const shotCount = useStore((s) => s.project.shots.length);
  const [progress, setProgress] = useState<number | null>(null);
  const abort = useRef<AbortController | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !abort.current) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  useEffect(() => () => abort.current?.abort(), []);

  const run = async () => {
    const { project, notify } = useStore.getState();
    const controller = new AbortController();
    abort.current = controller;
    setProgress(0);
    try {
      let result: ExportResult;
      let description: string;
      let suffix = '';
      if (prefs.kind === 'video') {
        result = await exportVideo(project, { fps: project.fps, burnIn: prefs.burnIn, annotations: prefs.annotations }, setProgress, controller.signal);
        description = 'Video';
      } else if (prefs.kind === 'storyboard') {
        result = await exportStoryboard(
          project,
          { grid: prefs.grid, paper: prefs.paper, startEnd: prefs.startEnd, annotations: prefs.annotations },
          setProgress,
          controller.signal,
        );
        description = 'PDF document';
        suffix = ' storyboard';
      } else if (prefs.kind === 'gltf') {
        result = await exportGltf(project, { annotations: prefs.annotations });
        description = '3D scene';
      } else {
        result = { blob: new Blob([shotListCsv(project)], { type: 'text/csv' }), extension: '.csv' };
        description = 'Shot list';
        suffix = ' shot list';
      }
      setProgress(1);
      if (await saveExport(result.blob, project.name + suffix, result.extension, description)) {
        notify(result.extension === '.webm' ? 'Exported (as WebM: this computer has no MP4 encoder)' : 'Exported');
        onClose();
      }
    } catch (e) {
      if (!(e instanceof ExportCancelled)) notify(e instanceof Error ? `Export failed: ${e.message}` : 'Export failed.');
    } finally {
      abort.current = null;
      setProgress(null);
    }
  };

  const busy = progress !== null;
  const minutes = Math.floor(length / 60);
  const seconds = Math.round(length % 60);

  return (
    <div className="floating export-panel" ref={ref} role="dialog" aria-label="Export">
      <div className="export-head">
        <span className="panel-title">Export</span>
        <button className="icon-btn ghost" title="Close (Esc)" aria-label="Close" onClick={onClose} disabled={busy}>
          <Icon.close />
        </button>
      </div>
      <div className="export-kinds">
        {KINDS.map((k) => (
          <button
            key={k.id}
            className={`export-kind${prefs.kind === k.id ? ' on' : ''}`}
            disabled={busy}
            onClick={() => setPrefs({ kind: k.id })}
          >
            {k.icon()}
            <span>
              <b>{k.label}</b>
              <small>{k.detail}</small>
            </span>
          </button>
        ))}
      </div>

      <div className="export-options">
        {prefs.kind === 'video' && (
          <>
            <div className="segmented">
              {FPS_OPTIONS.map((f) => (
                <button
                  key={f}
                  className={f === fps ? 'on' : ''}
                  disabled={busy}
                  onClick={() => useStore.getState().apply((d) => void (d.fps = f))}
                >
                  {f} fps
                </button>
              ))}
            </div>
            <Toggle label="Shot number and name on the picture" on={prefs.burnIn} set={(v) => setPrefs({ burnIn: v })} />
            <Toggle label="Arrows and labels" on={prefs.annotations} set={(v) => setPrefs({ annotations: v })} />
            <div className="tool-note">
              {minutes > 0 ? `${minutes} min ` : ''}
              {seconds} s · {shotCount} {shotCount === 1 ? 'shot' : 'shots'}
            </div>
          </>
        )}
        {prefs.kind === 'storyboard' && (
          <>
            <div className="segmented">
              <button className={prefs.grid === '2x3' ? 'on' : ''} onClick={() => setPrefs({ grid: '2x3' })}>
                6 per page
              </button>
              <button className={prefs.grid === '3x3' ? 'on' : ''} onClick={() => setPrefs({ grid: '3x3' })}>
                9 per page
              </button>
            </div>
            <div className="segmented">
              <button className={prefs.paper === 'a4' ? 'on' : ''} onClick={() => setPrefs({ paper: 'a4' })}>
                A4
              </button>
              <button className={prefs.paper === 'letter' ? 'on' : ''} onClick={() => setPrefs({ paper: 'letter' })}>
                Letter
              </button>
            </div>
            <Toggle label="Start and end of shots that move" on={prefs.startEnd} set={(v) => setPrefs({ startEnd: v })} />
            <Toggle label="Arrows and labels" on={prefs.annotations} set={(v) => setPrefs({ annotations: v })} />
          </>
        )}
        {prefs.kind === 'gltf' && (
          <>
            <div className="tool-note">
              The set, every camera, and the whole film as one animation with a Film camera that cuts like the film. People keep
              the pose they have at the start.
            </div>
            <Toggle label="Arrows" on={prefs.annotations} set={(v) => setPrefs({ annotations: v })} />
          </>
        )}
        {prefs.kind === 'shotlist' && (
          <div className="tool-note">Number, camera, lens, shot type, angle, move, length and note for every shot.</div>
        )}
      </div>

      {busy ? (
        <div className="export-progress">
          <div className="bar">
            <div style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <button className="text-btn" onClick={() => abort.current?.abort()}>
            Cancel
          </button>
        </div>
      ) : (
        <button className="primary-btn" onClick={run}>
          <Icon.share /> Export {KINDS.find((k) => k.id === prefs.kind)!.label.toLowerCase()}
        </button>
      )}
    </div>
  );
}

function Toggle({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} />
      <span className="switch" />
      {label}
    </label>
  );
}
