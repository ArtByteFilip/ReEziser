import { currentSubject, useStore } from '../store/store';
import { LENSES } from '../model/lens';
import { CAMERA_ANGLES, SHOT_TYPES, type ShotType } from '../model/framing';
import { CAMERA_MOVES, parseMoveId, type MoveDirection } from '../model/cameraMoves';
import { cameraStateAt, cameraHasMotion } from '../model/scene';
import { useTransient, type CameraTab } from '../viewport/shared';
import { Icon } from './icons';

/** Camera tools shared by the camera's context panel and the chips in Camera view. */

export function LensTiles({ value, onPick }: { value: number; onPick: (f: number) => void }) {
  return (
    <div className="lens-tiles">
      {LENSES.map((f) => (
        <button
          key={f}
          className={`lens${Math.abs(value - f) < 0.5 ? ' on' : ''}`}
          title={f <= 24 ? 'Wide lens' : f >= 85 ? 'Long lens' : 'Normal lens'}
          onClick={() => onPick(f)}
        >
          {f}
          <small>mm</small>
        </button>
      ))}
    </div>
  );
}

/** Lens tiles for the current shot's camera at the current Start/End. */
export function ShotLens() {
  const focal = useStore((s) => cameraStateAt(s.project, s.shotIndex, s.phase).focalLength);
  const pick = (f: number) => {
    const s = useStore.getState();
    s.setCamera({ ...cameraStateAt(s.project, s.shotIndex, s.phase), focalLength: f });
  };
  return <LensTiles value={focal} onPick={pick} />;
}

/** Which camera films the current shot, and a way to add one. */
export function CameraPicker({ onPicked }: { onPicked?: () => void }) {
  const cameras = useStore((s) => s.project.cameras);
  const current = useStore((s) => s.project.shots[s.shotIndex].cameraId);
  const useCamera = useStore((s) => s.useCamera);
  const addCamera = useStore((s) => s.addCamera);
  return (
    <div className="chips">
      {cameras.map((c) => (
        <button
          key={c.id}
          className={`chip${c.id === current ? ' on' : ''}`}
          title={c.id === current ? 'Films this shot' : `Film this shot with ${c.name}`}
          onClick={() => {
            useCamera(c.id);
            onPicked?.();
          }}
        >
          {c.name}
        </button>
      ))}
      <button
        className="chip add"
        title="Add a camera at a new angle and film this shot with it"
        onClick={() => {
          addCamera();
          onPicked?.();
        }}
      >
        + New camera
      </button>
    </div>
  );
}

function SubjectLine() {
  const name = useStore((s) => {
    const subj = currentSubject(s);
    return subj ? subj.obj.label || subj.obj.name : null;
  });
  return (
    <div className="tool-note">
      {name ? (
        <>
          Framing <b>{name}</b>
        </>
      ) : (
        'Add a person or object to frame'
      )}
    </div>
  );
}

/** One-click shot types and angles. */
export function FramingTools() {
  const shotType = useStore((s) => s.project.shots[s.shotIndex].shotType);
  const angle = useStore((s) => s.project.shots[s.shotIndex].cameraAngle);
  const frameShot = useStore((s) => s.frameShot);
  const setAngle = useStore((s) => s.setAngle);
  return (
    <div className="tool-section">
      <SubjectLine />
      <div className="chips">
        {SHOT_TYPES.map((t) => (
          <button
            key={t.id}
            className={`chip${shotType === t.id ? ' on' : ''}`}
            title={t.hint}
            onClick={() => frameShot(t.id as ShotType)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="tool-label">Angle</div>
      <div className="chips">
        {CAMERA_ANGLES.map((a) => (
          <button
            key={a.id}
            className={`chip${(angle ?? (shotType ? 'eye-level' : undefined)) === a.id ? ' on' : ''}`}
            title={a.hint}
            onClick={() => setAngle(a.id)}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Camera move presets: pick a move, then which way. */
export function MoveTools() {
  const moveId = useStore((s) => s.project.shots[s.shotIndex].cameraMove);
  const moving = useStore((s) => cameraHasMotion(s.project.shots[s.shotIndex]));
  const applyMove = useStore((s) => s.applyMove);
  const current = parseMoveId(moveId);
  const info = current ? CAMERA_MOVES.find((m) => m.kind === current.kind) : undefined;
  return (
    <div className="tool-section">
      <div className="chips">
        {CAMERA_MOVES.map((m) => {
          const on = m.kind === 'static' ? !moving : current?.kind === m.kind;
          return (
            <button
              key={m.kind}
              className={`chip${on ? ' on' : ''}`}
              title={m.hint}
              onClick={() => applyMove(m.kind, current?.kind === m.kind ? current.dir : 1)}
            >
              {m.label}
            </button>
          );
        })}
      </div>
      {current && info?.directions && (
        <div className="segmented small">
          {([-1, 1] as MoveDirection[]).map((dir) => (
            <button
              key={dir}
              className={current.dir === dir ? 'on' : ''}
              onClick={() => applyMove(current.kind, dir)}
            >
              {info.directions![dir === 1 ? 1 : 0]}
            </button>
          ))}
        </div>
      )}
      {moving && !current && <div className="tool-note">Moves the way you set it up (Start, End or a drawn path).</div>}
      <button
        className="text-btn"
        title="Draw the camera's track on the floor; it keeps its height and direction"
        onClick={() => {
          useStore.getState().clearSelection();
          useTransient.getState().setCameraChip(null);
          useTransient.getState().setTool('path', 'camera');
          useStore.getState().notify('Draw the camera path on the floor. Esc cancels.');
        }}
      >
        <Icon.path /> Draw a camera path
      </button>
    </div>
  );
}

const TABS: { id: CameraTab; label: string }[] = [
  { id: 'lens', label: 'Lens' },
  { id: 'framing', label: 'Framing' },
  { id: 'move', label: 'Move' },
];

/** The tabbed tools in the camera's context panel. */
export function CameraTabs() {
  const tab = useTransient((s) => s.cameraTab);
  const setTab = useTransient((s) => s.setCameraTab);
  return (
    <>
      <div className="segmented tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'lens' && <ShotLens />}
      {tab === 'framing' && <FramingTools />}
      {tab === 'move' && <MoveTools />}
    </>
  );
}

/** Opens the shot-type tools aimed at an object: the camera panel, or the Framing chip in Camera view. */
export function openFraming(objectId: string) {
  const s = useStore.getState();
  useStore.setState({ subjectId: objectId });
  if (s.viewMode === 'camera') {
    useTransient.getState().setCameraChip('framing');
  } else {
    useTransient.getState().setCameraTab('framing');
    s.selectCamera();
  }
}

export function LookThroughButton() {
  return (
    <button className="text-btn" onClick={() => useStore.getState().setViewMode('camera')}>
      <Icon.camera /> Look through
    </button>
  );
}
