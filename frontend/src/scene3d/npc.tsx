import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { RBox } from './props.tsx'
import type { Vec3 } from '../office3d-layout.ts'
import { createNpcRoute, sampleNpcRoute } from './npc-routes.ts'

/** Deterministic pseudo-random from integer seed pair. */
function jitter(seed1: number, seed2: number): number {
  const x = Math.sin(seed1 * 12.9898 + seed2 * 78.233) * 43758.5453
  return x - Math.floor(x)
}

/** Kinetic properties for an NPC derived from its id. */
interface NPCKinetics {
  walkSpeed: number
  swingFreq: number
  phase: number
}

function npcKinetics(id: number): NPCKinetics {
  const v1 = jitter(id, 0)
  const v2 = jitter(id, 1)
  return {
    walkSpeed: 1.8 + v1 * 1.0,
    swingFreq: 8.5 + v2 * 2.5,
    phase: v1 * Math.PI * 2,
  }
}

/** Hair/skin/shirt/pants palette derived from id. */
const HAIR = ['#1d293c', '#b54b45', '#6a4d8d', '#3b2a20', '#c9a24a', '#2f4f3a', '#8b5a2b', '#11151c']
const SKIN = ['#e9b57d', '#c98e5a', '#f1c9a0', '#a8714a', '#dca06e']
const SHIRT = ['#e6b34e', '#70bdcb', '#93ca67', '#e76f51', '#8f7ae6', '#f4a3b4', '#4f9c7a', '#d9534f', '#5a8dee', '#c7a17a']
const PANTS = ['#36475d', '#374052', '#344349', '#4a3b2f', '#2f3a44', '#3d2f4a']

function npcLook(id: number) {
  const v1 = jitter(id, 10)
  const v2 = jitter(id, 11)
  const v3 = jitter(id, 12)
  const v4 = jitter(id, 13)
  return {
    hair: HAIR[Math.floor(v1 * HAIR.length) % HAIR.length],
    skin: SKIN[Math.floor(v2 * SKIN.length) % SKIN.length],
    shirt: SHIRT[Math.floor(v3 * SHIRT.length) % SHIRT.length],
    pants: PANTS[Math.floor(v4 * PANTS.length) % PANTS.length],
  }
}

/** Shared geometries for all NPC characters. */
const legGeometry = new THREE.BoxGeometry(0.17, 0.62, 0.2).translate(0, -0.31, 0)
const armGeometry = new THREE.BoxGeometry(0.12, 0.52, 0.14).translate(0, -0.26, 0)

/**
 * Animated street vendor. When `serving` is true the vendor turns to face
 * the customer and performs a serving gesture.
 */
export function AnimatedVendor({
  position,
  baseRotation = 0,
  shirt,
  pants = '#34393f',
  hat,
  serving = false,
}: {
  position: Vec3
  baseRotation?: number
  shirt: string
  pants?: string
  hat: 'peci' | 'cap'
  serving?: boolean
}) {
  const body = useRef<THREE.Group>(null)
  const leftArm = useRef<THREE.Mesh>(null)
  const rightArm = useRef<THREE.Mesh>(null)

  useFrame((state) => {
    if (!body.current || !leftArm.current || !rightArm.current) return
    const time = state.clock.elapsedTime
    
    // When serving: arms gesture (slightly elevated), gentle sway.
    // When idle: arms rest at sides, body sways gently.
    if (serving) {
      leftArm.current.rotation.x = -0.5 + Math.sin(time * 2) * 0.15
      rightArm.current.rotation.x = -0.5 + Math.cos(time * 2) * 0.15
      body.current.position.y = Math.sin(time * 1.5) * 0.02
    } else {
      leftArm.current.rotation.x = -0.3
      rightArm.current.rotation.x = -0.3
      body.current.position.y = 0
    }
  })

  return (
    <group position={position}>
      <group ref={body} rotation={[0, baseRotation, 0]}>
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.34, 16]} />
          <meshBasicMaterial color="#000000" transparent opacity={0.35} depthWrite={false} />
        </mesh>
        <RBox position={[-0.11, 0.35, 0]} size={[0.17, 0.66, 0.2]} radius={0.05} color={pants} />
        <RBox position={[0.11, 0.35, 0]} size={[0.17, 0.66, 0.2]} radius={0.05} color={pants} />
        <RBox position={[0, 0.98, 0]} size={[0.48, 0.6, 0.3]} radius={0.07} color={shirt} roughness={0.85} />
        <mesh ref={leftArm} position={[-0.31, 0.95, 0.05]} geometry={armGeometry}>
          <meshStandardMaterial color={shirt} roughness={0.85} />
        </mesh>
        <mesh ref={rightArm} position={[0.31, 0.95, 0.05]} geometry={armGeometry}>
          <meshStandardMaterial color={shirt} roughness={0.85} />
        </mesh>
        <RBox position={[0, 1.5, 0]} size={[0.4, 0.4, 0.37]} radius={0.08} color="#c98e5a" roughness={0.7} />
        <RBox position={[-0.09, 1.52, 0.186]} size={[0.06, 0.07, 0.01]} radius={0.004} color="#17201e" shadow={false} />
        <RBox position={[0.09, 1.52, 0.186]} size={[0.06, 0.07, 0.01]} radius={0.004} color="#17201e" shadow={false} />
        {hat === 'peci' ? (
          <RBox position={[0, 1.76, 0]} size={[0.36, 0.14, 0.34]} radius={0.03} color="#1b1d20" roughness={0.9} />
        ) : (
          <>
            <RBox position={[0, 1.74, 0]} size={[0.42, 0.12, 0.4]} radius={0.06} color="#c0392b" />
            <RBox position={[0, 1.7, 0.24]} size={[0.36, 0.03, 0.16]} radius={0.01} color="#c0392b" />
          </>
        )}
      </group>
    </group>
  )
}

