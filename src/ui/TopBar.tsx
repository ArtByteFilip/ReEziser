import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { Icon } from './icons';
import { AppMenu } from './AppMenu';

export function TopBar() {
  const name = useStore((s) => s.project.name);
  const viewMode = useStore((s) => s.viewMode);
  const setViewMode = useStore((s) => s.setViewMode);
  const play = useStore((s) => s.play);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="top-bar">
      <div className="top-left">
        <button
          className={`icon-btn${menuOpen ? ' active' : ''}`}
          title="Menu"
          aria-label="Menu"
          onClick={() => setMenuOpen((o) => !o)}
        >
          <Icon.menu />
        </button>
        {menuOpen && <AppMenu onClose={() => setMenuOpen(false)} />}
      </div>
      <SceneName name={name} />
      <div className="top-right">
        <button className="icon-btn" title="Play film (Space)" aria-label="Play" onClick={() => play()}>
          <Icon.play />
        </button>
        <button
          className="pill-btn"
          title="Switch view (Tab)"
          onClick={() => setViewMode(viewMode === 'director' ? 'camera' : 'director')}
        >
          {viewMode === 'director' ? <Icon.camera /> : <Icon.director />}
          <span>{viewMode === 'director' ? 'Camera view' : 'Director view'}</span>
        </button>
      </div>
    </header>
  );
}

function SceneName({ name }: { name: string }) {
  const apply = useStore((s) => s.apply);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== name) apply((d) => void (d.name = next));
  };

  if (editing) {
    return (
      <input
        ref={input}
        className="scene-name editing"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
        aria-label="Scene name"
      />
    );
  }
  return (
    <button
      className="scene-name"
      title="Rename scene"
      onClick={() => {
        setDraft(name);
        setEditing(true);
      }}
    >
      {name}
    </button>
  );
}
