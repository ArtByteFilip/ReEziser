import { useEffect, useRef, useState } from 'react';
import type { ObjectKind } from '../model/types';
import { useStore } from '../store/store';
import { Icon } from './icons';

const SHAPES: { kind: ObjectKind; label: string; icon: () => React.ReactNode }[] = [
  { kind: 'figure', label: 'Person', icon: Icon.person },
  { kind: 'box', label: 'Box', icon: Icon.box },
  { kind: 'sphere', label: 'Sphere', icon: Icon.sphere },
  { kind: 'cylinder', label: 'Cylinder', icon: Icon.cylinder },
  { kind: 'cone', label: 'Cone', icon: Icon.cone },
  { kind: 'plane', label: 'Wall', icon: Icon.wall },
  { kind: 'ramp', label: 'Ramp', icon: Icon.ramp },
];

/** The single "add" button and its floating shape palette. */
export function AddPalette() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const addObject = useStore((s) => s.addObject);
  const empty = useStore((s) => s.project.objects.length === 0);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="add-palette" ref={ref}>
      <button
        className={`add-btn${open ? ' active' : ''}`}
        title="Add a person or shape"
        aria-label="Add"
        onClick={() => setOpen((o) => !o)}
      >
        <Icon.plus size={26} />
      </button>
      {empty && !open && <div className="add-nudge">Add a person or shape</div>}
      {open && (
        <div className="floating shapes" role="menu">
          {SHAPES.map((s) => (
            <button
              key={s.kind}
              className={`shape-tile${s.kind === 'figure' ? ' primary' : ''}`}
              onClick={() => {
                addObject(s.kind);
                setOpen(false);
              }}
            >
              {s.icon()}
              <span>{s.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
