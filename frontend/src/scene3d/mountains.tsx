import { useMemo } from 'react'
import { RBox } from './props.tsx'
import { getMountainPeaks, MOUNTAIN_COLORS } from './mountains-data.ts'
import type { Vec3 } from '../office3d-layout.ts'

/**
 * Render a single mountain peak as stacked tiers of voxel blocks.
 * Each tier steps inward as it goes up, creating a natural terraced mountain.
 */
function MountainPeak({ position, height, tiers, baseSize, colorScheme, opacity = 1 }: {
  position: Vec3
  height: number
  tiers: number
  baseSize: [number, number]
  colorScheme: 'forest' | 'stone' | 'snowy'
  opacity?: number
}) {
  const [baseX, baseZ] = baseSize
  const tierHeight = height / tiers
  const colorPalette = MOUNTAIN_COLORS[colorScheme]

  return (
    <group position={position}>
      {Array.from({ length: tiers }).map((_, tierIndex) => {
        const tierY = tierIndex * tierHeight + tierHeight / 2
        // Taper inward as we go up: each tier is 15% smaller
        const scale = 1 - (tierIndex / tiers) * 0.25
        const tierW = baseX * scale
        const tierZ = baseZ * scale
        
        // Alternate between base, mid, top colors across the tiers
        let colorIndex = tierIndex < tiers / 2 ? 0 : tierIndex < (2 * tiers) / 3 ? 1 : 2
        if (colorIndex >= colorPalette.base.length) colorIndex = colorPalette.base.length - 1
        
        const color = tierIndex < tiers / 3 
          ? colorPalette.base[Math.min(colorIndex, colorPalette.base.length - 1)]
          : tierIndex < (2 * tiers) / 3
            ? colorPalette.mid[Math.min(colorIndex, colorPalette.mid.length - 1)]
            : colorPalette.top[Math.min(colorIndex, colorPalette.top.length - 1)]

        return (
          <RBox
            key={tierIndex}
            position={[0, tierY, 0]}
            size={[tierW, tierHeight, tierZ]}
            radius={0.1}
            color={color}
            roughness={0.95}
            shadow={false}
            opacity={opacity}
          />
        )
      })}
    </group>
  )
}

/**
 * Render the complete mountain landscape surrounding the office.
 * Mountains are procedurally generated voxel peaks in back, left, and right zones.
 */
export function Mountains({ buildingMinX = -9.5 }: { buildingMinX?: number }) {
  const peaks = useMemo(() => getMountainPeaks(buildingMinX), [buildingMinX])

  return (
    <group>
      {peaks.map((peak, index) => (
        <MountainPeak
          key={index}
          position={peak.position}
          height={peak.height}
          tiers={peak.tiers}
          baseSize={peak.baseSize}
          colorScheme={peak.colorScheme}
          opacity={peak.opacity}
        />
      ))}
    </group>
  )
}
