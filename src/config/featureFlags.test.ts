import { describe, expect, it } from 'vitest'
import { readNewmarketRoadProfileFlag } from './featureFlags'

describe('feature flags', () => {
  it('only enables the Newmarket road profile for the exact true string', () => {
    expect(readNewmarketRoadProfileFlag({ VITE_NEWMARKET_ROAD_PROFILE_ENABLED: 'true' })).toBe(true)
    expect(readNewmarketRoadProfileFlag({ VITE_NEWMARKET_ROAD_PROFILE_ENABLED: 'false' })).toBe(false)
    expect(readNewmarketRoadProfileFlag({})).toBe(false)
    expect(readNewmarketRoadProfileFlag({ VITE_NEWMARKET_ROAD_PROFILE_ENABLED: 'TRUE' })).toBe(false)
  })
})
