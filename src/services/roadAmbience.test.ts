import { describe, expect, it } from 'vitest'
import { roadAmbienceGain } from './roadAmbience'

describe('road ambience', () => {
  it('stays silent while stopped or inactive', () => {
    expect(roadAmbienceGain(0, true)).toBe(0)
    expect(roadAmbienceGain(50, false)).toBe(0)
  })

  it('remains subtle and increases with road speed', () => {
    expect(roadAmbienceGain(20, true)).toBeLessThan(roadAmbienceGain(100, true))
    expect(roadAmbienceGain(140, true)).toBeLessThanOrEqual(0.026)
  })
})
