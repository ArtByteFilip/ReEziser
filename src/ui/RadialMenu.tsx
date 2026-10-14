import { useEffect, type ReactNode } from 'react';
import { useStore } from '../store/store';
import { objectStateAt } from '../model/scene';
import { expandToGroups, selectedGroup, topLevelOf } from '../model/groups';
import { useTransient, type RadialTarget } from '../viewport/shared';
import { Icon } from './icons';
import { openFraming } from './CameraTools';

interface Item {
  label: string;
  icon: ReactNode;
  run: () => void;
}

const RADIUS = 76;

/** Short right click on an object or camera: its common actions in a ring around the cursor. */
export function RadialMenu() {
  const radial = useTransient((s) => s.radial);
  const close = useTransient((s) => s.closeRadial);
  // Re-render when the project changes so labels like Lock/Unlock stay right.
  useStore((s) => s.project);
  useStore((s) => s.selection);

  // Right-clicking outside the selection acts on that object (and its group) alone.
  useEffect(() => {
    if (!radial) return;
    const s = useStore.getState();
    if (radial.target.kind === 'camera') s.selectCamera(radial.target.id);
    else if (!s.selection.includes(radial.target.id)) s.select([radial.target.id]);
  }, [radial]);

  useEffect(() => {
    if (!radial) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest('.radial')) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('wheel', close, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('wheel', close);
    };
  }, [radial, close]);

  if (!radial) return null;
  const items = radial.target.kind === 'object' ? objectItems(radial.target.id) : cameraItems(radial.target);
  const x = Math.min(Math.max(radial.x, RADIUS + 40), window.innerWidth - RADIUS - 40);
  const y = Math.min(Math.max(radial.y, RADIUS + 40), window.innerHeight - RADIUS - 40);

  return (
    <div className="radial" style={{ left: x, top: y }} role="menu" onContextMenu={(e) => e.preventDefault()}>
      <div className="radial-hub" />
      {items.map((item, i) => {
        // Start at the top and go clockwise.
        const a = -Math.PI / 2 + (i / items.length) * Math.PI * 2;
        return (
          <button
            key={item.label}
            role="menuitem"
            className="radial-item"
            style={{ transform: `translate(${Math.cos(a) * RADIUS}px, ${Math.sin(a) * RADIUS}px)`, animationDelay: `${i * 18}ms` }}
            onClick={() => {
              close();
              item.run();
            }}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function objectItems(id: string): Item[] {
  const { project, shotIndex, phase, ...s } = useStore.getState();
  const selection = s.selection.includes(id) ? s.selection : expandToGroups(project, [id]);
  const objs = project.objects.filter((o) => selection.includes(o.id));
  if (!objs.length) return [];
  const allLocked = objs.every((o) => o.locked);
  const allHidden = objs.every((o) => !objectStateAt(project, shotIndex, phase, o).visible);
  const group = selectedGroup(project, selection);
  const canGroup = new Set(selection.map((sid) => topLevelOf(project, sid))).size >= 2;
  const frameable = objs.find((o) => o.kind !== 'arrow' && o.kind !== 'label');

  const items: Item[] = [
    { label: 'Duplicate', icon: <Icon.duplicate />, run: () => useStore.getState().duplicateSelection() },
    {
      label: allLocked ? 'Unlock' : 'Lock',
      icon: <Icon.lock open={allLocked} />,
      run: () =>
        useStore.getState().apply((d) =>
          d.objects.filter((o) => selection.includes(o.id)).forEach((o) => void (o.locked = !allLocked)),
        ),
    },
    {
      label: allHidden ? 'Show' : 'Hide',
      icon: <Icon.eye off={!allHidden} />,
      run: () => {
        const st = useStore.getState();
        st.setObjectStates(
          Object.fromEntries(
            objs.map((o) => [o.id, { ...objectStateAt(st.project, st.shotIndex, st.phase, o), visible: allHidden }]),
          ),
        );
      },
    },
  ];
  if (frameable) {
    items.push({
      label: 'Frame',
      icon: <Icon.frame />,
      run: () => openFraming(frameable.id),
    });
  }
  if (group) items.push({ label: 'Ungroup', icon: <Icon.ungroup />, run: () => useStore.getState().ungroupSelection() });
  else if (canGroup) items.push({ label: 'Group', icon: <Icon.group />, run: () => useStore.getState().groupSelection() });
  items.push({ label: 'Delete', icon: <Icon.trash />, run: () => useStore.getState().deleteSelection() });
  return items;
}

function cameraItems(target: RadialTarget): Item[] {
  const s = useStore.getState();
  const cam = s.project.cameras.find((c) => c.id === target.id);
  if (!cam) return [];
  const active = s.project.shots[s.shotIndex].cameraId === target.id;
  const items: Item[] = [];
  if (active) {
    items.push({ label: 'Look through', icon: <Icon.camera />, run: () => useStore.getState().setViewMode('camera') });
  } else {
    items.push({ label: 'Film this shot', icon: <Icon.camera />, run: () => useStore.getState().useCamera(target.id) });
  }
  items.push({ label: 'New camera', icon: <Icon.plus size={18} />, run: () => useStore.getState().addCamera() });
  if (s.project.cameras.length > 1) {
    items.push({ label: 'Delete', icon: <Icon.trash />, run: () => useStore.getState().deleteCamera(target.id) });
  }
  return items;
}
