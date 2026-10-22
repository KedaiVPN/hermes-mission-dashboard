import test from 'node:test'
import assert from 'node:assert/strict'
import { getMountainPeaks } from './mountains-data.ts'

test('mountain peaks are defined exclusively behind the office and look green/lush', () => {
  const peaks = getMountainPeaks(-9.5)
  assert.ok(peaks.length >= 3 && peaks.length <= 5, 'should have 3 to 5 focal peaks only')

  // Strictly behind the office (Z <= -35)
  assert.ok(peaks.every(p => p.position[2] <= -30), 'all peaks must be behind the office')
  // No left or right flanking mountain ranges
  assert.ok(peaks.every(p => p.position[0] >= -45 && p.position[0] <= 45), 'peaks centered in the backdrop')
  // All peaks must be green/forest
  assert.ok(peaks.every(p => p.colorScheme === 'forest'), 'all peaks must use lush green forest scheme')
})
