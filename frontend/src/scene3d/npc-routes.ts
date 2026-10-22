import type { Vec3 } from '../office3d-layout.ts'

/** Deterministic pseudo-random from integer seed pair. */
function jitter(seed1: number, seed2: number): number {
  const x = Math.sin(seed1 * 12.9898 + seed2 * 78.233) * 43758.5453
  return x - Math.floor(x)
}

export interface NPCRoute {
  /** Unique ID (200–399 for pedestrians, 4–5 for shoppers) */
  id: number
  /** If null, this is a pedestrian with no shopping intent. Otherwise 'bakso' or 'kopi'. */
  stall: 'bakso' | 'kopi' | null
  /** Cyclic waypoints to walk through */
  points: Vec3[]
}

export interface RouteSample {
  position: Vec3
  /** True if the NPC is pausing at a stall to buy */
  buying: boolean
  /** True if the NPC is actively moving (walking) */
  isMoving: boolean
  /** Heading in radians (for rotation) */
  heading: number
}

/**
 * Create a repeatable NPC route based on seed.
 * IDs 0–3, 6–9 are pedestrians on the front sidewalk (no stall)
 * IDs 4–5 are shoppers (assigned to bakso & kopi respectively)
 */
export function createNpcRoute(
  layout: { building: { minX: number }; sideLaneX: number; gangCenterX: number; baksoCart: Vec3; kopiBike: Vec3 },
  seed: number
): NPCRoute {
  const isShopper = seed === 4 || seed === 5
  const stall = seed === 4 ? 'bakso' : seed === 5 ? 'kopi' : null

  // Pedestrian path: strictly in front of the office along the sidewalk / road (z >= 5.5)
  // Extended to support 8 pedestrians (IDs 0-3, 6-9) with varied routes
  const pedestrianPath = (): Vec3[] => {
    const route = seed >= 6 && seed <= 9 ? seed - 2 : ((seed % 8) + 8) % 8
    const xMin = layout.building.minX - 1
    const xMax = 15.0
    const xMid = (xMin + xMax) / 2
    switch (route) {
      case 0:
        return [
          [xMin, 0, 6.2],
          [xMax, 0, 6.2],
          [xMax, 0, 7.6],
          [xMin, 0, 7.6],
        ]
      case 1:
        return [
          [xMax, 0, 6.0],
          [xMin, 0, 6.0],
          [xMin, 0, 7.5],
          [xMax, 0, 7.5],
        ]
      case 2:
        return [
          [xMin + 1, 0, 5.8],
          [xMid + 2, 0, 5.8],
          [xMid + 2, 0, 7.4],
          [xMin + 1, 0, 7.4],
        ]
      case 3:
        return [
          [xMid - 2, 0, 6.0],
          [xMax - 1, 0, 6.0],
          [xMax - 1, 0, 7.5],
          [xMid - 2, 0, 7.5],
        ]
      case 4: // ID 6 - pedestrian di trotoar (z: 5.5-7.5)
        return [
          [xMin, 0, 5.8],
          [xMax, 0, 5.8],
          [xMax, 0, 7.2],
          [xMin, 0, 7.2],
        ]
      case 5: // ID 7 - pedestrian di trotoar (z: 6.0-7.8)
        return [
          [xMax, 0, 6.2],
          [xMin, 0, 6.2],
          [xMin, 0, 7.8],
          [xMax, 0, 7.8],
        ]
      case 6: // ID 8
        return [
          [xMin + 3, 0, 5.6],
          [xMid, 0, 5.6],
          [xMid, 0, 7.2],
          [xMin + 3, 0, 7.2],
        ]
      case 7: // ID 9
        return [
          [xMid + 1, 0, 6.5],
          [xMax - 2, 0, 6.5],
          [xMax - 2, 0, 7.8],
          [xMid + 1, 0, 7.8],
        ]
      default:
        return [
          [xMid - 2, 0, 6.6],
          [xMax - 1, 0, 6.6],
          [xMax - 1, 0, 8.8],
          [xMid - 2, 0, 8.8],
        ]
    }
  }

  // Shopper path: starts outside, goes to stall, pauses, returns
  const shopperPath = (): Vec3[] => {
    const cartPos = stall === 'bakso' ? layout.baksoCart : layout.kopiBike
    const outside = [layout.sideLaneX - jitter(seed, 200) * 2, 0, -6 + jitter(seed, 201) * 5] as Vec3
    // Customer stands ~1.2m from cart front, 1.5m to the side
    const standAt = [cartPos[0] + 1.2, 0, cartPos[2] + 1.5] as Vec3
    return [outside, standAt, outside]
  }

  return {
    id: seed,
    stall,
    points: isShopper ? shopperPath() : pedestrianPath(),
  }
}

