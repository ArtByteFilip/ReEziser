import { useEffect } from 'react';
import { useStore } from '../store/store';
import { aspectValue } from '../model/lens';
import { viewportApi } from './shared';

const THUMB_HEIGHT = 180;
const DEBOUNCE_MS = 450;

/**
 * Keeps a small still of each shot (from its camera, at its start), rendered
 * shortly after the project settles. A newer change cancels the pass in progress.
 */
export function ThumbnailRenderer() {
  const revision = useStore((s) => s.revision);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const project = useStore.getState().project;
      const height = THUMB_HEIGHT;
      const width = Math.round(height * aspectValue(project.aspectRatio));
      for (let i = 0; i < project.shots.length && !cancelled; i++) {
        const canvas = await viewportApi.renderStill({ project, shotIndex: i, t: 0, width, height, annotations: true });
        if (cancelled) break;
        useStore.getState().setThumbnail(project.shots[i].id, canvas.toDataURL('image/jpeg', 0.85));
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [revision]);

  return null;
}
