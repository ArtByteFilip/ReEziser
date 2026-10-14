import { useEffect } from 'react';
import { Viewport } from './viewport/Viewport';
import { useStore } from './store/store';
import { heldKeys, viewportApi } from './viewport/shared';
import { readAutosave, rememberPath, writeAutosave } from './io/files';
import { desktop } from './io/desktop';
import { parseProject } from './model/projectFile';
import { TopBar } from './ui/TopBar';
import { AddPalette } from './ui/AddPalette';
import { ContextPanel } from './ui/ContextPanel';
import { ShotStrip } from './ui/ShotStrip';
import { CameraOverlay } from './ui/CameraOverlay';
import { SceneLabels } from './ui/SceneLabels';
import { HintToast, MarqueeLayer, PlaybackOverlay, TakeOverlay } from './ui/Overlays';
import { RadialMenu } from './ui/RadialMenu';
import { Timeline } from './ui/Timeline';
import { Onboarding } from './ui/Onboarding';
import { useSoundtrack } from './audio/useSoundtrack';
import { useApplyTheme } from './ui/theme';
import { useTouchGestures } from './viewport/touch';
import { useTransient } from './viewport/shared';
import { openProjectFlow, saveProjectFlow } from './ui/fileActions';

const AUTOSAVE_MS = 30_000;

export function App() {
  const playing = useStore((s) => !!s.playback);
  const taking = useStore((s) => !!s.take);
  const cameraView = useStore((s) => s.viewMode === 'camera');
  const timelineOpen = useTransient((s) => s.timelineOpen);
  useShortcuts();
  useAutosave();
  useWindowTitle();
  useSoundtrack();
  useApplyTheme();
  useTouchGestures();

  return (
    <div className={`app${playing ? ' playing' : ''}${cameraView ? ' camera-view' : ''}${timelineOpen && !playing ? ' timeline-open' : ''}`}>
      <MarqueeLayer>
        <Viewport />
      </MarqueeLayer>
      <SceneLabels />
      <CameraOverlay />
      {!playing && !taking && (
        <>
          <TopBar />
          <AddPalette />
          <ContextPanel />
          <ShotStrip />
          {timelineOpen && <Timeline />}
          <RadialMenu />
        </>
      )}
      <Onboarding />
      <PlaybackOverlay />
      <TakeOverlay />
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
        else if (key === 'e') useTransient.getState().setExportOpen(true);
        else if (key === 'd') s.duplicateSelection();
        else if (key === 'g' && e.shiftKey) s.ungroupSelection();
        else if (key === 'g') s.groupSelection();
        else return;
        e.preventDefault();
        return;
      }

      if (s.take) {
        if (key === 'escape') s.cancelTake();
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
          if (s.selectedCameraId && s.viewMode === 'director' && s.project.cameras.length > 1) {
            s.deleteCamera(s.selectedCameraId);
          } else s.deleteSelection();
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
          if (useTransient.getState().tool) useTransient.getState().setTool(null);
          else s.clearSelection();
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
      if (s.take) return;
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
    let disposed = false;
    let saved = useStore.getState().project;
    const save = async () => {
      const { project } = useStore.getState();
      if (project === saved) return;
      saved = project;
      await writeAutosave(project);
    };

    // A project opened by double-click wins over the autosave.
    (async () => {
      const launched = await desktop?.launchFile().catch(() => null);
      let project = null;
      if (launched) {
        try {
          project = parseProject(launched.text);
          rememberPath(launched.path);
        } catch (e) {
          useStore.getState().notify(e instanceof Error ? e.message : 'Could not open that file.');
        }
      }
      project ??= await readAutosave();
      if (project && !disposed) {
        useStore.getState().loadProject(project);
        saved = project;
      }
    })();

    const timer = setInterval(save, AUTOSAVE_MS);
    const onHide = () => void save();
    window.addEventListener('pagehide', onHide);
    window.addEventListener('beforeunload', onHide);
    const unlisten = desktop?.onClose(save);
    return () => {
      disposed = true;
      clearInterval(timer);
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('beforeunload', onHide);
      unlisten?.then((f) => f());
    };
  }, []);
}

/** In the desktop app, the window title follows the scene name. */
function useWindowTitle() {
  const name = useStore((s) => s.project.name);
  useEffect(() => {
    document.title = `${name} — ReEziser`;
    desktop?.setTitle(`${name} — ReEziser`).catch(() => {});
  }, [name]);
}
