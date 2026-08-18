import { describe, expect, it } from 'vitest'
import {
  advanceEngine,
  buildRoute,
  createEngine,
  LANE_CHANGE_DURATION_SECONDS,
  recordAction,
  resolveDanger,
  TICK_SECONDS,
  toAttemptRecord,
} from './engine'

describe('deterministic engine', () => {
  it('selects identical variants for the same seed', () => {
    expect(buildRoute(42).map((item) => item.id)).toEqual(buildRoute(42).map((item) => item.id))
    expect(buildRoute(42)).toHaveLength(6)
  })

  it('advances using a fixed-step-friendly pure transition', () => {
    let first = createEngine(8)
    let second = createEngine(8)
    const controls = new Set(['accelerate'] as const)
    for (let index = 0; index < 10; index += 1) first = advanceEngine(first, TICK_SECONDS, controls)
    second = advanceEngine(second, 1, controls)
    expect(first.elapsed).toBeCloseTo(second.elapsed)
    expect(first.speedKph).toBeCloseTo(second.speedKph)
  })

  it('holds the selected speed after acceleration or braking is released', () => {
    let state = createEngine(10, 'practice')
    state = advanceEngine(state, 2, new Set(['accelerate'] as const))
    const acceleratedSpeed = state.speedKph
    state = advanceEngine(state, 5)
    expect(state.speedKph).toBeCloseTo(acceleratedSpeed)

    state = advanceEngine(state, 0.5, new Set(['brake'] as const))
    const reducedSpeed = state.speedKph
    state = advanceEngine(state, 5)
    expect(state.speedKph).toBeCloseTo(reducedSpeed)
  })

  it('uses small pedal taps and stronger continuous holds', () => {
    let state = { ...createEngine(16, 'practice'), speedKph: 50 }
    state = recordAction(state, 'accelerate')
    expect(state.speedKph).toBe(51.5)
    state = advanceEngine(state, 1)
    expect(state.speedKph).toBe(51.5)

    state = recordAction(state, 'brake')
    expect(state.speedKph).toBe(49)
    const tappedSpeed = state.speedKph
    state = advanceEngine(state, 0.5, new Set(['brake'] as const))
    expect(state.speedKph).toBeLessThan(tappedSpeed - 10)
  })

  it('advances scenario distance only when the vehicle moves', () => {
    let state = createEngine(12, 'practice')
    state = advanceEngine(state, 5)
    expect(state.scenarioDistanceMeters).toBe(0)

    state = advanceEngine(state, 1, new Set(['accelerate'] as const))
    const movingDistance = state.scenarioDistanceMeters
    expect(movingDistance).toBeGreaterThan(0)

    state = advanceEngine(state, 1)
    expect(state.scenarioDistanceMeters).toBeGreaterThan(movingDistance)
  })

  it('pauses on a dangerous finding and preserves it after continue', () => {
    let state = createEngine(11)
    state = advanceEngine(state, state.route[0].durationSeconds)
    expect(state.dangerPending).toBe(true)
    const dangerIds = state.findings.filter((item) => item.severity === 'dangerous').map((item) => item.id)
    state = resolveDanger(state, 'continue')
    expect(state.stage).toBe('continued-practice')
    expect(toAttemptRecord(state, '2026-08-12T00:00:00.000Z').dangerousFindingIds).toEqual(dangerIds)
  })

  it('recognizes a completed right-on-red routine', () => {
    let state = createEngine(2, 'practice', 'right-on-red')
    for (const action of state.route[0].requiredActions) state = recordAction(state, action)
    state = advanceEngine(state, state.route[0].durationSeconds)
    expect(state.findings.some((item) => item.severity === 'dangerous')).toBe(false)
    expect(state.completed).toBe(true)
  })

  it('starts focused freeway merge practice on the entrance ramp rather than an urban arterial', () => {
    const state = createEngine(23, 'practice', 'freeway-merge')
    expect(state.roadPosition).toMatchObject({
      edgeId: 'edge-ramp',
      sectionId: 'highway-404-on-ramp',
      laneId: 'ramp-merge',
    })
    expect(state.speedKph).toBe(45)
  })

  it('starts focused freeway practice at a realistic moving speed while full routes remain parked', () => {
    expect(createEngine(24, 'practice', 'slow-lead').speedKph).toBe(82)
    expect(createEngine(25, 'practice', 'freeway-exit').speedKph).toBe(80)
    expect(createEngine(26, 'practice').speedKph).toBe(0)
  })

  it('keeps RoadPosition, lane animation and steering direction aligned', () => {
    let state = createEngine(31, 'practice', 'multilane-left')
    state = { ...state, roadPosition: { ...state.roadPosition, sMeters: 160 } }
    state = recordAction(state, 'lane-left')
    expect(state.roadPosition.laneId).toBe('pocket-left-turn')
    expect(state.laneChangeFromOffsetM).not.toBeNull()
    state = advanceEngine(state, LANE_CHANGE_DURATION_SECONDS)
    expect(state.laneChangeFromOffsetM).toBeNull()
    expect(state.laneOffsetM).toBeLessThan(1.8)
    expect(state.laneChangeFrom).toBeNull()
  })
})
