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

  it('keeps lane changes separate from an explicit intersection turn', () => {
    let state = { ...createEngine(14, 'practice', 'right-on-red'), roadProfileEnabled: false }
    state = recordAction(state, 'lane-right')
    state = advanceEngine(state, 0.9)
    state = { ...state, scenarioDistanceMeters: 180 }

    state = recordAction(state, 'lane-left')
    expect(state.lane).toBe(0)
    expect(state.turnDirection).toBe(null)
    state = advanceEngine(state, 0.9)

    state = recordAction(state, 'lane-right')
    expect(state.lane).toBe(1)
    expect(state.turnDirection).toBe(null)
    state = advanceEngine(state, 0.9)

    state = recordAction(state, 'turn-right')
    expect(state.turnDirection).toBe('right')
    expect(state.turnStartDistanceMeters).toBe(180)
    expect(state.scenarioActions.at(-1)?.type).toBe('turn-right')

    state = advanceEngine(state, 0.7)
    expect(state.turnProgress).toBeCloseTo(0.5)
    expect(state.completed).toBe(false)

    state = advanceEngine(state, 0.7)
    expect(state.dangerPending).toBe(true)
    state = resolveDanger(state, 'continue')
    expect(state.completed).toBe(true)
  })

  it('does not allow an intersection turn after the vehicle has passed it', () => {
    let state = { ...createEngine(22, 'practice', 'right-on-red'), roadProfileEnabled: false }
    state = recordAction(state, 'lane-right')
    state = advanceEngine(state, 0.9)
    state = { ...state, scenarioDistanceMeters: 246 }
    expect(recordAction(state, 'turn-right')).toBe(state)
  })

  it('moves through a timed lane transition and rejects stacked steering', () => {
    let state = { ...createEngine(21, 'practice'), roadProfileEnabled: false }
    state = recordAction(state, 'lane-right')
    expect(state.lane).toBe(1)
    expect(state.lanePosition).toBe(0)
    expect(state.laneChangeFrom).toBe(0)

    state = advanceEngine(state, 0.45)
    expect(state.lanePosition).toBeCloseTo(0.5)
    const transitioning = state
    state = recordAction(state, 'lane-left')
    expect(state).toBe(transitioning)

    state = advanceEngine(state, 0.45)
    expect(state.lanePosition).toBe(1)
    expect(state.laneChangeFrom).toBe(null)
    expect(state.laneChangeElapsed).toBe(0)
  })

  it('centres the vehicle when a new authored road scene begins', () => {
    let state = { ...createEngine(19, 'practice'), roadProfileEnabled: false }
    state = recordAction(state, 'lane-left')
    expect(state.lane).toBe(-1)

    state = advanceEngine(state, state.route[0].durationSeconds)

    expect(state.scenarioIndex).toBe(1)
    expect(state.lane).toBe(0)
    expect(state.lanePosition).toBe(0)
    expect(state.laneChangeFrom).toBe(null)
  })

  it('keeps RoadPosition, lane animation and steering direction aligned when the profile is enabled', () => {
    let state = createEngine(31, 'practice', 'multilane-left')
    state = { ...state, roadProfileEnabled: true, roadPosition: { ...state.roadPosition, sMeters: 160 } }
    state = recordAction(state, 'lane-left')
    expect(state.roadPosition.laneId).toBe('pocket-left-turn')
    expect(state.laneChangeFromOffsetM).not.toBeNull()
    state = advanceEngine(state, LANE_CHANGE_DURATION_SECONDS)
    expect(state.laneChangeFromOffsetM).toBeNull()
    expect(state.laneOffsetM).toBeLessThan(1.8)
    expect(state.laneChangeFrom).toBeNull()
  })
})
