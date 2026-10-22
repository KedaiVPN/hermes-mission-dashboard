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

  // === PEDESTRIAN ROUTES ===
  // Pedestrians walking along distant paths (visible but not reachable)
  
  // Route 1: Walker crossing behind office (left to right)
  routes.push({
    id: 100,
    type: 'pedestrian',
    startPoint: [-65, 0, -35],
    endPoint: [75, 0, -38],
    speed: 0.8,
    debugColor: '#ff6b6b'
  })

  // Route 2: Walker on far road (right to left)
  routes.push({
    id: 101,
    type: 'pedestrian',
    startPoint: [70, 0, -42],
    endPoint: [-60, 0, -40],
    speed: 0.7,
    debugColor: '#4ecdc4'
  })

  // Route 3: Jogger on beachfront path (if ocean exists)
  routes.push({
    id: 102,
    type: 'pedestrian',
    startPoint: [60, 0, -25],
    endPoint: [-55, 0, -22],
    speed: 1.1,
    debugColor: '#ffe66d'
  })

  // Route 4: Slow walker in park area (foreground)
  routes.push({
    id: 103,
    type: 'pedestrian',
    startPoint: [-45, 0, 15],
    endPoint: [50, 0, 18],
    speed: 0.5,
    debugColor: '#a29bfe'
  })

  // === VEHICLE ROUTES ===
  // Vehicles on distant roads (faster, more visible from office)

  // Route 5: Car on highway (back)
  routes.push({
    id: 200,
    type: 'vehicle',
    startPoint: [-80, 0, -45],
    endPoint: [90, 0, -48],
    speed: 2.5,
    debugColor: '#fd79a8'
  })

  // Route 6: Motorcycle on road (diagonal)
  routes.push({
    id: 201,
    type: 'vehicle',
    startPoint: [85, 0, -30],
    endPoint: [-70, 0, -35],
    speed: 1.8,
    debugColor: '#00b894'
  })

  // Route 7: Bicycle on path
  routes.push({
    id: 202,
    type: 'vehicle',
    startPoint: [-50, 0, 12],
    endPoint: [55, 0, 10],
    speed: 1.3,
    debugColor: '#e17055'
  })

  // === ANIMAL ROUTES ===
  // Birds, wildlife crossing overhead or in distance

  // Route 8: Bird flock (overhead arc)
  routes.push({
    id: 300,
    type: 'animal',
    startPoint: [-40, 25, -20],
    endPoint: [45, 30, -25],
    speed: 1.4,
    debugColor: '#74b9ff'
  })

  // Route 9: Bird (opposite direction)
  routes.push({
    id: 301,
    type: 'animal',
    startPoint: [50, 28, -15],
    endPoint: [-45, 24, -22],
    speed: 1.2,
    debugColor: '#81ecec'
  })

  // Route 10: Wildlife in distance
  routes.push({
    id: 302,
    type: 'animal',
    startPoint: [-55, 0, -50],
    endPoint: [60, 0, -55],
    speed: 0.6,
    debugColor: '#fab1a0'
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
