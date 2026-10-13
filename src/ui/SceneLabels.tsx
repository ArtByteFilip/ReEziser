import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useStore, currentFrame } from '../store/store';
import { resolveCamera, resolveFrame } from '../model/scene';
import { kindHeight, viewportApi } from '../viewport/shared';

/**
 * Text floating above objects (their labels) and the camera name in Director
 * view. Plain DOM positioned every frame from the 3D scene.
 */
export function SceneLabels() {
  const objects = useStore((s) => s.project.objects);
  const cameraName = useStore((s) => {
    const shot = s.project.shots[s.shotIndex];
    return s.project.cameras.find((c) => c.id === shot.cameraId)?.name ?? '';
  });
  const viewMode = useStore((s) => s.viewMode);
  const playing = useStore((s) => !!s.playback);
  const cameraSelected = useStore((s) => s.cameraSelected);
  const refs = useRef(new Map<string, HTMLDivElement>());

  const labelled = objects.filter((o) => o.label);
  const showCamera = viewMode === 'director' && !playing;

  useEffect(() => {
    let raf = 0;
    const p = new THREE.Vector3();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const cam = viewportApi.camera;
      const canvas = viewportApi.canvas;
      if (!cam || !canvas) return;
      const s = useStore.getState();
      const { shotIndex, t } = currentFrame(s);
      const states = resolveFrame(s.project, shotIndex, t);
      const rect = canvas.getBoundingClientRect();
      const place = (el: HTMLDivElement, visible: boolean) => {
        p.project(cam);
        if (!visible || p.z > 1 || p.z < -1) {
          el.style.opacity = '0';
          return;
        }
        el.style.opacity = '1';
        const x = rect.left + ((p.x + 1) / 2) * rect.width;
        const y = rect.top + ((1 - p.y) / 2) * rect.height;
        el.style.transform = `translate(-50%, -100%) translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      };
      for (const [id, el] of refs.current) {
        if (id === '__camera') {
          const c = resolveCamera(s.project, shotIndex, t);
          p.set(c.position[0], c.position[1] + 0.22, c.position[2]);
          place(el, true);
          continue;
        }
        const obj = s.project.objects.find((o) => o.id === id);
        const st = states[id];
        if (!obj || !st) continue;
        p.set(st.position[0], st.position[1] + kindHeight(obj) * st.scale[1] + 0.15, st.position[2]);
        place(el, st.visible);
      }
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, []);

  const setRef = (id: string) => (el: HTMLDivElement | null) => {
    if (el) refs.current.set(id, el);
    else refs.current.delete(id);
  };

  return (
    <div className="scene-labels" aria-hidden="true">
      {labelled.map((o) => (
        <div key={o.id} ref={setRef(o.id)} className="obj-label">
          {o.label}
        </div>
      ))}
      {showCamera && (
        <div ref={setRef('__camera')} className={`cam-label${cameraSelected ? ' selected' : ''}`}>
          {cameraName}
        </div>
      )}
    </div>
  );
}
