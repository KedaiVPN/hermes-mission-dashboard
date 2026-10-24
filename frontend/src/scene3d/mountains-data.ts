import type { Vec3 } from '../office3d-layout.ts'

export interface MountainPeak {
  position: Vec3
  height: number
  tiers: number
  baseSize: [number, number]
  colorScheme: 'forest' | 'stone' | 'snowy'
  opacity?: number
}

/**
 * Generate mountain peak definitions for the landscape.
 * Mountains frame the office: back (north) only, far away for atmospheric perspective.
 */
export function getMountainPeaks(_buildingMinX: number): MountainPeak[] {
  const peaks: MountainPeak[] = []

  // Five focal mountain peaks far behind the office (Z -100 to -160), lush green forest style.
  // Peaks are larger and positioned at atmospheric distance to create sense of expansive valley.
  const backRange = [
    { x: -50, z: -120, h: 48, tiers: 7, scheme: 'forest', opacity: 0.92 },
    { x: -10, z: -145, h: 55, tiers: 8, scheme: 'forest', opacity: 0.88 },
    { x: 25, z: -135, h: 50, tiers: 7, scheme: 'forest', opacity: 0.90 },
    { x: 60, z: -150, h: 52, tiers: 8, scheme: 'forest', opacity: 0.86 },
    { x: 90, z: -125, h: 46, tiers: 7, scheme: 'forest', opacity: 0.91 },
  ]

  // Compile only back peaks
  for (const p of backRange) {
    peaks.push({
      position: [p.x, 0, p.z],
      height: p.h,
      tiers: p.tiers,
      baseSize: [
        16 + p.h * 0.35,   // larger base for distant prominence
        14 + p.h * 0.30,
      ],
      colorScheme: p.scheme as 'forest' | 'stone' | 'snowy',
      opacity: p.opacity,
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
