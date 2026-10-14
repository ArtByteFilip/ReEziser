import { useEffect, useState } from 'react';
import { useSettings, type ThemeChoice } from '../store/settings';

export type Theme = 'dark' | 'light';

/** Colours of the 3D stage and its helpers, per theme. The UI itself is themed in CSS. */
export interface SceneColors {
  background: string;
  floor: string;
  cell: string;
  section: string;
  skyLight: string;
  groundLight: string;
  gizmo: string;
  gizmoIdle: string;
  lens: string;
  cameraPath: string;
  axis: string;
}

export const SCENE_COLORS: Record<Theme, SceneColors> = {
  dark: {
    background: '#1b1d21',
    floor: '#26292e',
    cell: '#3a3e45',
    section: '#4a4f58',
    skyLight: '#ffffff',
    groundLight: '#3a3b40',
    gizmo: '#d8dbe0',
    gizmoIdle: '#8b9099',
    lens: '#3a3d44',
    cameraPath: '#d8dbe0',
    axis: '#e5675f',
  },
  light: {
    background: '#dedcd7',
    floor: '#ecebe7',
    cell: '#cfccc5',
    section: '#b9b5ad',
    skyLight: '#ffffff',
    groundLight: '#b8b4ac',
    gizmo: '#4a4f57',
    gizmoIdle: '#9a9ea6',
    lens: '#2a2c31',
    cameraPath: '#5d636c',
    axis: '#d4453c',
  },
};

function systemTheme(): Theme {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function resolveTheme(choice: ThemeChoice): Theme {
  return choice === 'system' ? systemTheme() : choice;
}

/** The theme in effect, following Windows' light/dark setting when the choice is "system". */
export function useTheme(): Theme {
  const choice = useSettings((s) => s.theme);
  const [system, setSystem] = useState<Theme>(systemTheme);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: light)');
    if (!mq) return;
    const on = () => setSystem(mq.matches ? 'light' : 'dark');
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return choice === 'system' ? system : choice;
}

export function useSceneColors(): SceneColors {
  return SCENE_COLORS[useTheme()];
}

/** Puts the theme on <html> so the CSS tokens switch. */
export function useApplyTheme(): void {
  const theme = useTheme();
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
}
