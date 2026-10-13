import type { Material } from 'three';
import type { PoseJoints } from '../model/poses';

const HIP_HEIGHT = 0.92;
const LIMB = 0.06;
const ARM = 0.045;

interface Props {
  joints: PoseJoints;
  material: Material;
}

/** The mannequin, built from primitives. Feet at the origin, facing +Z. */
export function Figure({ joints: j, material }: Props) {
  return (
    <group position={[0, HIP_HEIGHT + j.drop, 0]} rotation-x={j.pitch}>
      {/* Torso, neck and head */}
      <group rotation-x={j.spine}>
        <mesh position={[0, 0.28, 0]} scale={[1.15, 1, 0.75]} material={material} castShadow>
          <capsuleGeometry args={[0.15, 0.3, 4, 12]} />
        </mesh>
        <group position={[0, 0.52, 0]} rotation-x={j.neck}>
          <mesh position={[0, 0.17, 0]} material={material} castShadow>
            <sphereGeometry args={[0.11, 20, 14]} />
          </mesh>
          {/* Nose wedge shows where the figure is looking */}
          <mesh position={[0, 0.17, 0.11]} rotation-x={Math.PI / 2} material={material}>
            <coneGeometry args={[0.035, 0.08, 4]} />
          </mesh>
        </group>
        <Arm side={-1} shoulder={j.lShoulder} shoulderZ={j.lShoulderZ} elbow={j.lElbow} material={material} />
        <Arm side={1} shoulder={j.rShoulder} shoulderZ={j.rShoulderZ} elbow={j.rElbow} material={material} />
      </group>
      <Leg side={-1} hip={j.lHip} knee={j.lKnee} material={material} />
      <Leg side={1} hip={j.rHip} knee={j.rKnee} material={material} />
    </group>
  );
}

function Arm(props: { side: number; shoulder: number; shoulderZ: number; elbow: number; material: Material }) {
  // side -1 is the figure's left, which sits on +X when it faces +Z.
  // Pose shoulderZ values are negative-outward for the left arm, so flip the sign.
  const x = props.side === -1 ? 0.21 : -0.21;
  return (
    <group position={[x, 0.47, 0]} rotation={[props.shoulder, 0, -props.shoulderZ]}>
      <mesh position={[0, -0.15, 0]} material={props.material} castShadow>
        <capsuleGeometry args={[ARM, 0.22, 4, 8]} />
      </mesh>
      <group position={[0, -0.3, 0]} rotation-x={props.elbow}>
        <mesh position={[0, -0.13, 0]} material={props.material} castShadow>
          <capsuleGeometry args={[ARM * 0.9, 0.2, 4, 8]} />
        </mesh>
        <mesh position={[0, -0.29, 0]} material={props.material}>
          <sphereGeometry args={[0.05, 10, 8]} />
        </mesh>
      </group>
    </group>
  );
}

function Leg(props: { side: number; hip: number; knee: number; material: Material }) {
  const x = props.side === -1 ? 0.09 : -0.09;
  return (
    <group position={[x, 0, 0]} rotation-x={props.hip}>
      <mesh position={[0, -0.22, 0]} material={props.material} castShadow>
        <capsuleGeometry args={[LIMB * 1.15, 0.32, 4, 8]} />
      </mesh>
      <group position={[0, -0.44, 0]} rotation-x={props.knee}>
        <mesh position={[0, -0.21, 0]} material={props.material} castShadow>
          <capsuleGeometry args={[LIMB, 0.32, 4, 8]} />
        </mesh>
        <mesh position={[0, -0.45, 0.05]} material={props.material} castShadow>
          <boxGeometry args={[0.09, 0.05, 0.22]} />
        </mesh>
      </group>
    </group>
  );
}
