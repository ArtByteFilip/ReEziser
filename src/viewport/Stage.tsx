import { ContactShadows, Grid } from '@react-three/drei';
import { useSceneColors } from '../ui/theme';

/** Background, floor, grid, lights and the soft contact shadow, in the theme's colours. */
export function Stage({ shadows = true }: { shadows?: boolean }) {
  const c = useSceneColors();
  return (
    <>
      <color attach="background" args={[c.background]} />
      <hemisphereLight args={[c.skyLight, c.groundLight, 1.6]} />
      <directionalLight position={[6, 12, 8]} intensity={1.8} />
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.01, 0]}>
        <planeGeometry args={[400, 400]} />
        <meshLambertMaterial color={c.floor} />
      </mesh>
      <Grid
        position={[0, 0, 0]}
        infiniteGrid
        cellSize={1}
        sectionSize={5}
        cellThickness={0.6}
        sectionThickness={1}
        cellColor={c.cell}
        sectionColor={c.section}
        fadeDistance={60}
        fadeStrength={1.5}
      />
      {shadows && (
        <ContactShadows position={[0, 0.002, 0]} scale={40} resolution={1024} blur={2.4} far={4} opacity={0.6} />
      )}
    </>
  );
}
