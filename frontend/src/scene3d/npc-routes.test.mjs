import test from 'node:test'
import assert from 'node:assert/strict'
import { createNpcRoute, sampleNpcRoute, isCustomerAtStall } from './npc-routes.ts'

const layout = {
  building: { minX: -9.5 }, sideLaneX: -10.15, gangCenterX: -11.4,
  baksoCart: [-11.9, 0, -2.3], kopiBike: [-11.9, 0, 1.6],
}

test('pedestrians walk on the sidewalk in front of the office and keep looping', () => {
  // Extended pedestrian IDs: 0-3 and 6-9 (8 pedestrians total)
  const pedestrianIds = [0, 1, 2, 3, 6, 7, 8, 9]
  const routes = pedestrianIds.map(id => createNpcRoute(layout, id))
  assert.equal(new Set(routes.map(route => JSON.stringify(route.points))).size, pedestrianIds.length, 'all eight pedestrians need distinct routes')
  for (const route of routes) {
    assert.equal(route.stall, null)
    assert.ok(route.points.every(p => p[2] >= 5.5 && p[0] >= layout.building.minX - 1.5 && p[0] <= 15.5))
    const samples = [0, 2, 20, 40, 80].map(second => sampleNpcRoute(route, second))
    assert.ok(samples.some((sample, index) => index > 0 && Math.hypot(sample.position[0] - samples[index - 1].position[0], sample.position[2] - samples[index - 1].position[2]) > 0.1), 'NPC should keep moving after completing a loop')
    assert.ok(samples.every(sample => sample.position[2] >= 5.5), 'NPC must remain on the front sidewalk')
  }
  assert.notDeepEqual(sampleNpcRoute(routes[0], 2).position, sampleNpcRoute(routes[1], 2).position)
})

test('pedestrians still move after several laps and wrap continuously', () => {
  for (const id of [0, 1, 2, 3, 6, 7, 8, 9]) {
    const route = createNpcRoute(layout, id)
    for (const second of [35, 55, 85, 119, 130, 240]) {
      const a = sampleNpcRoute(route, second)
      const b = sampleNpcRoute(route, second + 0.25)
      assert.equal(a.isMoving, true)
      assert.ok(Math.hypot(b.position[0] - a.position[0], b.position[2] - a.position[2]) > 0.05, `NPC ${id} stuck at ${second}s`)
    }
    const perimeter = route.points.reduce((sum, p, i) => {
      const next = route.points[(i + 1) % route.points.length]
      return sum + Math.hypot(next[0] - p[0], next[2] - p[2])
    }, 0)
    const speed = 1.8 + ((Math.sin(id * 12.9898) * 43758.5453) % 1 + 1) % 1
    const before = sampleNpcRoute(route, perimeter / speed - 0.01)
    const after = sampleNpcRoute(route, perimeter / speed + 0.01)
    assert.ok(Math.hypot(after.position[0] - before.position[0], after.position[2] - before.position[2]) < 0.1, 'wrap must not teleport')
  }
})

test('shopper is placed beside the vendor in the alley, not on the front sidewalk', () => {
  const route = createNpcRoute(layout, 4)
  assert.ok(route.points[1][2] < 5.5)
  assert.equal(route.stall, 'bakso')
})

test('shoppers arrive, pause at their assigned stall, then leave', () => {
  for (const id of [4, 5]) {
    const route = createNpcRoute(layout, id)
    assert.equal(route.stall, id === 4 ? 'bakso' : 'kopi')
    const samples = Array.from({ length: 180 }, (_, second) => sampleNpcRoute(route, second))
    // There must be at least one moment where they are walking towards/away from stall
    assert.ok(samples.some(sample => !sample.buying), `shopper ${id} must have walking time`)
    // There must be at least one moment where they are paused buying
    assert.ok(samples.some(sample => sample.buying), `shopper ${id} must pause to buy`)
    // They must always stay outdoors (outside building)
    assert.ok(samples.every(sample => sample.position[0] <= layout.building.minX - 0.4 || sample.position[2] >= 5.5))
  }
})

test('office customer only triggers serving after physically arriving at the stall', () => {
  const stand = [layout.baksoCart[0] + 1.2, 0, layout.baksoCart[2] + 1.5]
  assert.equal(isCustomerAtStall(stand, layout.baksoCart), true)
  assert.equal(isCustomerAtStall([0, 0, 0], layout.baksoCart), false)
  assert.equal(isCustomerAtStall(stand, layout.kopiBike), false)
})
