import { useRef, useMemo, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import type { WorldNPCRoute } from './world-npc-routes'
import { generateWorldRoutes } from './world-npc-routes'
import { RBox } from './props.tsx'
import type * as THREE from 'three'

interface WorldNPCProps {
  /** Route definition */
  route: WorldNPCRoute
  /** Seed for visual variety */
  seed: number
}

/**
 * Render a world NPC (pedestrian, vehicle, or animal) that traverses
 * across the visible horizon, creating the illusion of a larger world.
 */
export function WorldNPC({ route, seed }: WorldNPCProps) {
  const groupRef = useRef<THREE.Group>(null)
  const [progress, setProgress] = useState(() => (seed % 100) / 100) // Start at random position
  
  // Calculate visual properties based on type and seed
  const visualProps = useMemo(() => {
    const hue = (seed * 37) % 360
    const saturation = 50 + (seed % 3) * 15
    const lightness = 40 + (seed % 4) * 10
    const color = `hsl(${hue}, ${saturation}%, ${lightness}%)`
    
    return {
      color,
      scale: 0.8 + (seed % 5) * 0.15
    }
  }, [seed])

  // Movement speed based on route and seed variation
  const speed = useMemo(() => {
    const seedVariation = 0.9 + (seed % 20) / 100
    return route.speed * seedVariation * 0.0008 // Scale down for frame-based movement
  }, [route.speed, seed])

  useFrame(() => {
    // Move NPC along route
    const newProgress = (progress + speed) % 1
    setProgress(newProgress)
    
    if (groupRef.current) {
      // Calculate position and heading
      const dx = route.endPoint[0] - route.startPoint[0]
      const dz = route.endPoint[2] - route.startPoint[2]
      const heading = Math.atan2(dx, dz)
      
      groupRef.current.position.x = route.startPoint[0] + dx * newProgress
      groupRef.current.position.y = route.startPoint[1]
      groupRef.current.position.z = route.startPoint[2] + dz * newProgress
      
      // Face direction of travel
      groupRef.current.rotation.y = heading
    }
  })

  // Don't render if completely off-screen (at very start or end)
  // Allow some buffer so they enter/exit smoothly
  if (progress < 0.02 || progress > 0.98) {
    return null
  }

  return (
    <group ref={groupRef}>
      {route.type === 'pedestrian' && (
        <PedestrianNPC color={visualProps.color} scale={visualProps.scale} />
      )}
      {route.type === 'vehicle' && (
        <VehicleNPC color={visualProps.color} scale={visualProps.scale} />
      )}
      {route.type === 'animal' && (
        <AnimalNPC color={visualProps.color} scale={visualProps.scale} seed={seed} />
      )}
    </group>
  )
}

/**
 * Pedestrian representation - simple figure
 */
function PedestrianNPC({ color, scale }: { color: string; scale: number }) {
  return (
    <group scale={scale}>
      {/* Head */}
      <RBox position={[0, 1.4, 0]} size={[0.35, 0.35, 0.35]} radius={0.1} color={color} shadow={false} />
      {/* Body */}
      <RBox position={[0, 0.75, 0]} size={[0.5, 0.8, 0.3]} radius={0.12} color={color} shadow={false} />
      {/* Legs (simplified) */}
      <RBox position={[-0.12, 0.2, 0]} size={[0.15, 0.45, 0.18]} radius={0.04} color={color} shadow={false} />
      <RBox position={[0.12, 0.2, 0]} size={[0.15, 0.45, 0.18]} radius={0.04} color={color} shadow={false} />
    </group>
  )
}

/**
 * Vehicle representation - simple car/motorcycle shape
 */
function VehicleNPC({ color, scale }: { color: string; scale: number }) {
  return (
    <group scale={scale}>
      {/* Body */}
      <RBox position={[0, 0.5, 0]} size={[1.2, 0.5, 2.2]} radius={0.15} color={color} shadow={false} />
      {/* Cabin */}
      <RBox position={[0, 0.9, -0.2]} size={[1.0, 0.45, 1.1]} radius={0.12} color="#2d3436" shadow={false} />
      {/* Wheels */}
      <RBox position={[-0.55, 0.2, 0.65]} size={[0.2, 0.4, 0.5]} radius={0.1} color="#2d3436" shadow={false} />
      <RBox position={[0.55, 0.2, 0.65]} size={[0.2, 0.4, 0.5]} radius={0.1} color="#2d3436" shadow={false} />
      <RBox position={[-0.55, 0.2, -0.65]} size={[0.2, 0.4, 0.5]} radius={0.1} color="#2d3436" shadow={false} />
      <RBox position={[0.55, 0.2, -0.65]} size={[0.2, 0.4, 0.5]} radius={0.1} color="#2d3436" shadow={false} />
    </group>
  )
}

/**
 * Animal representation - bird or small creature
 */
function AnimalNPC({ color, scale, seed }: { color: string; scale: number; seed: number }) {
  const wingPhase = useRef((seed % 12) * 0.35)
  
  useFrame((_, delta) => {
    wingPhase.current += delta * 15
  })
  
  const wingOffset = Math.sin(wingPhase.current) * 0.15
  
  return (
    <group scale={scale} position={[0, 1, 0]}>
      {/* Body */}
      <RBox position={[0, 0, 0]} size={[0.4, 0.3, 0.6]} radius={0.1} color={color} shadow={false} />
      {/* Head */}
      <RBox position={[0, 0.2, 0.35]} size={[0.25, 0.25, 0.25]} radius={0.08} color={color} shadow={false} />
      {/* Left wing */}
      <group position={[-0.25, 0.1, 0]} rotation={[0, 0, wingOffset]}>
        <RBox position={[-0.25, 0, 0]} size={[0.4, 0.08, 0.35]} radius={0.02} color={color} shadow={false} />
      </group>
      {/* Right wing */}
      <group position={[0.25, 0.1, 0]} rotation={[0, 0, -wingOffset]}>
        <RBox position={[0.25, 0, 0]} size={[0.4, 0.08, 0.35]} radius={0.02} color={color} shadow={false} />
      </group>
      {/* Tail */}
      <RBox position={[0, 0.05, -0.4]} size={[0.25, 0.2, 0.3]} radius={0.05} color={color} shadow={false} />
    </group>
  )
}

/**
 * Render all world NPCs from generated routes
 * Only render non-animal NPCs (pedestrians & vehicles visible from distance)
 */
export function WorldNPCs({ buildingMinX = -9.5 }: { buildingMinX?: number }) {
  const routes = useMemo(() => generateWorldRoutes(buildingMinX), [buildingMinX])

  return (
    <group>
      {routes
        .filter(route => route.type !== 'animal') // Hide floating animals
        .map((route, index) => (
          <WorldNPC
            key={`${route.id}-${index}`}
            route={route}
            seed={route.id * 17 + index}
          />
        ))}
    </group>
  )
}