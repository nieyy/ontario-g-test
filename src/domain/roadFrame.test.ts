import { describe, expect, it } from 'vitest'
import { buildRoadFrame } from './roadFrame'

describe('road frame builder', () => {
  it('builds only the visible road window and carries stable lane IDs', () => {
    const frame = buildRoadFrame({ position: { routeId: 'newmarket-teaching-loop-v1', edgeId: 'edge-mainline', sectionId: 'highway-404-mainline', sMeters: 500, laneId: 'mainline-centre' } })
    expect(frame.slices[0].sM).toBeGreaterThanOrEqual(490)
    expect(frame.slices.at(-1)!.sM).toBeLessThanOrEqual(820)
    expect(frame.slices.some((slice) => slice.lanes.some((lane) => lane.laneId === 'mainline-centre'))).toBe(true)
    expect(frame.roadSummary).toContain('3 forward lanes')
  })

  it('anchors a left-turn arrow and intersection in the same section coordinates', () => {
    const far = buildRoadFrame({ position: { routeId: 'newmarket-teaching-loop-v1', edgeId: 'edge-pocket', sectionId: 'left-turn-pocket', sMeters: 120, laneId: 'pocket-through' } })
    const near = buildRoadFrame({ position: { routeId: 'newmarket-teaching-loop-v1', edgeId: 'edge-pocket', sectionId: 'left-turn-pocket', sMeters: 330, laneId: 'pocket-left-turn' } })
    expect(far.intersection?.centre.z).toBe(380)
    expect(near.intersection?.centre.z).toBe(380)
    expect(near.intersection!.centre.z - near.camera.z).toBeLessThan(far.intersection!.centre.z - far.camera.z)
    expect(near.arrows.some((arrow) => arrow.movement === 'left' && arrow.laneId === 'pocket-left-turn')).toBe(true)
  })

  it('keeps steering heading signs conventional', () => {
    const position = { routeId: 'newmarket-teaching-loop-v1', edgeId: 'edge-pocket', sectionId: 'left-turn-pocket', sMeters: 330, laneId: 'pocket-left-turn' }
    const left = buildRoadFrame({ position, turnDirection: 'left', turnProgress: 0.5 })
    const right = buildRoadFrame({ position, turnDirection: 'right', turnProgress: 0.5 })
    expect(left.camera.heading).toBeLessThan(right.camera.heading)
  })
})
