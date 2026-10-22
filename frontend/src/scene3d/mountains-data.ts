import type { Vec3 } from '../office3d-layout.ts'

export interface MountainPeak {
  position: Vec3
  height: number
  tiers: number
  baseSize: [number, number]
  colorScheme: 'forest' | 'stone' | 'snowy'
}

/**
 * Generate mountain peak definitions for the landscape.
 * Mountains frame the office: back (north) only, green and natural.
 */
export function getMountainPeaks(_buildingMinX: number): MountainPeak[] {
  const peaks: MountainPeak[] = []

  // Four focal mountain peaks behind the office, lush green forest style
  const backRange = [
    { x: -25, z: -48, h: 24, tiers: 5, scheme: 'forest' },
    { x: 0, z: -52, h: 28, tiers: 6, scheme: 'forest' },
    { x: 20, z: -45, h: 22, tiers: 5, scheme: 'forest' },
    { x: 35, z: -50, h: 26, tiers: 6, scheme: 'forest' },
  ]

  // Compile only back peaks
  for (const p of backRange) {
    peaks.push({
      position: [p.x, 0, p.z],
      height: p.h,
      tiers: p.tiers,
      baseSize: [
        10 + p.h * 0.25,   // narrower base for cleaner silhouette
        10 + p.h * 0.25,
      ],
      colorScheme: p.scheme as 'forest' | 'stone' | 'snowy',
    })
  }

  return peaks
}

/** Color palette for mountain tiers - lush green nature shades */
export const MOUNTAIN_COLORS = {
  forest: {
    base: ['#1c381f', '#234426', '#2a4f2e'],      // Deep rich forest green
    mid: ['#35613a', '#3f7345', '#4a8251'],       // Mid mountain green
    top: ['#56965e', '#67a86f', '#78ba80'],       // Lush high-altitude green
  },
  stone: {
    base: ['#234426', '#2a4f2e', '#35613a'],
    mid: ['#3f7345', '#4a8251', '#56965e'],
    top: ['#67a86f', '#78ba80', '#89cb91'],
  },
  snowy: {
    base: ['#2a4f2e', '#35613a', '#3f7345'],
    mid: ['#4a8251', '#56965e', '#67a86f'],
    top: ['#89cb91', '#b2e2b8', '#d5f5da'],
  },
}
