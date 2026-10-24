import { useMemo, useEffect, useRef } from 'react'
import * as THREE from 'three'
import { RBox } from './props.tsx'

export interface CityBlocksProps {
  /** Mode malam vs siang */
  night?: boolean
}

// Deterministic PRNG so the city is stable between renders.
function mulberry(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface BuildingSpec {
  x: number; z: number; w: number; d: number; h: number
  ring: 1 | 2 | 3
  kind: 'house' | 'ruko' | 'tower'
}

const OFFICE = { minX: -10.5, maxX: 16.5, minZ: -6.2, maxZ: 5.2 }
const ROAD_Z = 13.1        // main road along X (existing)
const ROAD_X = 24          // cross road along Z, east of the office

function generateCity(): BuildingSpec[] {
  const rand = mulberry(20261023)
  const list: BuildingSpec[] = []

  const tooCloseToOffice = (x: number, z: number, w: number, d: number) =>
    x + w / 2 > OFFICE.minX - 2 && x - w / 2 < OFFICE.maxX + 2 &&
    z + d / 2 > OFFICE.minZ - 2 && z - d / 2 < OFFICE.maxZ + 2

  // Grid of lots in all directions; skip lots colliding with office or roads.
  // Denser small lots near the office (houses/ruko), coarser big lots far away.
  for (let gx = -10; gx <= 10; gx++) {
    for (let gz = -9; gz <= 9; gz++) {
      const radial = Math.sqrt(gx * gx + gz * gz)
      const lotPitch = radial < 26 ? 7.2 : radial < 48 ? 10 : 13.5
      const lotJitter = radial < 26 ? 1.4 : 2.4
      const cx = gx * lotPitch + (rand() - 0.5) * lotJitter * 2
      const cz = gz * lotPitch + (rand() - 0.5) * lotJitter * 2
      const dist = Math.hypot(cx - 3, cz)
      if (dist < 12) continue // keep the office surroundings airy

      const w = (radial < 26 ? 5 + rand() * 2.5 : 6 + rand() * 4)
      const d = (radial < 26 ? 5 + rand() * 2.5 : 6 + rand() * 4)

      if (tooCloseToOffice(cx, cz, w, d)) continue
      // keep road corridors clear (main road along X at Z=13.1, cross road along Z at X=24)
      if (Math.abs(cz - ROAD_Z) < 7.5 && Math.abs(cx) < 110) continue
      if (Math.abs(cx - ROAD_X) < 7.5 && Math.abs(cz) < 110) continue

      let ring: 1 | 2 | 3 = 3
      let h: number
      let kind: BuildingSpec['kind']
      if (dist < 30) { ring = 1; h = 3 + rand() * 2.5; kind = rand() > 0.4 ? 'ruko' : 'house' }
      else if (dist < 60) { ring = 2; h = 8 + rand() * 7; kind = rand() > 0.35 ? 'ruko' : 'tower' }
      else { ring = 3; h = 16 + rand() * 14; kind = 'tower' }

      list.push({ x: cx, z: cz, w, d, h, ring, kind })
    }
  }
  return list
}

// The palette builder must stay deterministic per building index; the same hashing is
// used for grouped instance colors so the visual distribution is identical to before.
const paletteFor = (ring: 1 | 2 | 3, idx: number, night: boolean): string => {
  const p = {
    1: night ? ['#53647a', '#5e7188', '#495e74', '#68788c'] : ['#d8d4cc', '#c9c4ba', '#d2cbbf', '#c0bbaf'],
    2: night ? ['#42546b', '#485d78', '#3d5066'] : ['#cfc9c0', '#c2bcb2', '#cbc5ba'],
    3: night ? ['#34475f', '#3b5068', '#2f4359'] : ['#b9b4ac', '#b3aea6', '#bfbab2'],
  }[ring]
  return p[idx % p.length]
}

/** One batch of instanced boxes: shared geometry, per-instance world transform, optional per-instance tint color. */
function InstancedBoxes({ geometry, instances, color }: {
  geometry: THREE.BufferGeometry
  instances: { pos: [number, number, number]; size: [number, number, number]; rotY?: number; tint?: string }[]
  color?: string
}) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const count = instances.length

  useEffect(() => {
    const mesh = ref.current
    if (!mesh || count === 0) return
    const dummy = new THREE.Object3D()
    // Per-instance tint only when any instance carries a tint, keeps windows/roofs uniform.
    if (instances.some((instance) => instance.tint)) {
      const tint = new THREE.Color()
      for (let i = 0; i < count; i++) {
        mesh.setColorAt(i, tint.set(instances[i].tint ?? '#ffffff'))
      }
      mesh.instanceColor!.needsUpdate = true
    }
    for (let i = 0; i < count; i++) {
      const instance = instances[i]
      dummy.position.set(instance.pos[0], instance.pos[1], instance.pos[2])
      dummy.scale.set(instance.size[0], instance.size[1], instance.size[2])
      dummy.rotation.set(0, instance.rotY ?? 0, 0)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [instances, count])

  if (count === 0) return null
  return <instancedMesh ref={ref} args={[geometry, undefined, count]} frustumCulled={false}>
    <meshStandardMaterial color={color ?? '#ffffff'} roughness={0.7} metalness={0} transparent={false} />
  </instancedMesh>
}

/** Simple box geometry, cached per size set. */
const boxGeoCache = new Map<string, THREE.BoxGeometry>()
function boxGeometry(size: [number, number, number]): THREE.BoxGeometry {
  const key = size.join(',')
  let geometry = boxGeoCache.get(key)
  if (!geometry) {
    geometry = new THREE.BoxGeometry(size[0], size[1], size[2])
    boxGeoCache.set(key, geometry)
  }
  return geometry
}

export function CityBlocks({ night = false }: CityBlocksProps) {
  const buildings = useMemo(generateCity, [])

  // Collect instanced batches in a single pass over the stable building list.
  const batches = useMemo(() => {

    const windowLit: { pos: [number, number, number]; size: [number, number, number] }[] = []
    const windowDark: { pos: [number, number, number]; size: [number, number, number] }[] = []
    const bigWindowLit: { pos: [number, number, number]; size: [number, number, number] }[] = []
    const bigWindowDark: { pos: [number, number, number]; size: [number, number, number] }[] = []
    const bodies: { pos: [number, number, number]; size: [number, number, number]; tint: string }[] = []
    const roofs: { pos: [number, number, number]; size: [number, number, number]; tint: string }[] = []
    const signs: { pos: [number, number, number]; size: [number, number, number]; tint: string }[] = []

    buildings.forEach((b, i) => {
      const color = paletteFor(b.ring, i, night)
      const floors = Math.max(1, Math.round(b.h / 3))
      const isShop = b.kind === 'ruko'
      const cols = Math.max(1, Math.floor(b.w / 2.2))
      for (let f = 0; f < floors; f++) {
        for (let c = 0; c < cols; c++) {
          const wx = (c - (cols - 1) / 2) * (b.w / (cols + 0.4))
          const wy = 1.2 + f * (b.h / floors)
          if (wy > b.h - 0.6) continue
          const lit = night && (i * 7 + f * 3 + c) % 5 !== 0
          const sizeT = [isShop && f === 0 ? 1.4 : 0.7, isShop && f === 0 ? 1.1 : 0.75, 0.02] as [number, number, number]
          for (const side of [-1, 1]) {
            const pos: [number, number, number] = [b.x + wx, wy, b.z + side * (b.d / 2 + 0.04)]
            if (isShop && f === 0) (lit ? bigWindowLit : bigWindowDark).push({ pos, size: sizeT })
            else (lit ? windowLit : windowDark).push({ pos, size: sizeT })
          }
        }
      }
      // Ring 1-2 keep separate rounded RBox (drawn individually later); ring 3 instanced.
      if (b.ring === 3) {
        bodies.push({ pos: [b.x, b.h / 2, b.z], size: [b.w, b.h, b.d], tint: color })
        roofs.push({ pos: [b.x, b.h + 0.12, b.z], size: [b.w - 0.3, 0.3, b.d - 0.3], tint: night ? '#101822' : '#968e82' })
      }
      if (isShop) {
        signs.push({ pos: [b.x, Math.min(2.6, b.h * 0.55), b.z + b.d / 2 + 0.08], size: [b.w * 0.8, 0.45, 0.06], tint: night ? ['#e0564b', '#2f9e6e', '#d89b2c', '#3f7fc1'][i % 4] : ['#c94b40', '#2b8a60', '#c08d26', '#3670ad'][i % 4] })
      }
    })

    return {
      windowLit, windowDark, bigWindowLit, bigWindowDark,
      bodies, roofs, signs,
      nearBuildings: buildings.filter((b) => b.ring !== 3),
    }
  }, [buildings, night])

  const ground = night ? '#1c242e' : '#8a927a'
  const winLitGeo = useMemo(() => boxGeometry([0.7, 0.75, 0.02]), [])
  const winDarkGeo = winLitGeo
  const bigWinLibGeo = useMemo(() => boxGeometry([1.4, 1.1, 0.02]), [])
  const bodyGeo = useMemo(() => boxGeometry([1, 1, 1]), []) // scaled per-instance
  const roofGeo = useMemo(() => boxGeometry([1, 1, 1]), [])
  const signGeo = useMemo(() => boxGeometry([1, 1, 1]), [])

  return <group>
    {/* Vast city ground */}
    <RBox position={[0, -0.12, 0]} size={[520, 0.12, 420]} radius={0} color={ground} roughness={1} shadow={false}/>

    {/* Instanced windows (2 faces × lit/dark) - the entire city's windows in 1-2 draw calls */}
    <InstancedBoxes geometry={winLitGeo} color={night ? '#ffcf7d' : '#a8c4dc'} instances={batches.windowLit} />
    <InstancedBoxes geometry={winDarkGeo} color={night ? '#0d1520' : '#9fb8cf'} instances={batches.windowDark} />
    <InstancedBoxes geometry={bigWinLibGeo} color={night ? '#ffcf7d' : '#8dafc9'} instances={batches.bigWindowLit} />
    <InstancedBoxes geometry={bigWinLibGeo} color={night ? '#0d1520' : '#8dafc9'} instances={batches.bigWindowDark} />

    {/* Far (ring 3) building bodies & roofs - instanced */}
    <InstancedBoxes geometry={bodyGeo} instances={batches.bodies} />
    <InstancedBoxes geometry={roofGeo} instances={batches.roofs} />

    {/* Ruko signage - instanced */}
    <InstancedBoxes geometry={signGeo} instances={batches.signs} />

    // Near buildings (ring 1-2) stay individual RBox for bevels and detail
    {batches.nearBuildings.map((b) => {
      const abs = buildings.indexOf(b)
      const pal = b.ring === 1
        ? (night ? ['#53647a', '#5e7188', '#495e74', '#68788c'] : ['#d8d4cc', '#c9c4ba', '#d2cbbf', '#c0bbaf'])
        : (night ? ['#42546b', '#485d78', '#3d5066'] : ['#cfc9c0', '#c2bcb2', '#cbc5ba'])
      const color = pal[abs % pal.length]
      return <group key={`near${abs}`} position={[b.x, 0, b.z]}>
        <RBox position={[0, b.h / 2, 0]} size={[b.w, b.h, b.d]} radius={0.08} color={color} roughness={0.9} shadow={false}/>
        <RBox position={[0, b.h + 0.12, 0]} size={[b.w - 0.3, 0.3, b.d - 0.3]} radius={0.05} color={night ? '#101822' : '#968e82'} roughness={1} shadow={false}/>
      </group>
    })}

    {/* Parked cars on the FAR shoulder */}
    {[[-30, 17.8], [-16, 17.8], [2, 17.8], [17, 17.8], [34, 17.8], [46, 17.8]].map(([x, z], i) => (
      <group key={`car${i}`} position={[x, 0, z]} rotation={[0, i % 2 ? Math.PI : 0, 0]}>
        <RBox position={[0, 0.55, 0]} size={[1.7, 0.55, 3.6]} radius={0.18} color={[['#b84a3c', '#3c7ab8', '#c9a13c', '#4a9e5c', '#777f88', '#8a5cb8'][i]][0]} roughness={0.35} metalness={0.35} shadow={false}/>
        <RBox position={[0, 1.05, -0.2]} size={[1.5, 0.5, 1.8]} radius={0.14} color="#22303c" roughness={0.2} metalness={0.4} shadow={false}/>
        <RBox position={[0, 0.3, 1.85]} size={[1.3, 0.18, 0.06]} radius={0.02} color={night ? '#ffe9a8' : '#d8dce0'} emissive={night ? '#ffdf90' : '#000000'} emissiveIntensity={night ? 0.7 : 0} shadow={false}/>
      </group>
    ))}

    {/* Street lamps along the main road and cross road */}
    {[-56, -42, -28, -12, 4, 20, 36, 50, 64].map((x, i) => (
      <group key={`lampX${i}`} position={[x, 0, ROAD_Z + 5]}>
        <RBox position={[0, 1.6, 0]} size={[0.22, 3.2, 0.22]} radius={0.05} color="#39404a" roughness={0.7} shadow={false}/>
        <RBox position={[0, 3.3, -0.5]} size={[0.5, 0.14, 1.1]} radius={0.05} color="#39404a" roughness={0.7} shadow={false}/>
        <RBox position={[0, 3.16, -1]} size={[0.42, 0.14, 0.42]} radius={0.06} color={night ? '#ffe9a8' : '#2a2d31'} emissive={night ? '#ffdf90' : '#000000'} emissiveIntensity={night ? 1 : 0} roughness={0.5} shadow={false}/>
      </group>
    ))}
    {[-48, -24, 0, 24, 48, 72].map((z, i) => (
      <group key={`lampZ${i}`} position={[ROAD_X + 5, 0, z]}>
        <RBox position={[0, 1.6, 0]} size={[0.22, 3.2, 0.22]} radius={0.05} color="#39404a" roughness={0.7} shadow={false}/>
        <RBox position={[-0.5, 3.3, 0]} size={[1.1, 0.14, 0.5]} radius={0.05} color="#39404a" roughness={0.7} shadow={false}/>
        <RBox position={[-1, 3.16, 0]} size={[0.42, 0.14, 0.42]} radius={0.06} color={night ? '#ffe9a8' : '#2a2d31'} emissive={night ? '#ffdf90' : '#000000'} emissiveIntensity={night ? 1 : 0} roughness={0.5} shadow={false}/>
      </group>
    ))}

    {/* Trees: behind the office lawn or along the FAR sidewalk across the road */}
    {Array.from({ length: 30 }, (_, i) => {
      const rand = mulberry(9000 + i)
      const behind = i % 2 === 0
      const x = -78 + i * 5.4 + rand() * 3
      if (Math.abs(x - ROAD_X) < 6.5) return null // keep the cross road clear
      const z = behind ? -(9.5 + rand() * 2.5) : 19 + rand() * 2
      const s = 0.9 + rand() * 0.5
      return <group key={`tr${i}`} position={[x, 0, z]} scale={s}>
        <RBox position={[0, 0.5, 0]} size={[0.35, 1, 0.35]} radius={0.06} color="#5b4636" roughness={1} shadow={false}/>
        <RBox position={[0, 1.7, 0]} size={[1.5, 1.5, 1.5]} radius={0.4} color={night ? '#1e4629' : '#3e8e4e'} roughness={1} shadow={false}/>
        <RBox position={[0, 2.6, 0]} size={[0.9, 0.8, 0.9]} radius={0.3} color={night ? '#265634' : '#4fa65c'} roughness={1} shadow={false}/>
      </group>
    })}
  </group>
}
