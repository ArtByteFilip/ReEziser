import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { createPortal, useFrame, useThree } from '@react-three/fiber';
import type { Project, ResolvedObjectState } from '../model/types';
import { aspectValue, verticalFov } from '../model/lens';
import { resolveCamera, resolveFrame } from '../model/scene';
import { kindHeight } from '../model/dimensions';
import { ObjectNode } from './ObjectNode';
import { cameraQuaternion } from './CameraGizmo';
import { Stage } from './Stage';
import { viewportApi } from './shared';

export interface StillOptions {
  project: Project;
  shotIndex: number;
  /** Time within the shot, 0..1. */
  t: number;
  width: number;
  height: number;
  /** Floor arrows and floating label text. */
  annotations: boolean;
}

interface Job extends StillOptions {
  resolve: (canvas: HTMLCanvasElement) => void;
  /** Instead of a picture, hand back copies of the objects as built (for 3D export). */
  capture?: (objects: THREE.Object3D[]) => void;
}

/** Linear 0..255 -> sRGB 0..255; render targets hold linear colour. */
const TO_SRGB = new Uint8ClampedArray(256).map((_, i) => {
  const c = i / 255;
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(s * 255);
});

/**
 * Renders stills of any shot and time through that shot's camera into an
 * offscreen target, one per frame. Used for shot thumbnails and for exports.
 * Exposed as `viewportApi.renderStill`; the returned canvas is reused, so
 * read it before asking for the next still.
 */
export function StillRenderer() {
  const gl = useThree((s) => s.gl);
  const scene = useMemo(() => new THREE.Scene(), []);
  const camera = useMemo(() => new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 500), []);
  const target = useMemo(() => new THREE.WebGLRenderTarget(1, 1, { samples: 4 }), []);
  const output = useMemo(() => document.createElement('canvas'), []);
  const pixels = useRef(new Uint8Array(4));
  const queue = useRef<Job[]>([]);
  const [job, setJob] = useState<Job | null>(null);
  const committed = useRef<Job | null>(null);
  const busy = useRef(false);

  useEffect(() => () => target.dispose(), [target]);

  useEffect(() => {
    const enqueue = (job: Job) => {
      queue.current.push(job);
      if (!busy.current) {
        busy.current = true;
        setJob(queue.current.shift()!);
      }
    };
    viewportApi.renderStill = (opts) => new Promise((resolve) => enqueue({ ...opts, resolve }));
    viewportApi.captureObjects = (opts) =>
      new Promise((resolve) => enqueue({ ...opts, width: 1, height: 1, resolve: () => {}, capture: resolve }));
  }, []);

  useFrame(() => {
    if (!job || committed.current !== job) return;
    if (job.capture) {
      // Each object is a group tagged with its id; copy it with its own materials.
      const objects = scene.children
        .filter((c) => c.userData.objectId)
        .map((c) => {
          const copy = c.clone(true);
          copy.traverse((n) => {
            const mesh = n as THREE.Mesh;
            if (mesh.isMesh && mesh.material) mesh.material = (mesh.material as THREE.Material).clone();
          });
          return copy;
        });
      job.capture(objects);
      committed.current = null;
      const next = queue.current.shift() ?? null;
      busy.current = next !== null;
      setJob(next);
      return;
    }
    const { project, shotIndex, t, width: w, height: h } = job;
    const aspect = aspectValue(project.aspectRatio);
    target.setSize(w, h);
    const cam = resolveCamera(project, shotIndex, t);
    camera.position.set(...cam.position);
    camera.quaternion.copy(cameraQuaternion(cam));
    camera.fov = verticalFov(cam.focalLength, aspect);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    const prev = gl.getRenderTarget();
    gl.setRenderTarget(target);
    gl.clear();
    gl.render(scene, camera);
    if (pixels.current.length !== w * h * 4) pixels.current = new Uint8Array(w * h * 4);
    gl.readRenderTargetPixels(target, 0, 0, w, h, pixels.current);
    gl.setRenderTarget(prev);

    toCanvas(output, pixels.current, w, h);
    if (job.annotations) drawLabels(output, project, resolveFrame(project, shotIndex, t), camera);
    job.resolve(output);

    committed.current = null;
    const next = queue.current.shift() ?? null;
    busy.current = next !== null;
    setJob(next);
  });

  return createPortal(
    <>
      <Stage shadows={false} />
      {job && (
        <StillScene
          job={job}
          onCommit={() => {
            committed.current = job;
          }}
        />
      )}
    </>,
    scene,
  );
}

function StillScene({ job, onCommit }: { job: Job; onCommit: () => void }) {
  const states = useMemo(() => resolveFrame(job.project, job.shotIndex, job.t), [job]);
  useEffect(() => {
    onCommit();
  });
  return (
    <>
      {job.project.objects.map((obj) =>
        states[obj.id] && (job.annotations || obj.kind !== 'arrow') ? (
          <ObjectNode key={obj.id} obj={obj} state={states[obj.id]} />
        ) : null,
      )}
    </>
  );
}

function toCanvas(canvas: HTMLCanvasElement, pixels: Uint8Array, w: number, h: number): void {
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
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
}

/** Object labels and free labels, drawn like the on-screen ones. */
function drawLabels(
  canvas: HTMLCanvasElement,
  project: Project,
  states: Record<string, ResolvedObjectState>,
  camera: THREE.Camera,
): void {
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;
  const size = Math.max(10, Math.round(h / 38));
  const p = new THREE.Vector3();
  for (const obj of project.objects) {
    const text = obj.kind === 'label' ? obj.text : obj.label;
    const st = states[obj.id];
    if (!text || !st?.visible) continue;
    const above = obj.kind === 'label' ? 0.02 : 0.15;
    p.set(st.position[0], st.position[1] + kindHeight(obj) * st.scale[1] + above, st.position[2]).project(camera);
    if (p.z > 1 || p.z < -1) continue;
    const x = ((p.x + 1) / 2) * w;
    const y = ((1 - p.y) / 2) * h;
    const free = obj.kind === 'label';
    ctx.font = `${free ? 600 : 400} ${free ? size * 1.15 : size}px "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif`;
    const tw = ctx.measureText(text).width;
    const padX = size * 0.6;
    const boxH = size * (free ? 1.9 : 1.6);
    const bx = x - tw / 2 - padX;
    const by = y - boxH;
    ctx.fillStyle = 'rgba(20, 22, 26, 0.8)';
    ctx.beginPath();
    ctx.roundRect(bx, by, tw + padX * 2, boxH, free ? size * 0.5 : boxH / 2);
    ctx.fill();
    if (free) {
      ctx.strokeStyle = obj.color;
      ctx.lineWidth = Math.max(1.5, size / 8);
      ctx.stroke();
    }
    ctx.fillStyle = '#eceef1';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(text, x, by + boxH / 2);
  }
}
