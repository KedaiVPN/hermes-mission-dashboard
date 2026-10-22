import { useMemo } from 'react'
import { RBox } from './props.tsx'
import type { Vec3 } from '../office3d-layout.ts'

export interface LayeredMountainRange {
  /** Distance layer (1 = closest, 5 = farthest) */
  layer: 1 | 2 | 3 | 4 | 5
  /** Position in world (y is always 0, height handled internally) */
  position: Vec3
  /** Visible height (scales with layer) */
  height: number
  /** Base width */
  baseWidth: number
  /** Base depth */
  baseDepth: number
  /** Base color */
  baseColor: string
  /** Peak color */
  peakColor: string
  /** Opacity multiplier (0-1) */
  opacity: number
}

/**
 * Generate a wide layered mountain chain so the office feels like it sits in a
 * semi-open-world valley instead of in a closed box. The ranges deliberately
 * span beyond the camera bounds so the left and right sides never feel capped.
 */
export function generateLayeredMountainRanges(buildingMinX: number): LayeredMountainRange[] {
  const ranges: LayeredMountainRange[] = []
  const shift = buildingMinX + 9.5

  const add = (
    layer: LayeredMountainRange['layer'],
    position: Vec3,
    height: number,
    baseWidth: number,
    baseDepth: number,
    baseColor: string,
    peakColor: string,
    opacity: number,
  ) => {
    ranges.push({ layer, position, height, baseWidth, baseDepth, baseColor, peakColor, opacity })
  }

  // Layer 1: close hills that peek just above the office.
  ;([
    [-84 + shift, 0, -42, 15, 26, 20],
    [-56 + shift, 0, -46, 18, 28, 22],
    [-24 + shift, 0, -44, 16, 24, 18],
    [8 + shift, 0, -45, 19, 28, 22],
    [38 + shift, 0, -43, 15, 24, 18],
    [68 + shift, 0, -47, 17, 26, 20],
  ] as const).forEach(([x, y, z, h, w, d]) => add(1, [x, y, z], h, w, d, '#16341f', '#335d3f', 0.96))

  // Layer 2: main mountain wall behind the office.
  ;([
    [-96 + shift, 0, -58, 25, 34, 26],
    [-60 + shift, 0, -62, 32, 40, 28],
    [-18 + shift, 0, -60, 28, 36, 28],
    [22 + shift, 0, -64, 35, 40, 30],
    [58 + shift, 0, -61, 27, 34, 26],
    [94 + shift, 0, -59, 30, 38, 28],
  ] as const).forEach(([x, y, z, h, w, d]) => add(2, [x, y, z], h, w, d, '#21412b', '#4f8758', 0.84))

  // Layer 3: broader distant chain.
  ;([
    [-108 + shift, 0, -76, 24, 46, 34],
    [-52 + shift, 0, -81, 30, 52, 36],
    [8 + shift, 0, -79, 27, 48, 34],
    [64 + shift, 0, -84, 32, 54, 38],
    [118 + shift, 0, -80, 25, 46, 34],
  ] as const).forEach(([x, y, z, h, w, d]) => add(3, [x, y, z], h, w, d, '#36563d', '#7ab385', 0.62))

  // Layer 4: very distant silhouettes near the horizon.
  ;([
    [-122 + shift, 0, -102, 20, 62, 40],
    [-40 + shift, 0, -108, 23, 68, 44],
    [48 + shift, 0, -110, 22, 66, 42],
    [132 + shift, 0, -106, 20, 62, 40],
  ] as const).forEach(([x, y, z, h, w, d]) => add(4, [x, y, z], h, w, d, '#4b6f57', '#bddfbe', 0.40))

  // Layer 5: ghost range to sell the infinite backdrop.
  ;([
    [-136 + shift, 0, -128, 16, 86, 52],
    [-20 + shift, 0, -134, 18, 94, 56],
    [98 + shift, 0, -130, 17, 88, 54],
  ] as const).forEach(([x, y, z, h, w, d]) => add(5, [x, y, z], h, w, d, '#6d8b7d', '#edf8ef', 0.23))

  return ranges
}

function LayeredMountain({ range }: { range: LayeredMountainRange }) {
  const { layer, position, height, baseWidth, baseDepth, baseColor, peakColor, opacity } = range

  const tierCount = Math.max(4, 7 - layer)
  const tierHeight = height / tierCount
  const taperFactor = 0.26 + (layer - 1) * 0.12

  return (
    <group position={position}>
      {Array.from({ length: tierCount }).map((_, tierIndex) => {
        const tierY = tierIndex * tierHeight + tierHeight / 2
        const progress = tierIndex / Math.max(1, tierCount - 1)
        const scale = 1 - progress * taperFactor
        const tierWidth = baseWidth * scale
        const tierDepth = baseDepth * scale
        const color = progress < 0.72 ? baseColor : peakColor

        return (
          <RBox
            key={tierIndex}
            position={[0, tierY, 0]}
            size={[tierWidth, tierHeight, tierDepth]}
            radius={0.08 + layer * 0.03}
            color={color}
            roughness={0.94}
            opacity={opacity}
            shadow={layer <= 2}
          />
        )
      })}
    </group>
  )
}

/** Render the complete layered mountain backdrop */
export function LayeredMountains({ buildingMinX = -9.5 }: { buildingMinX?: number }) {
  const ranges = useMemo(() => generateLayeredMountainRanges(buildingMinX), [buildingMinX])

  return (
    <group>
      {ranges.map((range, index) => (
        <LayeredMountain key={index} range={range} />
      ))}
    </group>
  )
}
