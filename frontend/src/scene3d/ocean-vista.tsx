import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type * as THREE from 'three'
import { RBox } from './props.tsx'

export interface OceanProps {
  /** Mode malam vs siang */
  night?: boolean
  /** Offset X position (defaults to right horizon) */
  offsetX?: number
  /** Offset Z position (depth from office) */
  offsetZ?: number
}

/**
 * Ocean Vista Component:
 * Expansive water horizon with subtle procedural animated wave shimmer,
 * shoreline edge, and ambient lighting response.
 */
export function OceanVista({ night = false, offsetX = 45, offsetZ = -15 }: OceanProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  
  // Animate gentle water oscillation
  useFrame(({ clock }) => {
    if (meshRef.current) {
      const t = clock.getElapsedTime()
      // Subtle rhythmic rise and fall of water plane
      meshRef.current.position.y = -0.15 + Math.sin(t * 0.8) * 0.04
    }
  })

  // Colors adapted for day vs night
  const waterColor = night ? '#0d223a' : '#1e6f9f'
  const shoreColor = night ? '#1a2936' : '#c2b280'
  const deepColor = night ? '#050d18' : '#0e4166'

  return (
    <group position={[offsetX, 0, offsetZ]}>
      {/* Shoreline Transition / Beach shelf */}
      <RBox
        position={[0, -0.1, 20]}
        size={[180, 0.4, 10]}
        radius={0.2}
        color={shoreColor}
        roughness={0.9}
        shadow={false}
      />

      {/* Main Visible Ocean Surface */}
      <mesh
        ref={meshRef}
        position={[0, -0.15, 65]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[180, 80, 24, 16]} />
        <meshStandardMaterial
          color={waterColor}
          roughness={0.15}
          metalness={0.3}
          transparent={true}
          opacity={night ? 0.88 : 0.82}
        />
      </mesh>

      {/* Deep horizon water shelf */}
      <RBox
        position={[0, -0.25, 108]}
        size={[180, 16, 12]}
        radius={0.0}
        color={deepColor}
        roughness={0.3}
        shadow={false}
      />
    </group>
  )
}
