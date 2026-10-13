import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { createPortal, useFrame, useThree } from '@react-three/fiber';
import { useStore } from '../store/store';
import { aspectValue, verticalFov } from '../model/lens';
import { resolveCamera, resolveFrame } from '../model/scene';
import { ObjectNode } from './ObjectNode';
import { cameraQuaternion } from './CameraGizmo';
import { BACKGROUND, Stage } from './Stage';

const THUMB_HEIGHT = 180;
const DEBOUNCE_MS = 450;

/** Linear 0..255 -> sRGB 0..255; render targets hold linear colour. */
const TO_SRGB = new Uint8ClampedArray(256).map((_, i) => {
  const c = i / 255;
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(s * 255);
});

/**
 * Renders a small still of each shot (from its camera, at its start) into an
 * offscreen target, one shot per frame, shortly after the project settles.
 */
export function ThumbnailRenderer() {
  const gl = useThree((s) => s.gl);
  const revision = useStore((s) => s.revision);
  const scene = useMemo(() => new THREE.Scene(), []);
  const camera = useMemo(() => new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 500), []);
  const [job, setJob] = useState<string | null>(null);
  const queue = useRef<string[]>([]);
  const committed = useRef<string | null>(null);
  const busy = useRef(false);
  busy.current = job !== null;

  useEffect(() => {
    const timer = setTimeout(() => {
      queue.current = useStore.getState().project.shots.map((s) => s.id);
      // Start the queue unless a still is being rendered; that job picks up the new queue.
      if (!busy.current) setJob(queue.current.shift() ?? null);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [revision]);

  const target = useMemo(() => new THREE.WebGLRenderTarget(1, 1, { samples: 4 }), []);
  useEffect(() => () => target.dispose(), [target]);

  useFrame(() => {
    if (!job || committed.current !== job) return;
    const { project, setThumbnail } = useStore.getState();
    const index = project.shots.findIndex((s) => s.id === job);
    if (index >= 0) {
      const aspect = aspectValue(project.aspectRatio);
      const h = THUMB_HEIGHT;
      const w = Math.round(h * aspect);
      target.setSize(w, h);
      const cam = resolveCamera(project, index, 0);
      camera.position.set(...cam.position);
      camera.quaternion.copy(cameraQuaternion(cam));
      camera.fov = verticalFov(cam.focalLength, aspect);
      camera.aspect = aspect;
      camera.updateProjectionMatrix();

      const prev = gl.getRenderTarget();
      gl.setRenderTarget(target);
      gl.clear();
      gl.render(scene, camera);
      const pixels = new Uint8Array(w * h * 4);
      gl.readRenderTargetPixels(target, 0, 0, w, h, pixels);
      gl.setRenderTarget(prev);
      setThumbnail(job, toDataUrl(pixels, w, h));
    }
    committed.current = null;
    setJob(queue.current.shift() ?? null);
  });

  return createPortal(
    <>
      <color attach="background" args={[BACKGROUND]} />
      <Stage shadows={false} />
      {job && <ShotStill shotId={job} onCommit={() => {
            committed.current = job;
          }} />}
    </>,
    scene,
  );
}

function ShotStill({ shotId, onCommit }: { shotId: string; onCommit: () => void }) {
  const project = useStore((s) => s.project);
  const index = project.shots.findIndex((s) => s.id === shotId);
  const states = useMemo(() => (index >= 0 ? resolveFrame(project, index, 0) : {}), [project, index]);
  useEffect(() => {
    onCommit();
  });
  return (
    <>
      {project.objects.map((obj) =>
        states[obj.id] ? <ObjectNode key={obj.id} obj={obj} state={states[obj.id]} /> : null,
      )}
    </>
  );
}

function toDataUrl(pixels: Uint8Array, w: number, h: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  // Flip vertically and convert to sRGB.
  for (let y = 0; y < h; y++) {
    const src = (h - 1 - y) * w * 4;
    const dst = y * w * 4;
    for (let x = 0; x < w * 4; x += 4) {
      img.data[dst + x] = TO_SRGB[pixels[src + x]];
      img.data[dst + x + 1] = TO_SRGB[pixels[src + x + 1]];
      img.data[dst + x + 2] = TO_SRGB[pixels[src + x + 2]];
      img.data[dst + x + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.85);
}
