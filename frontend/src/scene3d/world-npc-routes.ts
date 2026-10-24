import type { Vec3 } from '../office3d-layout.ts'

export interface WorldNPCRoute {
  /** Unique route ID */
  id: number
  /** Route type */
  type: 'pedestrian' | 'vehicle' | 'animal'
  /** Start position (typically off-screen) */
  startPoint: Vec3
  /** End position (typically off-screen) */
  endPoint: Vec3
  /** Speed multiplier (1 = normal walk) */
  speed: number
  /** Color for debug/visualization */
  debugColor?: string
}

/**
 * Generate NPC routes that traverse the visible landscape horizon.
 * These NPCs start from one edge of the world and walk/drive across
 * to the other side, giving the impression of a larger living world.
 */
export function generateWorldRoutes(_buildingMinX: number): WorldNPCRoute[] {
  const routes: WorldNPCRoute[] = []

  // === VEHICLE ROUTES (on the main road + the cross road) ===
  routes.push({
    id: 200,
    type: 'vehicle',
    startPoint: [-80, 0, 11.5],
    endPoint: [80, 0, 11.5],
    speed: 2.2,
    debugColor: '#3498db'
  })

  routes.push({
    id: 201,
    type: 'vehicle',
    startPoint: [80, 0, 14.5],
    endPoint: [-80, 0, 14.5],
    speed: 2.0,
    debugColor: '#e74c3c'
  })

  // Cross-road vehicles along X=24 (north-south), full traffic on both lanes
  routes.push({
    id: 202,
    type: 'vehicle',
    startPoint: [22, 0, -90],
    endPoint: [22, 0, 90],
    speed: 2.1,
    debugColor: '#c97bd8'
  })

  routes.push({
    id: 203,
    type: 'vehicle',
    startPoint: [26, 0, 90],
    endPoint: [26, 0, -90],
    speed: 1.9,
    debugColor: '#58d3c2'
  })

  return routes
}

/**
 * Calculate NPC position along route at given progress (0-1)
 */
export function sampleWorldRoute(route: WorldNPCRoute, progress: number): {
  position: Vec3
  heading: number
} {
  const clampedProgress = Math.max(0, Math.min(1, progress))
  
  // Linear interpolation
  const x = route.startPoint[0] + (route.endPoint[0] - route.startPoint[0]) * clampedProgress
  const y = route.startPoint[1] + (route.endPoint[1] - route.startPoint[1]) * clampedProgress
  const z = route.startPoint[2] + (route.endPoint[2] - route.startPoint[2]) * clampedProgress
  
  // Calculate heading (direction facing)
  const dx = route.endPoint[0] - route.startPoint[0]
  const dz = route.endPoint[2] - route.startPoint[2]
  const heading = Math.atan2(dx, dz)
  
  return {
    position: [x, y, z],
    heading
  }
}