/**
 * Sample an NPC's position and state at a given elapsed time (in seconds).
 * Shoppers spend 7–11 seconds at the stall, then depart.
 */
export function sampleNpcRoute(route: NPCRoute, elapsedSeconds: number): RouteSample {
  const speedMps = 1.8 + jitter(route.id, 0) * 1.0
  const phase = jitter(route.id, 10) * 10

  // Shoppers have a shorter cyclic behavior: walk in -> pause & buy -> walk out -> wait offscreen
  if (route.stall && route.points.length === 3) {
    const pStart = route.points[0]
    const pStall = route.points[1]
    const pEnd = route.points[2]

    const walkInDist = Math.hypot(pStall[0] - pStart[0], pStall[2] - pStart[2])
    const walkInTime = walkInDist / speedMps
    const buyDuration = 8 + jitter(route.id, 11) * 3 // 8 - 11s pause
    const walkOutDist = Math.hypot(pEnd[0] - pStall[0], pEnd[2] - pStall[2])
    const walkOutTime = walkOutDist / speedMps
    const idleOffscreen = 15 // wait 15s before next shopping trip
    const totalCycle = walkInTime + buyDuration + walkOutTime + idleOffscreen

    // A small stagger keeps shoppers from arriving together without skipping their approach.
    const t = ((elapsedSeconds - jitter(route.id, 10) * 2) % totalCycle + totalCycle) % totalCycle

    if (t < walkInTime) {
      // Walking towards stall
      const frac = t / walkInTime
      return {
        position: [pStart[0] + (pStall[0] - pStart[0]) * frac, 0, pStart[2] + (pStall[2] - pStart[2]) * frac],
        heading: Math.atan2(pStall[0] - pStart[0], pStall[2] - pStart[2]),
        buying: false,
        isMoving: true,
      }
    } else if (t < walkInTime + buyDuration) {
      // Standing and buying at stall
      return {
        position: [pStall[0], 0, pStall[2]],
        heading: Math.atan2(-1, 0), // face towards stall (-x)
        buying: true,
        isMoving: false,
      }
    } else if (t < walkInTime + buyDuration + walkOutTime) {
      // Walking back away
      const frac = (t - (walkInTime + buyDuration)) / walkOutTime
      return {
        position: [pStall[0] + (pEnd[0] - pStall[0]) * frac, 0, pStall[2] + (pEnd[2] - pStall[2]) * frac],
        heading: Math.atan2(pEnd[0] - pStall[0], pEnd[2] - pStall[2]),
        buying: false,
        isMoving: true,
      }
    } else {
      // Offscreen waiting
      return {
        position: [pEnd[0], 0, pEnd[2]],
        heading: 0,
        buying: false,
        isMoving: false,
      }
    }
  }

  // Pedestrian cyclic route: calculate exact loop perimeter
  let totalPerimeterMm = 0
  for (let i = 0; i < route.points.length; i++) {
    const p1 = route.points[i]
    const p2 = route.points[(i + 1) % route.points.length]
    totalPerimeterMm += Math.hypot(p2[0] - p1[0], p2[2] - p1[2]) * 1000
  }

  if (totalPerimeterMm <= 0) {
    return { position: route.points[0], heading: 0, buying: false, isMoving: false }
  }

  // Distance along perimeter with continuous wrapping
  const rawDistMm = (elapsedSeconds + phase) * speedMps * 1000
  const distanceMm = ((rawDistMm % totalPerimeterMm) + totalPerimeterMm) % totalPerimeterMm

  let cumulativeMm = 0
  for (let i = 0; i < route.points.length; i++) {
    const p1 = route.points[i]
    const p2 = route.points[(i + 1) % route.points.length]
    const segmentMm = Math.hypot(p2[0] - p1[0], p2[2] - p1[2]) * 1000
    if (cumulativeMm + segmentMm >= distanceMm) {
      const frac = (distanceMm - cumulativeMm) / segmentMm
      return {
        position: [p1[0] + (p2[0] - p1[0]) * frac, 0, p1[2] + (p2[2] - p1[2]) * frac],
        heading: Math.atan2(p2[0] - p1[0], p2[2] - p1[2]),
        buying: false,
        isMoving: true,
      }
    }
    cumulativeMm += segmentMm
  }

  return { position: route.points[0], heading: 0, buying: false, isMoving: false }
}

/**
 * Check if a 3D position is within buying distance (~2.0m) of a stall.
 */
export function isCustomerAtStall(position: Vec3, stallPosition: Vec3): boolean {
  const dx = position[0] - stallPosition[0]
  const dz = position[2] - stallPosition[2]
  return Math.hypot(dx, dz) <= 2.0
}
