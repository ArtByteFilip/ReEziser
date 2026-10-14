import { useMemo } from 'react';
import * as THREE from 'three';
import { Line } from '@react-three/drei';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import type { CameraState } from '../model/types';
import { verticalFov } from '../model/lens';
import { useStore } from '../store/store';
import { ACCENT, armRadial, useTransient, viewportApi } from './shared';
import { AxisLock } from '../model/axisLock';

const FRUSTUM_DEPTH = 1.4;

interface Props {
  state: CameraState;
  aspect: number;
  /** Set for clickable cameras; ghosts have none. */
  cameraId?: string;
  /** Films the current shot. Only this camera can be dragged. */
  active?: boolean;
  selected?: boolean;
  ghost?: boolean;
}

/** Orientation of a camera state as a quaternion (looks at target, then rolls). */
export function cameraQuaternion(state: CameraState): THREE.Quaternion {
  const m = new THREE.Matrix4().lookAt(
    new THREE.Vector3(...state.position),
    new THREE.Vector3(...state.target),
    new THREE.Vector3(0, 1, 0),
  );
  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  return q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), state.roll));
}

/**
 * A camera as seen in Director view: a small body and its view pyramid.
 * Cameras not used by the current shot are drawn dimmed.
 */
export function CameraGizmo({ state, aspect, cameraId, active, selected, ghost }: Props) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const quaternion = useMemo(() => cameraQuaternion(state), [state]);
  const frustum = useMemo(() => {
    const fov = (verticalFov(state.focalLength, aspect) * Math.PI) / 180;
    const h = Math.tan(fov / 2) * FRUSTUM_DEPTH;
    const w = h * aspect;
    const z = -FRUSTUM_DEPTH;
    const c: [number, number, number][] = [
      [-w, -h, z],
      [w, -h, z],
      [w, h, z],
      [-w, h, z],
    ];
    const o: [number, number, number] = [0, 0, 0];
    return [o, c[0], c[1], o, c[2], c[3], o, c[3], c[0], c[1], c[2], [0, h * 1.35, z], c[3]] as [
      number,
      number,
      number,
    ][];
  }, [state.focalLength, aspect]);

  const dimmed = ghost || !active;
  const color = selected ? ACCENT : dimmed ? '#8b9099' : '#d8dbe0';
  const opacity = ghost ? 0.3 : 1;

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    viewportApi.pointerHitObject = true;
    if (!cameraId) return;
    const store = useStore.getState();
    if (store.playback) return;
    if (e.button === 2) {
      armRadial(e.nativeEvent, { kind: 'camera', id: cameraId });
      return;
    }
    if (e.button !== 0) return;
    e.stopPropagation();
    store.selectCamera(cameraId);
    if (!active) return;
    // Drag the camera across the floor; it keeps looking the same way.
    const start = { ...state };
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -state.position[1]);
    const rect = gl.domElement.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    const hit = (cx: number, cy: number) => {
      ray.setFromCamera(
        new THREE.Vector2(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1),
        camera,
      );
      return ray.ray.intersectPlane(plane, new THREE.Vector3());
    };
    const grab = hit(e.clientX, e.clientY);
    if (!grab) return;
    let started = false;
    // Ctrl keeps the camera on the floor axis it started moving along.
    const lock = new AxisLock(0.08);
    const move = (ev: PointerEvent) => {
      const p = hit(ev.clientX, ev.clientY);
      if (!p) return;
      if (!started) {
        if (Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 3) return;
        started = true;
        useStore.getState().beginGesture();
      }
      let [dx, dz] = lock.apply([p.x - grab.x, p.z - grab.z], ev.ctrlKey);
      const s0 = start.position;
      useTransient
        .getState()
        .setGuides(
          lock.axis === 0
            ? [[s0[0] - 30, s0[2], s0[0] + 30, s0[2]]]
            : lock.axis === 1
              ? [[s0[0], s0[2] - 30, s0[0], s0[2] + 30]]
              : [],
        );
      if (!ev.shiftKey) {
        if (lock.axis !== 1) dx = Math.round((start.position[0] + dx) * 4) / 4 - start.position[0];
        if (lock.axis !== 0) dz = Math.round((start.position[2] + dz) * 4) / 4 - start.position[2];
      }
      useStore.getState().setCamera({
        ...start,
        position: [start.position[0] + dx, start.position[1], start.position[2] + dz],
        target: [start.target[0] + dx, start.target[1], start.target[2] + dz],
      });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (started) useStore.getState().endGesture();
      useTransient.getState().setGuides([]);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <group position={state.position} quaternion={quaternion}>
      <group onPointerDown={onPointerDown}>
        <mesh position={[0, 0, 0.12]}>
          <boxGeometry args={[0.22, 0.2, 0.3]} />
          <meshLambertMaterial color={color} transparent={ghost} opacity={opacity} />
        </mesh>
        <mesh position={[0, 0, -0.06]} rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[0.07, 0.08, 0.1, 16]} />
          <meshLambertMaterial color="#3a3d44" transparent={ghost} opacity={opacity} />
        </mesh>
        {/* Invisible, larger hit area so the camera is easy to grab */}
        <mesh position={[0, 0, -0.4]} visible={false}>
          <boxGeometry args={[0.6, 0.5, 1]} />
        </mesh>
      </group>
      <Line
        points={frustum}
        color={color}
        lineWidth={selected ? 2 : 1.2}
        transparent
        opacity={ghost ? 0.35 : active ? 0.9 : 0.45}
      />
    </group>
  );
}
