import { memo, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import type { ResolvedObjectState, SceneObject } from '../model/types';
import { jointsFor } from '../model/poses';
import { Figure } from './Figure';
import { ACCENT, CHILD_SCALE } from './shared';

const geometries = {
  box: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
  sphere: new THREE.SphereGeometry(0.5, 32, 20).translate(0, 0.5, 0),
  cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 32).translate(0, 0.5, 0),
  cone: new THREE.ConeGeometry(0.5, 1, 32).translate(0, 0.5, 0),
  plane: new THREE.BoxGeometry(2, 2.4, 0.08).translate(0, 1.2, 0),
  ramp: rampGeometry(),
};

/** A wedge 1 m wide, 2 m long and 1 m tall, rising toward -Z. */
function rampGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-1, 0);
  shape.lineTo(1, 0);
  shape.lineTo(-1, 1);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
  g.translate(0, 0, -0.5);
  g.rotateY(-Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

interface Props {
  obj: SceneObject;
  state: ResolvedObjectState;
  selected?: boolean;
  hovered?: boolean;
  ghost?: boolean;
  onPointerDown?: (e: ThreeEvent<PointerEvent>, id: string) => void;
  onDoubleClick?: (e: ThreeEvent<MouseEvent>, id: string) => void;
  onHover?: (id: string | null) => void;
}

const accent = new THREE.Color(ACCENT);

export const ObjectNode = memo(function ObjectNode({
  obj,
  state,
  selected,
  hovered,
  ghost,
  onPointerDown,
  onDoubleClick,
  onHover,
}: Props) {
  const material = useMemo(
    () =>
      new THREE.MeshLambertMaterial({
        transparent: !!ghost,
        opacity: ghost ? 0.22 : 1,
        depthWrite: !ghost,
      }),
    [ghost],
  );
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => {
    material.color.set(obj.color);
    if (selected) material.emissive.copy(accent).multiplyScalar(0.1);
    else if (hovered) material.emissive.copy(accent).multiplyScalar(0.06);
    else material.emissive.setRGB(0, 0, 0);
  }, [material, obj.color, selected, hovered]);

  if (!state.visible && !ghost) return null;

  const rotXZ = state.rotationXZ ?? [0, 0];
  const isFigure = obj.kind === 'figure';
  const sizeScale = isFigure && obj.figureSize === 'child' ? CHILD_SCALE : 1;

  return (
    <group
      position={state.position}
      rotation={[rotXZ[0], state.rotationY, rotXZ[1], 'YXZ']}
      onPointerDown={onPointerDown ? (e) => onPointerDown(e, obj.id) : undefined}
      onDoubleClick={onDoubleClick ? (e) => onDoubleClick(e, obj.id) : undefined}
      onPointerOver={
        onHover
          ? (e) => {
              e.stopPropagation();
              onHover(obj.id);
            }
          : undefined
      }
      onPointerOut={onHover ? () => onHover(null) : undefined}
      userData={{ objectId: obj.id }}
    >
      <group scale={[state.scale[0] * sizeScale, state.scale[1] * sizeScale, state.scale[2] * sizeScale]}>
        {isFigure ? (
          <Figure joints={jointsFor(state)} material={material} />
        ) : (
          <mesh
            geometry={geometries[obj.kind as keyof typeof geometries] ?? geometries.box}
            material={material}
            castShadow
            receiveShadow
          />
        )}
      </group>
    </group>
  );
}, propsEqual);

function propsEqual(a: Props, b: Props): boolean {
  return (
    a.obj === b.obj &&
    a.selected === b.selected &&
    a.hovered === b.hovered &&
    a.ghost === b.ghost &&
    a.onPointerDown === b.onPointerDown &&
    statesEqual(a.state, b.state)
  );
}

function statesEqual(a: ResolvedObjectState, b: ResolvedObjectState): boolean {
  if (a === b) return true;
  return (
    a.position[0] === b.position[0] &&
    a.position[1] === b.position[1] &&
    a.position[2] === b.position[2] &&
    a.rotationY === b.rotationY &&
    a.scale[0] === b.scale[0] &&
    a.scale[1] === b.scale[1] &&
    a.scale[2] === b.scale[2] &&
    a.rotationXZ?.[0] === b.rotationXZ?.[0] &&
    a.rotationXZ?.[1] === b.rotationXZ?.[1] &&
    a.pose === b.pose &&
    a.visible === b.visible &&
    a.poseBlend?.w === b.poseBlend?.w &&
    a.poseBlend?.from === b.poseBlend?.from &&
    a.poseBlend?.to === b.poseBlend?.to
  );
}
