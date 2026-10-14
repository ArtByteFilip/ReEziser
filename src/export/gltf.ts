import * as THREE from 'three';
import type { Project, SceneObject } from '../model/types';
import { aspectValue, verticalFov } from '../model/lens';
import { locateTime, resolveCamera, resolveFrame, totalDuration } from '../model/scene';
import { CHILD_SCALE } from '../model/dimensions';
import { cameraStateFor } from '../model/cameras';
import { cameraQuaternion } from '../viewport/CameraGizmo';
import { viewportApi } from '../viewport/shared';
import type { ExportResult } from './video';

/**
 * glTF export (Phase 4) for Blender and other 3D apps: the set as
 * built in ReEziser, every camera, and the whole film as one animation:
 * objects move as they do in the shots, and a "Film camera" follows the
 * camera of each shot, cutting where the shots cut. Saved as one .glb file.
 */

export interface FilmSamples {
  times: number[];
  /** Per object: position (xyz), rotation (xyzw quaternion) and size (xyz) at each time. */
  objects: Record<string, { position: number[]; rotation: number[]; scale: number[] }>;
  camera: { position: number[]; rotation: number[] };
}

/** The size of an object's model in a state: its scale, child size, and zero when hidden. */
function sizeFor(obj: SceneObject, scale: [number, number, number], visible: boolean): [number, number, number] {
  if (!visible) return [0, 0, 0];
  // Arrows keep their length in their geometry; only their width scales.
  if (obj.kind === 'arrow') return [scale[0], 1, 1];
  const s = obj.kind === 'figure' && obj.figureSize === 'child' ? CHILD_SCALE : 1;
  return [scale[0] * s, scale[1] * s, scale[2] * s];
}

/** Seconds before a cut at which the outgoing shot gets its last sample, so cuts are instant. */
const CUT_GAP = 0.001;

/**
 * Samples the film at `fps`, plus a sample just before every cut, so that
 * between frames things glide but at a cut the film camera jumps.
 */
export function sampleFilm(project: Project, fps: number): FilmSamples {
  const duration = totalDuration(project);
  const count = Math.max(2, Math.round(duration * fps) + 1);
  const times = new Set<number>();
  for (let i = 0; i < count; i++) times.add(Math.min(duration, i / fps));
  let cut = 0;
  for (const shot of project.shots.slice(0, -1)) {
    cut += shot.duration;
    times.add(cut - CUT_GAP);
    times.add(cut);
  }
  const out: FilmSamples = { times: [], objects: {}, camera: { position: [], rotation: [] } };
  for (const o of project.objects) out.objects[o.id] = { position: [], rotation: [], scale: [] };
  const euler = new THREE.Euler();
  const q = new THREE.Quaternion();
  for (const time of [...times].sort((a, b) => a - b)) {
    out.times.push(time);
    const { shotIndex, t } = locateTime(project, time);
    const states = resolveFrame(project, shotIndex, t);
    for (const o of project.objects) {
      const s = states[o.id];
      const track = out.objects[o.id];
      track.position.push(...s.position);
      const rotXZ = s.rotationXZ ?? [0, 0];
      q.setFromEuler(euler.set(rotXZ[0], s.rotationY, rotXZ[1], 'YXZ'));
      track.rotation.push(q.x, q.y, q.z, q.w);
      track.scale.push(...sizeFor(o, s.scale, s.visible));
    }
    const cam = resolveCamera(project, shotIndex, t);
    out.camera.position.push(...cam.position);
    const cq = cameraQuaternion(cam);
    out.camera.rotation.push(cq.x, cq.y, cq.z, cq.w);
  }
  return out;
}

/** Readable, unique node names ("Anna", "Chair", "Chair 2"). */
export function uniqueNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((raw) => {
    const name = raw.trim().replace(/[.:/[\]]/g, ' ') || 'Object';
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    return n === 1 ? name : `${name} ${n}`;
  });
}

