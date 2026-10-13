import { useEffect } from 'react';
import { Viewport } from './viewport/Viewport';
import { useStore } from './store/store';
import { heldKeys, viewportApi } from './viewport/shared';
import { readAutosave, writeAutosave } from './io/files';
import { TopBar } from './ui/TopBar';
import { AddPalette } from './ui/AddPalette';
import { ContextPanel } from './ui/ContextPanel';
import { ShotStrip } from './ui/ShotStrip';
import { CameraOverlay } from './ui/CameraOverlay';
import { SceneLabels } from './ui/SceneLabels';
import { HintToast, MarqueeLayer, PlaybackOverlay } from './ui/Overlays';
import { openProjectFlow, saveProjectFlow } from './ui/fileActions';

const AUTOSAVE_MS = 30_000;

export function App() {
  const playing = useStore((s) => !!s.playback);
  useShortcuts();
  useAutosave();

  return (
    <div className={`app${playing ? ' playing' : ''}`}>
      <MarqueeLayer>
        <Viewport />
      </MarqueeLayer>
      <SceneLabels />
      <CameraOverlay />
      {!playing && (
        <>
          <TopBar />
          <AddPalette />
          <ContextPanel />
          <ShotStrip />
        </>
      )}
      <PlaybackOverlay />
      <HintToast />
    </div>
  );
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

function useShortcuts() {
  useEffect(() => {
    // Space plays/pauses on release, unless it was held to pan with the mouse.
    let spaceUsedForPan = false;
    const onPointerDown = () => {
      if (heldKeys.has(' ')) spaceUsedForPan = true;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e.target)) {
        if (e.key === 'Escape') (e.target as HTMLElement).blur();
        return;
      }
      const key = e.key.toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl && !e.altKey) {
        if (key === ' ' && !e.repeat) spaceUsedForPan = false;
        heldKeys.add(key);
      }
      const s = useStore.getState();

      if (ctrl) {
        if (key === 'z' && !e.shiftKey) s.undo();
        else if ((key === 'z' && e.shiftKey) || key === 'y') s.redo();
        else if (key === 's') saveProjectFlow(e.shiftKey);
        else if (key === 'o') openProjectFlow();
        else if (key === 'd') s.duplicateSelection();
        else return;
        e.preventDefault();
        return;
      }

      if (s.playback) {
        if (key === 'escape') s.stop();
        if (key === ' ' || key === 'l') e.preventDefault();
        return;
      }

      switch (key) {
        case 'delete':
        case 'backspace':
          s.deleteSelection();
          break;
        case 'tab':
          s.setViewMode(s.viewMode === 'director' ? 'camera' : 'director');
          break;
        case 'n':
          s.newShot();
          break;
        case 'arrowleft':
          s.selectShot(s.shotIndex - 1);
          break;
        case 'arrowright':
          s.selectShot(s.shotIndex + 1);
          break;
        case 'f':
          viewportApi.focusSelection();
          break;
        case 'home':
          viewportApi.resetView();
          break;
        case 'escape':
          s.clearSelection();
          break;
        case ' ':
          break;
        default:
          return;
      }
      e.preventDefault();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      heldKeys.delete(key);
      if (isTyping(e.target)) return;
      const s = useStore.getState();
      if (key === ' ') {
        e.preventDefault();
        if (spaceUsedForPan) return;
        if (s.playback) s.stop();
        else s.play(e.shiftKey ? s.shotIndex : undefined);
      } else if (key === 'l' && !e.ctrlKey) {
        s.loopShot();
      }
    };

    const onBlur = () => heldKeys.clear();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('blur', onBlur);
    };
  }, []);
}

function useAutosave() {
  useEffect(() => {
    const restored = readAutosave();
    if (restored) useStore.getState().loadProject(restored);

    let saved = useStore.getState().project;
    const save = () => {
      const { project } = useStore.getState();
      if (project === saved) return;
      writeAutosave(project);
      saved = project;
    };
    const timer = setInterval(save, AUTOSAVE_MS);
    window.addEventListener('pagehide', save);
    window.addEventListener('beforeunload', save);
    return () => {
      clearInterval(timer);
      window.removeEventListener('pagehide', save);
      window.removeEventListener('beforeunload', save);
    };
  }, []);
}
