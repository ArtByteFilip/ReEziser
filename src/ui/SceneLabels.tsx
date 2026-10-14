import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useStore, currentFrame } from '../store/store';
import { resolveFrame } from '../model/scene';
import { cameraStateFor } from '../model/cameras';
import { kindHeight, viewportApi } from '../viewport/shared';

const CAMERA_PREFIX = 'cam:';

/**
 * Text floating in the scene: object labels, free labels, and camera names in
 * Director view. Plain DOM positioned every frame from the 3D scene.
 */
export function SceneLabels() {
  const objects = useStore((s) => s.project.objects);
  const cameras = useStore((s) => s.project.cameras);
  const activeCamera = useStore((s) => s.project.shots[s.shotIndex].cameraId);
  const viewMode = useStore((s) => s.viewMode);
  const playing = useStore((s) => !!s.playback);
  const selectedCameraId = useStore((s) => s.selectedCameraId);
  const refs = useRef(new Map<string, HTMLDivElement>());

  const labelled = objects.filter((o) => (o.kind === 'label' ? o.text : o.label));
  const showCameras = viewMode === 'director' && !playing;

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
        if (id.startsWith(CAMERA_PREFIX)) {
          const camId = id.slice(CAMERA_PREFIX.length);
          if (!s.project.cameras.some((c) => c.id === camId)) continue;
          const c = cameraStateFor(s.project, shotIndex, t, camId);
          p.set(c.position[0], c.position[1] + 0.22, c.position[2]);
          place(el, true);
          continue;
        }
        const obj = s.project.objects.find((o) => o.id === id);
        const st = states[id];
        if (!obj || !st) continue;
        const above = obj.kind === 'label' ? 0.02 : 0.15;
        p.set(st.position[0], st.position[1] + kindHeight(obj) * st.scale[1] + above, st.position[2]);
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
        <div
          key={o.id}
          ref={setRef(o.id)}
          className={o.kind === 'label' ? 'free-label' : 'obj-label'}
          style={o.kind === 'label' ? { borderColor: o.color } : undefined}
        >
          {o.kind === 'label' ? o.text : o.label}
        </div>
      ))}
      {showCameras &&
        cameras.map((c) => (
          <div
            key={c.id}
            ref={setRef(CAMERA_PREFIX + c.id)}
            className={`cam-label${selectedCameraId === c.id ? ' selected' : ''}${c.id === activeCamera ? '' : ' idle'}`}
          >
            {c.name}
          </div>
        ))}
    </div>
  );
}
