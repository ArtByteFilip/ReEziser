import { ContactShadows, Grid } from '@react-three/drei';

export const BACKGROUND = '#1b1d21';

/** Floor, grid, lights and the soft contact shadow. */
export function Stage({ shadows = true }: { shadows?: boolean }) {
  return (
    <>
      <hemisphereLight args={['#ffffff', '#3a3b40', 1.6]} />
      <directionalLight position={[6, 12, 8]} intensity={1.8} />
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.01, 0]}>
        <planeGeometry args={[400, 400]} />
        <meshLambertMaterial color="#26292e" />
      </mesh>
      <Grid
        position={[0, 0, 0]}
        infiniteGrid
        cellSize={1}
        sectionSize={5}
        cellThickness={0.6}
        sectionThickness={1}
        cellColor="#3a3e45"
        sectionColor="#4a4f58"
        fadeDistance={60}
        fadeStrength={1.5}
      />
      {shadows && (
        <ContactShadows position={[0, 0.002, 0]} scale={40} resolution={1024} blur={2.4} far={4} opacity={0.6} />
      )}
    </>
  );
}
