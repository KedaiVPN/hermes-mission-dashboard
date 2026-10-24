import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type * as THREE from 'three'
import { RBox } from './props.tsx'

export interface OceanProps {
  /** Mode malam vs siang */
  night?: boolean
  /** Offset X position (center of ocean vista) */
  offsetX?: number
  /** Offset Z position (where beach meets land) */
  offsetZ?: number
}

/**
 * Ocean Vista Component:
 * A clear, readable coastal vista. The water is bright and reflective so it reads as
 * actual water (not a black void). Includes:
 *   - sand beach
 *   - white foam crest along the shoreline (the key cue that it's water)
 *   - gently animated main water surface that reflects light
 *   - a moon-glint highlight band on the water at night
 *   - a lighter horizon band that separates water from sky
 *
 * Coordinate system: offsetZ is where the BEACH STARTS (closest to the road).
 * The ocean extends toward +Z.
 */
export function OceanVista({ night = false, offsetX = 0, offsetZ = 22 }: OceanProps) {
  const waterRef = useRef<THREE.Mesh>(null)

  // Gentle water shimmer
  useFrame(({ clock }) => {
    if (waterRef.current) {
      const t = clock.getElapsedTime()
      waterRef.current.position.y = -0.12 + Math.sin(t * 0.7) * 0.03
    }
  })

  return (
    <group position={[offsetX, 0, offsetZ]}>
      {/* Sand beach - from the road's far edge (dunia Z=28) to the shoreline */}
      <RBox
        position={[0, -0.02, 6]}
        size={[220, 0.2, 8]}
        radius={0.1}
        color={night ? '#3a3f4a' : '#d4c4a8'}
        roughness={1}
        shadow={false}
      />

      {/* White foam crest where waves meet the sand - the key water cue */}
      <RBox
        position={[0, -0.03, 10.2]}
        size={[220, 0.08, 0.7]}
        radius={0.35}
        color={night ? '#b9d4e8' : '#f5f8fa'}
        roughness={0.4}
        shadow={false}
      />
      {/* Secondary foam line */}
      <RBox
        position={[0, -0.04, 11]}
        size={[220, 0.06, 0.35]}
        radius={0.15}
        color={night ? '#7fa5c2' : '#e8eef2'}
        roughness={0.5}
        shadow={false}
      />

      {/* Main animated water surface - bright readable blue */}
      <mesh
        ref={waterRef}
        position={[0, -0.12, 62]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[220, 100, 24, 16]} />
        <meshStandardMaterial
          color={night ? '#1d4f7d' : '#1e6f9f'}
          roughness={0.25}
          metalness={0.45}
          emissive={night ? '#12304f' : '#000000'}
          emissiveIntensity={0.35}
          transparent={true}
          opacity={0.94}
        />
      </mesh>

      {/* Moon-glint / light reflection band on the water at night */}
      <RBox
        position={[0, -0.05, 18]}
        size={[120, 0.04, 2.2]}
        radius={0.4}
        color={night ? '#7fb4dd' : '#ffffff'}
        emissive={night ? '#7fb4dd' : '#ffffff'}
        emissiveIntensity={night ? 0.55 : 0}
        roughness={0.2}
        shadow={false}
      />
      {/* Soft secondary glint */}
      <RBox
        position={[0, -0.05, 26]}
        size={[90, 0.03, 1.4]}
        radius={0.3}
        color={night ? '#5f97c4' : '#d9e9f5'}
        emissive={night ? '#5f97c4' : '#d9e9f5'}
        emissiveIntensity={night ? 0.35 : 0}
        roughness={0.2}
        shadow={false}
      />

      {/* Lighter horizon band where water meets sky */}
      <RBox
        position={[0, -0.2, 92]}
        size={[220, 14, 14]}
        radius={0}
        color={night ? '#244a6b' : '#0e4166'}
        roughness={0.3}
        emissive={night ? '#1a3a58' : '#0a3355'}
        emissiveIntensity={night ? 0.3 : 0}
        shadow={false}
      />
    </group>
  )
}
