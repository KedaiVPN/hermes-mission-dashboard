import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * Semi-open-world sky:
 * - Night: 800 stars distributed across full hemisphere, prominent moon + glow halo
 * - Day: multi-layer sky gradient + sun glow
 * All stars are above the horizon (y > 0) so they appear in the visible upper hemisphere.
 */
export function Sky({ night = false }: { night?: boolean }) {
  // Optimized star geometry - tightly spread on upper hemisphere only
  const starsGeometry = useMemo(() => {
    const count = 800
    const geo = new THREE.BufferGeometry()
    const positions = new Float32Array(count * 3)
    const sizes = new Float32Array(count)

    for (let i = 0; i < count; i++) {
      // Golden ratio sphere distribution, upper hemisphere only (y > 0)
      const theta = (i * 2.399963) % (Math.PI * 2) // golden angle
      const phi = Math.acos(1 - (i / count)) // upper hemisphere: phi 0..PI, y = cos(phi) from 1 to -1
      // Only upper hemisphere: keep phi 0..PI/2 + some below horizon (phi 0..1.7 out of PI)
      const phiClamped = (phi / Math.PI) * 1.5 // compress so all stars are near-upper half
      const radius = 180 + (i % 7) * 3  // vary slightly

      positions[i * 3]     = radius * Math.sin(phiClamped) * Math.cos(theta)
      positions[i * 3 + 1] = radius * Math.abs(Math.cos(phiClamped)) + 20 // force above ground
      positions[i * 3 + 2] = radius * Math.sin(phiClamped) * Math.sin(theta)
      
      // Vary star sizes for twinkling illusion
      sizes[i] = 0.6 + (i % 5) * 0.25
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1))
    return geo
  }, [])

  // Simple cloud-like low-poly spheres for day sky (static)
  const cloudPositions = useMemo<[number, number, number][]>(() => [
    [-50, 80, -120],
    [30, 90, -140],
    [110, 75, -130],
    [-120, 85, -100],
    [80, 95, -90],
    [-10, 100, -160],
  ], [])

  const moonRef = useRef<THREE.Mesh>(null)

  // Subtle moon pulse glow
  useFrame(({ clock }) => {
    if (moonRef.current && night) {
      const t = clock.getElapsedTime()
      moonRef.current.scale.setScalar(1 + Math.sin(t * 0.5) * 0.03)
    }
  })

  return (
    <group>
      {/* === SKY DOME === */}
      {/* Outer dome - primary sky color */}
      <mesh scale={260}>
        <sphereGeometry args={[1, 32, 16]} />
        <meshBasicMaterial
          side={THREE.BackSide}
          color={night ? '#05091a' : '#4da8e0'}
          fog={false}
        />
      </mesh>

      {/* Inner dome - lower horizon gradient layer */}
      <mesh scale={240}>
        <sphereGeometry args={[1, 24, 8]} />
        <meshBasicMaterial
          side={THREE.BackSide}
          color={night ? '#0a1430' : '#87ceeb'}
          transparent
          opacity={0.65}
          fog={false}
        />
      </mesh>

      {/* Horizon glow strip */}
      <mesh position={[0, -40, 0]} scale={[230, 60, 230]}>
        <sphereGeometry args={[1, 24, 6]} />
        <meshBasicMaterial
          side={THREE.BackSide}
          color={night ? '#101d3f' : '#b8e4f5'}
          transparent
          opacity={0.5}
          fog={false}
        />
      </mesh>

      {/* ===== NIGHT ===== */}
      {night ? (
        <>
          {/* Stars - bright field */}
          <points geometry={starsGeometry}>
            <pointsMaterial
              color="#ffffff"
              size={1.1}
              sizeAttenuation={true}
              transparent
              opacity={0.92}
              fog={false}
            />
          </points>

          {/* Stars - secondary faint layer (rotated) */}
          <points geometry={starsGeometry} rotation={[0.3, 0.8, 0.1]}>
            <pointsMaterial
              color="#aac4ff"
              size={0.55}
              sizeAttenuation={true}
              transparent
              opacity={0.55}
              fog={false}
            />
          </points>

          {/* === MOON === */}
          {/* Core moon disc */}
          <mesh position={[75, 110, -155]}>
            <sphereGeometry args={[10, 32, 32]} />
            <meshBasicMaterial color="#fffacd" fog={false} />
          </mesh>

          {/* Moon inner glow */}
          <mesh ref={moonRef} position={[75, 110, -155]}>
            <sphereGeometry args={[14, 32, 32]} />
            <meshBasicMaterial color="#fffde8" transparent opacity={0.18} fog={false} />
          </mesh>

          {/* Moon outer halo */}
          <mesh position={[75, 110, -155]}>
            <sphereGeometry args={[22, 32, 32]} />
            <meshBasicMaterial color="#ffe8a0" transparent opacity={0.06} fog={false} />
          </mesh>

          {/* Moon far halo - atmospheric */}
          <mesh position={[75, 110, -155]}>
            <sphereGeometry args={[32, 32, 32]} />
            <meshBasicMaterial color="#fff5c0" transparent opacity={0.025} fog={false} />
          </mesh>

          {/* Milky way tint - subtle band across sky */}
          <mesh position={[0, 50, 0]} rotation={[0.3, 0, 0.7]} scale={[240, 60, 240]}>
            <sphereGeometry args={[1, 24, 8]} />
            <meshBasicMaterial
              side={THREE.BackSide}
              color="#1a2545"
              transparent
              opacity={0.22}
              fog={false}
            />
          </mesh>
        </>
      ) : (
        <>
          {/* === SUN === */}
          {/* Sun core */}
          <mesh position={[110, 130, -90]}>
            <sphereGeometry args={[14, 32, 32]} />
            <meshBasicMaterial color="#fffde0" />
          </mesh>

          {/* Sun inner glow */}
          <mesh position={[110, 130, -90]}>
            <sphereGeometry args={[20, 32, 32]} />
            <meshBasicMaterial color="#ffee58" transparent opacity={0.25} />
          </mesh>

          {/* Sun outer halo */}
          <mesh position={[110, 130, -90]}>
            <sphereGeometry args={[34, 32, 32]} />
            <meshBasicMaterial color="#ffe082" transparent opacity={0.08} />
          </mesh>

          {/* Clouds - low poly spheres */}
          {cloudPositions.map(([x, y, z], i) => (
            <group key={i} position={[x, y, z]}>
              <mesh>
                <sphereGeometry args={[12 + (i % 3) * 4, 6, 4]} />
                <meshBasicMaterial color="#f0f8ff" transparent opacity={0.8} />
              </mesh>
              <mesh position={[10, -3, 0]}>
                <sphereGeometry args={[9 + (i % 2) * 3, 5, 4]} />
                <meshBasicMaterial color="#e8f4ff" transparent opacity={0.65} />
              </mesh>
              <mesh position={[-8, -2, 3]}>
                <sphereGeometry args={[8 + (i % 3) * 2, 5, 4]} />
                <meshBasicMaterial color="#f5faff" transparent opacity={0.7} />
              </mesh>
            </group>
          ))}
        </>
      )}
    </group>
  )
}