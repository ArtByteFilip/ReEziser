import { useCallback } from 'react';
import * as THREE from 'three';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import type { ObjectState } from '../model/types';
import { objectStateAt } from '../model/scene';
import { floorCentre, scaleAround, turnAround } from '../model/groups';
import { AxisLock } from '../model/axisLock';
import { useStore } from '../store/store';
import { armRadial, heldKeys, useTransient, viewportApi } from './shared';
import { LONG_PRESS_MS, multiTouch } from './touch';

const GRID = 0.25;
const GUIDE_SNAP = 0.12;
const DRAG_THRESHOLD_PX = 3;
/** How far (metres) a Ctrl-drag goes before its axis is chosen. */
const LOCK_THRESHOLD = 0.08;
/** Half-length of the line drawn along a locked axis. */
const LOCK_GUIDE = 30;

type Mode = 'move' | 'lift' | 'rotate' | 'scale';

const snap = (v: number, step: number) => Math.round(v / step) * step;

/**
 * Gizmo-free object manipulation. Plain drag moves along the floor,
 * Alt+drag lifts, R+drag rotates, S+drag scales. Shift while dragging
 * turns snapping off; Ctrl while dragging keeps the move on the axis it
 * started along; Shift+click toggles selection.
 */
export function useObjectDrag() {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);

  const onPointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>, id: string) => {
      viewportApi.pointerHitObject = true;
      const store = useStore.getState();
      if (store.playback) return;
      if (e.button === 2) {
        // Don't stop propagation: a right drag still orbits (or looks around in Camera view).
        armRadial(e.nativeEvent, { kind: 'object', id });
        return;
      }
      if (e.button !== 0 || heldKeys.has(' ')) return;
      e.stopPropagation();

      const additive = e.shiftKey;
      if (additive) {
        store.select([id], true);
        return;
      }
      const wasSelected = store.selection.includes(id);
      if (!wasSelected) store.select([id]);

      const { project, shotIndex, phase, selection } = useStore.getState();
      const ids = selection.filter((sid) => !project.objects.find((o) => o.id === sid)?.locked);
      if (!ids.length) {
        // Everything selected is locked: nothing to drag, a click just selects.
        store.select([id]);
        return;
      }

      const mode: Mode = e.altKey ? 'lift' : heldKeys.has('r') ? 'rotate' : heldKeys.has('s') ? 'scale' : 'move';
      const starts: Record<string, ObjectState> = {};
      for (const sid of ids) {
        const obj = project.objects.find((o) => o.id === sid)!;
        starts[sid] = objectStateAt(project, shotIndex, phase, obj);
      }
      const primary = ids.includes(id) ? id : ids[0];
      // Several objects turn and scale as one, around their common centre.
      const centre = floorCentre(ids.map((sid) => starts[sid]));
      const others = project.objects
        .filter((o) => !ids.includes(o.id))
        .map((o) => objectStateAt(project, shotIndex, phase, o).position);

      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -e.point.y);
      const raycaster = new THREE.Raycaster();
      const rect = gl.domElement.getBoundingClientRect();
      const hitOnPlane = (cx: number, cy: number): THREE.Vector3 | null => {
        const ndc = new THREE.Vector2(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
        raycaster.setFromCamera(ndc, camera);
        const p = new THREE.Vector3();
        return raycaster.ray.intersectPlane(plane, p);
      };
      const grab = hitOnPlane(e.clientX, e.clientY) ?? e.point.clone();
      const startX = e.clientX;
      const startY = e.clientY;
      // World units per screen pixel at the object's distance, for lifting.
      const dist = camera.position.distanceTo(new THREE.Vector3(...starts[primary].position));
      const fov = (camera as THREE.PerspectiveCamera).fov ?? 50;
      const unitsPerPx = (2 * dist * Math.tan((fov * Math.PI) / 360)) / rect.height;
      let started = false;
      const lock = new AxisLock(LOCK_THRESHOLD);
      const pointerId = e.pointerId;

      // Touch and pen: resting on the object opens its radial menu.
      let longPress: ReturnType<typeof setTimeout> | null = null;
      if (e.pointerType !== 'mouse') {
        longPress = setTimeout(() => {
          longPress = null;
          if (started || multiTouch()) return;
          stopListening();
          useTransient.getState().openRadial(startX, startY, { kind: 'object', id });
        }, LONG_PRESS_MS);
      }

      /** A second finger turns this into a two-finger gesture: put things back. */
      const abandon = () => {
        stopListening();
        if (!started) return;
        useStore.getState().setObjectStates(starts);
        useStore.getState().endGesture();
        useTransient.getState().setDragging(false);
        useTransient.getState().setGuides([]);
      };

      const move = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        if (multiTouch()) return abandon();
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (!started) {
          if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
          started = true;
          if (longPress) clearTimeout(longPress);
          useStore.getState().beginGesture();
          useTransient.getState().setDragging(true);
          if (mode === 'move') useStore.getState().showHint('axis-lock', 'Hold Ctrl while dragging to move along one line only.');
        }
        const free = ev.shiftKey;
        const next: Record<string, ObjectState> = {};
        const guides: [number, number, number, number][] = [];

        if (mode === 'move') {
          const p = hitOnPlane(ev.clientX, ev.clientY);
          if (!p) return;
          let [ddx, ddz] = lock.apply([p.x - grab.x, p.z - grab.z], ev.ctrlKey);
          const s0 = starts[primary].position;
          let px = s0[0] + ddx;
          let pz = s0[2] + ddz;
          // A locked axis keeps the other coordinate exactly where it started.
          const lockedX = lock.axis === 0;
          const lockedZ = lock.axis === 1;
          if (!free) {
            if (!lockedZ) px = snap(px, GRID);
            if (!lockedX) pz = snap(pz, GRID);
          }
          if (lockedX) guides.push([s0[0] - LOCK_GUIDE, s0[2], s0[0] + LOCK_GUIDE, s0[2]]);
          if (lockedZ) guides.push([s0[0], s0[2] - LOCK_GUIDE, s0[0], s0[2] + LOCK_GUIDE]);
          // Smart guides: line up with other objects on X or Z (only along the free direction).
          const alignX = lockedZ ? undefined : others.find((o) => Math.abs(o[0] - (s0[0] + ddx)) < GUIDE_SNAP);
          const alignZ = lockedX ? undefined : others.find((o) => Math.abs(o[2] - (s0[2] + ddz)) < GUIDE_SNAP);
          if (alignX) {
            px = alignX[0];
            guides.push([px, Math.min(alignX[2], pz) - 1, px, Math.max(alignX[2], pz) + 1]);
          }
          if (alignZ) {
            pz = alignZ[2];
            guides.push([Math.min(alignZ[0], px) - 1, pz, Math.max(alignZ[0], px) + 1, pz]);
          }
          ddx = px - s0[0];
          ddz = pz - s0[2];
          for (const sid of ids) {
            const s = starts[sid];
            next[sid] = { ...s, position: [s.position[0] + ddx, s.position[1], s.position[2] + ddz] };
          }
        } else if (mode === 'lift') {
          let dyWorld = -dy * unitsPerPx;
          if (!free) dyWorld = snap(dyWorld, GRID);
          for (const sid of ids) {
            const s = starts[sid];
            next[sid] = { ...s, position: [s.position[0], Math.max(0, s.position[1] + dyWorld), s.position[2]] };
          }
        } else if (mode === 'rotate') {
          let delta = dx * 0.012;
          if (!free) delta = snap(delta, Math.PI / 12);
          for (const sid of ids) next[sid] = turnAround(starts[sid], centre, delta);
        } else {
          let f = Math.exp((dx - dy) * 0.005);
          if (!free) f = Math.max(0.05, snap(f, 0.05));
          for (const sid of ids) {
            const s = starts[sid];
            next[sid] =
              ids.length > 1 ? scaleAround(s, centre, f) : { ...s, scale: [s.scale[0] * f, s.scale[1] * f, s.scale[2] * f] };
          }
        }
        useTransient.getState().setGuides(guides);
        useStore.getState().setObjectStates(next);
      };

      const stopListening = () => {
        if (longPress) clearTimeout(longPress);
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
      };

      const up = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        stopListening();
        if (!started && wasSelected) {
          // A plain click inside a multi-selection narrows it to this object.
          useStore.getState().select([id]);
        }
        if (started) {
          useStore.getState().endGesture();
          useTransient.getState().setDragging(false);
          useTransient.getState().setGuides([]);
        }
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    },
    [camera, gl],
  );

  const onDoubleClick = useCallback((e: ThreeEvent<MouseEvent>, id: string) => {
    e.stopPropagation();
    useStore.getState().select([id]);
    viewportApi.focusSelection();
  }, []);

  return { onPointerDown, onDoubleClick };
}