function standardMaterial(m: THREE.Material): THREE.Material {
  const src = m as THREE.MeshLambertMaterial;
  return new THREE.MeshStandardMaterial({ color: src.color?.clone() ?? new THREE.Color('#9aa3ad'), roughness: 0.85, metalness: 0 });
}

export async function exportGltf(project: Project, opts: { annotations: boolean }): Promise<ExportResult> {
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
  const root = new THREE.Scene();
  root.name = project.name;

  // The set, as it stands at the very start of the film.
  const built = await viewportApi.captureObjects({ project, shotIndex: 0, t: 0, annotations: opts.annotations });
  const byId = new Map(project.objects.map((o) => [o.id, o]));
  const names = uniqueNames(built.map((n) => byId.get(n.userData.objectId)?.name ?? 'Object'));
  const animated: { node: THREE.Object3D; size: THREE.Object3D; id: string }[] = [];
  built.forEach((node, i) => {
    node.name = names[i];
    // The inner group carries the size; name it so the animation can find it.
    const size = node.children[0] ?? node;
    size.name = `${names[i]} size`;
    const hidden: THREE.Object3D[] = [];
    node.traverse((n) => {
      const mesh = n as THREE.Mesh;
      if (mesh.isMesh) mesh.material = standardMaterial(mesh.material as THREE.Material);
      // Joints of people and parts of shapes get names, so the outliner in Blender reads well.
      if (!n.name) n.name = mesh.isMesh ? `${names[i]} part` : `${names[i]} joint`;
      if (!n.visible) hidden.push(n);
    });
    // Hidden helpers (hit areas) stay out of the file.
    for (const n of hidden) n.removeFromParent();
    root.add(node);
    animated.push({ node, size, id: node.userData.objectId });
  });

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#8f9195', roughness: 1 }),
  );
  floor.name = 'Floor';
  root.add(floor);

  // Every camera where it first films, with its lens.
  const aspect = aspectValue(project.aspectRatio);
  for (const def of project.cameras) {
    const first = Math.max(0, project.shots.findIndex((s) => s.cameraId === def.id));
    const state = cameraStateFor(project, first, 0, def.id);
    const cam = new THREE.PerspectiveCamera(verticalFov(state.focalLength, aspect), aspect, 0.05, 500);
    cam.name = def.name;
    cam.position.set(...state.position);
    cam.quaternion.copy(cameraQuaternion(state));
    root.add(cam);
  }

  // The film camera cuts like the film; its lens is the first shot's (glTF can't animate it).
  const first = resolveCamera(project, 0, 0);
  const filmCam = new THREE.PerspectiveCamera(verticalFov(first.focalLength, aspect), aspect, 0.05, 500);
  filmCam.name = 'Film camera';
  root.add(filmCam);

  const samples = sampleFilm(project, project.fps);
  const tracks: THREE.KeyframeTrack[] = [];
  for (const { node, size, id } of animated) {
    const s = samples.objects[id];
    if (!s) continue;
    tracks.push(new THREE.VectorKeyframeTrack(`${node.name}.position`, samples.times, s.position));
    tracks.push(new THREE.QuaternionKeyframeTrack(`${node.name}.quaternion`, samples.times, s.rotation));
    tracks.push(new THREE.VectorKeyframeTrack(`${size.name}.scale`, samples.times, s.scale));
  }
  tracks.push(new THREE.VectorKeyframeTrack('Film camera.position', samples.times, samples.camera.position));
  tracks.push(new THREE.QuaternionKeyframeTrack('Film camera.quaternion', samples.times, samples.camera.rotation));
  const clip = new THREE.AnimationClip('Film', samples.times[samples.times.length - 1], tracks);

  const exporter = new GLTFExporter();
  const glb = (await exporter.parseAsync(root, { binary: true, animations: [clip] })) as ArrayBuffer;
  return { blob: new Blob([glb], { type: 'model/gltf-binary' }), extension: '.glb' };
}
