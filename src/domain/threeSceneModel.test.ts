import { describe, expect, it } from 'vitest'
import { newmarketRoadProfile } from '../content/roadProfiles/newmarket'
import { createEngine } from './engine'
import { buildRouteSceneModel, buildVisibleScene, validateSceneSlices } from './threeSceneModel'

describe('Three.js scene model', () => {
  it('builds a deterministic serializable model for all seven road templates', () => {
    const first = buildRouteSceneModel({ profile: newmarketRoadProfile, routeId: 'newmarket-teaching-loop-v1' })
    const second = buildRouteSceneModel({ profile: newmarketRoadProfile, routeId: 'newmarket-teaching-loop-v1' })
    expect(first).toEqual(second)
    expect(first.sectionIds).toHaveLength(8)
    expect(new Set(first.sectionIds.map((id) => newmarketRoadProfile.sections.find((section) => section.id === id)!.template)).size).toBe(7)
    expect(JSON.parse(JSON.stringify(first))).toEqual(first)
  })

  it('produces finite continuous visible road slices for every scenario', () => {
    for (const type of ['right-on-red', 'yellow-light', 'multilane-left', 'freeway-merge', 'slow-lead', 'freeway-exit'] as const) {
      const engine = createEngine(41, 'practice', type)
      const frame = buildVisibleScene(engine.roadPosition, engine.laneOffsetM, null, 0)
      expect(frame.slices.length, type).toBeGreaterThan(2)
      expect(validateSceneSlices(frame.slices), type).toEqual([])
      expect(frame.slices.at(-1)!.routeDistanceM, type).toBeGreaterThanOrEqual(350)
    }
  })

  it('rejects unknown routes', () => {
    expect(() => buildRouteSceneModel({ profile: newmarketRoadProfile, routeId: 'missing' })).toThrow(/unknown route/)
  })
})
