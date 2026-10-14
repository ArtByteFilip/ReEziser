import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { CameraState, Vec3 } from '../model/types';
import { verticalFov, aspectValue } from '../model/lens';
import { cameraStateAt, objectStateAt } from '../model/scene';
import { floorCentre, turnAround } from '../model/groups';
import { walkCamera } from '../model/cameras';
import { AxisLock } from '../model/axisLock';
import { useStore } from '../store/store';
import { cameraFrameRect } from '../ui/layout';
import { heldKeys, useTransient } from './shared';

const v = (a: Vec3) => new THREE.Vector3(...a);
const arr = (p: THREE.Vector3): Vec3 => [p.x, p.y, p.z];

/** Camera basis for a state: forward, right and up unit vectors. */
function basis(state: CameraState) {
  const forward = v(state.target).sub(v(state.position)).normalize();
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();
  return { forward, right, up };
}

/** Walking speed in metres per second; Shift runs. */
const WALK_SPEED = 2;
const RUN_SPEED = 6;

/**
 * In Camera view, navigating moves the shot camera itself, as if handheld:
 * right drag pans/tilts in place, middle drag (or Space + left) trucks and
 * pedestals, the wheel dollies forward and back, and W A S D walk it like a
 * game camera (Q/E down/up, Shift faster). Ctrl + wheel over the viewport
 * rotates the selected objects instead (in both views).
 */
export function CameraViewControls() {
  const gl = useThree((s) => s.gl);
  const viewMode = useStore((s) => s.viewMode);
  const playing = useStore((s) => !!s.playback);
  const walking = useRef(false);

  // W A S D walk the camera while held. With objects selected the keys keep
  // their object meaning (S + drag scales), so walking needs an empty selection.
  useFrame((_, dt) => {
    const s = useStore.getState();
    const key = (k: string) => (heldKeys.has(k) ? 1 : 0);
    const input = { forward: key('w') - key('s'), right: key('d') - key('a'), up: key('e') - key('q') };
    const active =
      viewMode === 'camera' &&
      !playing &&
      !s.selection.length &&
      !useTransient.getState().dragging &&
      (input.forward || input.right || input.up);
    if (!active) {
      if (walking.current) {
        walking.current = false;
        s.endGesture();
      }
      return;
    }
    if (!walking.current) {
      walking.current = true;
      s.beginGesture();
    }
    const speed = heldKeys.has('shift') ? RUN_SPEED : WALK_SPEED;
    const current = cameraStateAt(s.project, s.shotIndex, s.phase);
    s.setCamera(walkCamera(current, input, speed * Math.min(dt, 0.1)));
  });

  useEffect(() => {
    const el = gl.domElement;
    const active = () => viewMode === 'camera' && !playing;

    const onPointerDown = (e: PointerEvent) => {
      if (!active()) return;
      const pan = e.button === 1 || (e.button === 0 && heldKeys.has(' '));
      const look = e.button === 2;
      if (!pan && !look) return;
      e.preventDefault();
      const s = useStore.getState();
      const start = cameraStateAt(s.project, s.shotIndex, s.phase);
      const aspect = aspectValue(s.project.aspectRatio);
      const rect = cameraFrameRect(aspect, el.clientWidth, el.clientHeight, false);
      const fov = (verticalFov(start.focalLength, aspect) * Math.PI) / 180;
      const radPerPx = fov / rect.height;
      const dist = v(start.target).distanceTo(v(start.position));
      const unitsPerPx = (2 * dist * Math.tan(fov / 2)) / rect.height;
      const { forward, right, up } = basis(start);
      const x0 = e.clientX;
      const y0 = e.clientY;
      let started = false;
      // Ctrl keeps a pan/tilt (or truck/pedestal) on the direction it started in.
      const lock = new AxisLock(4);

      const move = (ev: PointerEvent) => {
        const [dx, dy] = lock.apply([ev.clientX - x0, ev.clientY - y0], ev.ctrlKey);
        if (!started) {
          if (Math.hypot(dx, dy) < 2) return;
          started = true;
          useStore.getState().beginGesture();
        }
        if (look) {
          // Rotate the aim around the camera position (pan = yaw, tilt = pitch).
          const yaw = -dx * radPerPx;
          const pitch = -dy * radPerPx;
          const dir = forward.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
          const r = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
          dir.applyAxisAngle(r, pitch);
          // Keep away from straight up/down to avoid flipping.
          if (Math.abs(dir.y) > 0.995) return;
          const target = v(start.position).add(dir.multiplyScalar(dist));
          useStore.getState().setCamera({ ...start, target: arr(target) });
        } else {
          const offset = right
            .clone()
            .multiplyScalar(-dx * unitsPerPx)
            .add(up.clone().multiplyScalar(dy * unitsPerPx));
          const position = v(start.position).add(offset);
          if (position.y < 0.05) offset.y += 0.05 - position.y;
          useStore.getState().setCamera({
            ...start,
            position: arr(v(start.position).add(offset)),
            target: arr(v(start.target).add(offset)),
          });
        }
      };
      const up_ = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up_);
        if (started) useStore.getState().endGesture();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up_);
    };

    // Wheel steps are grouped into one undo step until the wheel rests.
    let wheelTimer: ReturnType<typeof setTimeout> | null = null;
    const endWheel = () => {
      wheelTimer = null;
      useStore.getState().endGesture();
    };
    const holdWheelGesture = () => {
      if (wheelTimer) clearTimeout(wheelTimer);
      else useStore.getState().beginGesture();
      wheelTimer = setTimeout(endWheel, 350);
    };

    const onWheel = (e: WheelEvent) => {
      const s = useStore.getState();
      if (s.playback) return;
      if (e.ctrlKey && s.selection.length) {
        e.preventDefault();
        e.stopPropagation();
        holdWheelGesture();
        const step = (Math.sign(e.deltaY) * Math.PI) / 12;
        const current: Record<string, ReturnType<typeof objectStateAt>> = {};
        for (const id of s.selection) {
          const obj = s.project.objects.find((o) => o.id === id);
          if (!obj || obj.locked) continue;
          current[id] = objectStateAt(s.project, s.shotIndex, s.phase, obj);
        }
        const centre = floorCentre(Object.values(current));
        const next = Object.fromEntries(Object.entries(current).map(([id, st]) => [id, turnAround(st, centre, step)]));
        s.setObjectStates(next);
        return;
      }
      if (!active()) return;
      e.preventDefault();
      e.stopPropagation();
      holdWheelGesture();
      const cur = cameraStateAt(s.project, s.shotIndex, s.phase);
      const { forward } = basis(cur);
      const dist = v(cur.target).distanceTo(v(cur.position));
      const amount = -Math.sign(e.deltaY) * Math.min(0.5, Math.max(0.1, dist * 0.06));
      const offset = forward.multiplyScalar(amount);
      s.setCamera({
        ...cur,
        position: arr(v(cur.position).add(offset)),
        target: arr(v(cur.target).add(offset)),
      });
    };

    el.addEventListener('pointerdown', onPointerDown);
    // Capture on window so Ctrl + wheel never reaches orbit zoom or page zoom.
    window.addEventListener('wheel', onWheelCapture, { capture: true, passive: false });
    function onWheelCapture(e: WheelEvent) {
      if (e.target === el || el.parentElement?.contains(e.target as Node)) onWheel(e);
    }
    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('wheel', onWheelCapture, { capture: true });
      if (wheelTimer) {
        clearTimeout(wheelTimer);
        useStore.getState().endGesture();
      }
    };
  }, [gl, viewMode, playing]);

  return null;
}
