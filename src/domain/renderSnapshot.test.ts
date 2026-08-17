import { describe, expect, it } from 'vitest'
import { createEngine, recordAction } from './engine'
import { buildRenderSnapshot } from './renderSnapshot'

describe('3D render snapshot', () => {
  it('is deterministic and uses the same simulation tick for camera and actors', () => {
    const engine = createEngine(57, 'practice', 'slow-lead')
    const scenario = engine.route[0]
    const first = buildRenderSnapshot({ engine, scenario })
    expect(first).toEqual(buildRenderSnapshot({ engine, scenario }))
    expect(first.tick).toBe(Math.round(engine.elapsed * 10))
    expect(first.actors.some((actor) => actor.role === 'lead')).toBe(true)
    expect(first.actors.some((actor) => actor.role === 'rear')).toBe(true)
  })

  it('keeps left and right steering signs aligned with lane actions', () => {
    let left = createEngine(61, 'practice', 'multilane-left')
    left = { ...left, roadPosition: { ...left.roadPosition, sMeters: 160 } }
    left = recordAction(left, 'lane-left')
    const leftFrame = buildRenderSnapshot({ engine: { ...left, laneChangeElapsed: 0.45 }, scenario: left.route[0] })
    expect(leftFrame.steeringAngle).toBeLessThan(0)

    let right = createEngine(62, 'practice', 'right-on-red')
    right = { ...right, roadPosition: { ...right.roadPosition, edgeId: 'edge-signal', sectionId: 'urban-signal-junction', sMeters: 130, laneId: 'signal-through' }, laneOffsetM: 0 }
    right = recordAction(right, 'lane-right')
    const rightFrame = buildRenderSnapshot({ engine: { ...right, laneChangeElapsed: 0.45 }, scenario: right.route[0] })
    expect(rightFrame.steeringAngle).toBeGreaterThan(0)
  })

  it('anchors cross traffic at the upcoming intersection rather than beside the driver', () => {
    const engine = createEngine(63, 'practice', 'right-on-red')
    const snapshot = buildRenderSnapshot({ engine, scenario: engine.route[0] })
    const cross = snapshot.actors.find((actor) => actor.role === 'cross')

    expect(cross).toBeDefined()
    expect(cross!.forwardM).toBeGreaterThan(10)
    if (snapshot.road.intersection) expect(cross!.forwardM).toBeCloseTo(snapshot.road.intersection.distanceAheadM)
  })
})