/**
 * A pedestrian NPC walking along outdoor paths or a shopper pausing at stalls.
 */
export function StreetNPC({
  id,
  layout,
  onShopperStateChange,
}: {
  id: number
  layout: { building: { minX: number }; sideLaneX: number; gangCenterX: number; baksoCart: Vec3; kopiBike: Vec3 }
  onShopperStateChange?: (id: number, buying: boolean, stall: 'bakso' | 'kopi' | null) => void
}) {
  const group = useRef<THREE.Group>(null)
  const leftLeg = useRef<THREE.Mesh>(null)
  const rightLeg = useRef<THREE.Mesh>(null)
  const leftArm = useRef<THREE.Mesh>(null)
  const rightArm = useRef<THREE.Mesh>(null)
  const kinetics = useMemo(() => npcKinetics(id), [id])
  const colors = useMemo(() => npcLook(id), [id])
  const route = useMemo(() => createNpcRoute(layout, id), [layout, id])
  const lastBuying = useRef<boolean>(false)

  useFrame((state) => {
    const root = group.current
    if (!root) return

    const time = state.clock.elapsedTime
    const sample = sampleNpcRoute(route, time)

    // Apply sampled position and heading
    root.position.set(sample.position[0], sample.position[1], sample.position[2])
    root.rotation.y = sample.heading

    // Report buying state change to parent (for vendor reaction)
    if (sample.buying !== lastBuying.current) {
      lastBuying.current = sample.buying
      onShopperStateChange?.(id, sample.buying, route.stall)
    }

    // Walking animation if actively moving (not waiting or buying)
    const swing = sample.isMoving ? Math.sin((time + kinetics.phase) * kinetics.swingFreq) * 0.5 : 0

    if (leftLeg.current && rightLeg.current) {
      leftLeg.current.rotation.x = swing
      rightLeg.current.rotation.x = -swing
    }
    if (leftArm.current && rightArm.current) {
      // If buying: hands held forward (carrying money / bowl)
      if (sample.buying) {
        leftArm.current.rotation.x = -0.7 + Math.sin(time * 3) * 0.08
        rightArm.current.rotation.x = -0.7 + Math.cos(time * 3) * 0.08
      } else if (sample.isMoving) {
        leftArm.current.rotation.x = -swing
        rightArm.current.rotation.x = swing
      } else {
        // Standing idle (waiting)
        leftArm.current.rotation.x = 0
        rightArm.current.rotation.x = 0
      }
    }
  })

  return (
    <group ref={group} position={route.points[0]}>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.32, 16]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.3} depthWrite={false} />
      </mesh>
      <mesh ref={leftLeg} position={[-0.1, 0.64, 0]} geometry={legGeometry}>
        <meshStandardMaterial color={colors.pants} roughness={0.8} />
      </mesh>
      <mesh ref={rightLeg} position={[0.1, 0.64, 0]} geometry={legGeometry}>
        <meshStandardMaterial color={colors.pants} roughness={0.8} />
      </mesh>
      <RBox position={[0, 0.96, 0]} size={[0.46, 0.56, 0.28]} radius={0.06} color={colors.shirt} roughness={0.85} />
      <mesh ref={leftArm} position={[-0.28, 1.16, 0]} geometry={armGeometry}>
        <meshStandardMaterial color={colors.shirt} roughness={0.85} />
      </mesh>
      <mesh ref={rightArm} position={[0.28, 1.16, 0]} geometry={armGeometry}>
        <meshStandardMaterial color={colors.shirt} roughness={0.85} />
      </mesh>
      <RBox position={[0, 1.46, 0]} size={[0.38, 0.38, 0.35]} radius={0.07} color={colors.skin} roughness={0.7} />
      <RBox position={[0, 1.68, -0.02]} size={[0.41, 0.12, 0.39]} radius={0.05} color={colors.hair} roughness={0.9} />
    </group>
  )
}

/**
 * Generate deterministic waypoints for a pedestrian route along the
 * gang (alley) and around the building perimeter.
 */
export function gangRoute(layout: { sideLaneX: number; gangCenterX: number; building: { minX: number } }, seed: number): Vec3[] {
  const { sideLaneX, gangCenterX } = layout
  const shift = jitter(seed, 100) > 0.5 ? 1 : -1
  const zStart = -6.5 + jitter(seed, 101) * 3
  const zEnd = 7 + jitter(seed, 102) * 2

  if (shift > 0) {
    return [
      [gangCenterX, 0, zStart],
      [gangCenterX, 0, zEnd],
      [sideLaneX, 0, zEnd],
      [sideLaneX, 0, zStart],
    ]
  }
  return [
    [sideLaneX, 0, zStart],
    [sideLaneX, 0, zEnd],
    [gangCenterX, 0, zEnd],
    [gangCenterX, 0, zStart],
  ]
}
