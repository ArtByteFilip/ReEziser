import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Line, OrbitControls } from '@react-three/drei';
import { BACKGROUND, Stage } from './Stage';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useStore, currentFrame } from '../store/store';
import { aspectValue, verticalFov } from '../model/lens';
import { evaluateObjectTrack } from '../model/interpolate';
import {
  cameraHasMotion,
  hasMotion,
  objectStateAt,
  resolveCamera,
  resolveFrame,
} from '../model/scene';
import { evaluateCameraTrack } from '../model/interpolate';
import type { Vec3 } from '../model/types';
import { ObjectNode } from './ObjectNode';
import { CameraGizmo, cameraQuaternion } from './CameraGizmo';
import { useObjectDrag } from './useObjectDrag';
import { ACCENT, heldKeys, kindHeight, kindRadius, useTransient, viewportApi } from './shared';
import { cameraFrameRect } from '../ui/layout';
import { CameraViewControls } from './CameraViewControls';
import { ThumbnailRenderer } from './ThumbnailRenderer';

export function Viewport() {
  return (
    <Canvas
      flat
      dpr={[1, 2]}
      gl={{ antialias: true, preserveDrawingBuffer: false }}
      onCreated={({ gl }) => {
        viewportApi.canvas = gl.domElement;
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <color attach="background" args={[BACKGROUND]} />
      <Stage />
      <SceneContent />
      <Cameras />
      <PlaybackClock />
      <ThumbnailRenderer />
    </Canvas>
  );
}

function SceneContent() {
  const project = useStore((s) => s.project);
  const shotIndex = useStore((s) => currentFrame(s).shotIndex);
  const t = useStore((s) => currentFrame(s).t);
  const phase = useStore((s) => s.phase);
  const playing = useStore((s) => !!s.playback);
  const viewMode = useStore((s) => s.viewMode);
  const selection = useStore((s) => s.selection);
  const cameraSelected = useStore((s) => s.cameraSelected);
  const hoverId = useTransient((s) => s.hoverId);
  const setHover = useTransient((s) => s.setHover);
  const guides = useTransient((s) => s.guides);
  const { onPointerDown, onDoubleClick } = useObjectDrag();

  const states = useMemo(() => resolveFrame(project, shotIndex, t), [project, shotIndex, t]);
  const shot = project.shots[shotIndex];
  const selected = useMemo(() => new Set(selection), [selection]);
  const aspect = aspectValue(project.aspectRatio);

  // Ghosts of the other end of the shot, and the motion path between them.
  const motion = useMemo(() => {
    if (playing) return [];
    const otherPhase = phase === 'start' ? 'end' : 'start';
    return project.objects
      .filter((o) => hasMotion(shot, o.id))
      .map((o) => {
        const keys = shot.objectTracks[o.id];
        const path: Vec3[] = [];
        for (let i = 0; i <= 32; i++) {
          const p = evaluateObjectTrack(keys, i / 32).position;
          path.push([p[0], p[1] + 0.03, p[2]]);
        }
        return { obj: o, ghost: objectStateAt(project, shotIndex, otherPhase, o), path };
      });
  }, [project, shot, shotIndex, phase, playing]);

  const cameraMotion = useMemo(() => {
    if (playing || !cameraHasMotion(shot)) return null;
    const path: Vec3[] = [];
    for (let i = 0; i <= 32; i++) path.push(evaluateCameraTrack(shot.cameraTrack, i / 32).position);
    return { ghost: resolveCamera(project, shotIndex, phase === 'start' ? 1 : 0), path };
  }, [project, shot, shotIndex, phase, playing]);

  const camState = resolveCamera(project, shotIndex, t);

  return (
    <>
      {project.objects.map((obj) => (
        <ObjectNode
          key={obj.id}
          obj={obj}
          state={states[obj.id]}
          ghost={!playing && !states[obj.id].visible}
          selected={selected.has(obj.id)}
          hovered={hoverId === obj.id && !playing}
          onPointerDown={onPointerDown}
          onDoubleClick={onDoubleClick}
          onHover={setHover}
        />
      ))}
      {motion.map(({ obj, ghost, path }) => (
        <group key={obj.id}>
          <ObjectNode obj={obj} state={ghost} ghost />
          <Line points={path} color={ACCENT} lineWidth={1.5} dashed dashSize={0.12} gapSize={0.08} transparent opacity={0.8} />
        </group>
      ))}
      {!playing &&
        project.objects
          .filter((o) => selected.has(o.id))
          .map((o) => {
            const s = states[o.id];
            const r = kindRadius(o.kind) * Math.max(s.scale[0], s.scale[2]) + 0.12;
            return (
              <mesh key={o.id} position={[s.position[0], 0.004, s.position[2]]} rotation-x={-Math.PI / 2}>
                <ringGeometry args={[r, r + 0.035, 48]} />
                <meshBasicMaterial color={ACCENT} transparent opacity={0.85} />
              </mesh>
            );
          })}
      {guides.map((g, i) => (
        <Line
          key={i}
          points={[
            [g[0], 0.01, g[1]],
            [g[2], 0.01, g[3]],
          ]}
          color={ACCENT}
          lineWidth={1}
          transparent
          opacity={0.7}
        />
      ))}
      {viewMode === 'director' && !playing && (
        <>
          <CameraGizmo state={camState} aspect={aspect} selected={cameraSelected} interactive />
          {cameraMotion && (
            <>
              <CameraGizmo state={cameraMotion.ghost} aspect={aspect} ghost />
              <Line points={cameraMotion.path} color="#d8dbe0" lineWidth={1} dashed dashSize={0.12} gapSize={0.08} />
            </>
          )}
        </>
      )}
    </>
  );
}

/**
 * Owns the two render cameras: a free Director camera with orbit controls,
 * and the shot camera used in Camera view and playback.
 */
function Cameras() {
  const set = useThree((s) => s.set);
  const size = useThree((s) => s.size);
  const viewMode = useStore((s) => s.viewMode);
  const playing = useStore((s) => !!s.playback);
  const controls = useRef<OrbitControlsImpl>(null);

  const director = useMemo(() => {
    const cam = new THREE.PerspectiveCamera(40, 1, 0.05, 500);
    cam.position.set(9, 7, 11);
    cam.lookAt(0, 0.5, 0);
    (cam as unknown as { manual: boolean }).manual = true;
    return cam;
  }, []);
  const shotCam = useMemo(() => {
    const cam = new THREE.PerspectiveCamera(40, 1, 0.05, 500);
    (cam as unknown as { manual: boolean }).manual = true;
    return cam;
  }, []);

  useEffect(() => {
    director.aspect = size.width / size.height;
    director.updateProjectionMatrix();
  }, [director, size]);

  const active = viewMode === 'camera' ? shotCam : director;
  useEffect(() => {
    set({ camera: active });
    viewportApi.camera = active;
  }, [active, set]);

  // Shot camera follows the evaluated camera state and frames the visible rect.
  useFrame(() => {
    if (viewMode !== 'camera') return;
    const s = useStore.getState();
    const { shotIndex, t } = currentFrame(s);
    const state = resolveCamera(s.project, shotIndex, t);
    const aspect = aspectValue(s.project.aspectRatio);
    const rect = cameraFrameRect(aspect, size.width, size.height, !!s.playback);
    shotCam.position.set(...state.position);
    shotCam.quaternion.copy(cameraQuaternion(state));
    shotCam.fov = verticalFov(state.focalLength, aspect);
    shotCam.aspect = aspect;
    shotCam.setViewOffset(rect.width, rect.height, -rect.x, -rect.y, size.width, size.height);
    shotCam.updateProjectionMatrix();
  });

  // Space + left drag pans in Director view.
  useEffect(() => {
    const update = () => {
      const c = controls.current;
      if (!c) return;
      c.mouseButtons = {
        LEFT: heldKeys.has(' ') ? THREE.MOUSE.PAN : (-1 as THREE.MOUSE),
        MIDDLE: THREE.MOUSE.PAN,
        RIGHT: THREE.MOUSE.ROTATE,
      };
    };
    update();
    window.addEventListener('keydown', update);
    window.addEventListener('keyup', update);
    return () => {
      window.removeEventListener('keydown', update);
      window.removeEventListener('keyup', update);
    };
  }, []);

  // Smooth focus / reset of the Director view.
  const tween = useRef<{ from: [THREE.Vector3, THREE.Vector3]; to: [THREE.Vector3, THREE.Vector3]; t: number } | null>(
    null,
  );
  useEffect(() => {
    const goTo = (position: THREE.Vector3, target: THREE.Vector3) => {
      const c = controls.current;
      if (!c) return;
      tween.current = { from: [director.position.clone(), c.target.clone()], to: [position, target], t: 0 };
    };
    viewportApi.focusSelection = () => {
      const s = useStore.getState();
      if (s.viewMode !== 'director' || !controls.current) return;
      const { shotIndex, t } = currentFrame(s);
      const objs = s.project.objects.filter((o) => s.selection.includes(o.id));
      if (!objs.length) return;
      const box = new THREE.Box3();
      for (const o of objs) {
        const st = resolveFrame(s.project, shotIndex, t)[o.id];
        const r = kindRadius(o.kind) * Math.max(st.scale[0], st.scale[2]);
        const h = kindHeight(o) * st.scale[1];
        box.expandByPoint(new THREE.Vector3(st.position[0] - r, st.position[1], st.position[2] - r));
        box.expandByPoint(new THREE.Vector3(st.position[0] + r, st.position[1] + h, st.position[2] + r));
      }
      const center = box.getCenter(new THREE.Vector3());
      const radius = Math.max(0.8, box.getSize(new THREE.Vector3()).length() / 2);
      const dir = director.position.clone().sub(controls.current.target).normalize();
      const distance = radius / Math.sin((director.fov * Math.PI) / 360) * 1.1;
      goTo(center.clone().add(dir.multiplyScalar(distance)), center);
    };
    viewportApi.resetView = () => goTo(new THREE.Vector3(9, 7, 11), new THREE.Vector3(0, 0.5, 0));
  }, [director]);

  useFrame((_, dt) => {
    const tw = tween.current;
    const c = controls.current;
    if (!tw || !c) return;
    tw.t = Math.min(1, tw.t + dt / 0.25);
    const u = 1 - Math.pow(1 - tw.t, 3);
    director.position.lerpVectors(tw.from[0], tw.to[0], u);
    c.target.lerpVectors(tw.from[1], tw.to[1], u);
    c.update();
    if (tw.t >= 1) tween.current = null;
  });

  return (
    <>
      <OrbitControls
        ref={controls}
        camera={director}
        enabled={viewMode === 'director' && !playing}
        target={[0, 0.5, 0]}
        enableDamping
        dampingFactor={0.12}
        maxPolarAngle={Math.PI / 2 - 0.02}
        minDistance={0.5}
        maxDistance={120}
        zoomSpeed={0.8}
      />
      <CameraViewControls />
    </>
  );
}

/** Advances film time while playing. */
function PlaybackClock() {
  const tick = useStore((s) => s.tick);
  useFrame((_, dt) => {
    if (useStore.getState().playback) tick(Math.min(dt, 0.25));
  });
  return null;
}
