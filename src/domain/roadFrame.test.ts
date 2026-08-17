import { describe, expect, it } from 'vitest'
import { buildRoadFrame } from './roadFrame'

describe('road frame builder', () => {
  it('builds only the visible road window and carries stable lane IDs', () => {
    const frame = buildRoadFrame({ position: { routeId: 'newmarket-teaching-loop-v1', edgeId: 'edge-mainline', sectionId: 'highway-404-mainline', sMeters: 500, laneId: 'mainline-centre' } })
    expect(frame.slices[0].sM).toBeGreaterThanOrEqual(490)
    expect(frame.slices.at(-1)!.routeDistanceM).toBeLessThanOrEqual(320)
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

  it('continues the visible road into the next section instead of ending in grass', () => {
    const frame = buildRoadFrame({ position: { routeId: 'newmarket-teaching-loop-v1', edgeId: 'edge-local', sectionId: 'harry-walker-local', sMeters: 410, laneId: 'local-forward' } })
    expect(frame.slices.at(-1)!.routeDistanceM).toBeGreaterThanOrEqual(312)
    expect(frame.slices.some((slice) => slice.lanes.some((lane) => lane.laneId === 'signal-through'))).toBe(true)
    const seamIndex = frame.slices.findIndex((slice) => slice.lanes.some((lane) => lane.laneId === 'signal-through'))
    const before = frame.slices[seamIndex - 1]
    const after = frame.slices[seamIndex]
    expect(Math.hypot(after.centre.x - before.centre.x, after.centre.z - before.centre.z)).toBeLessThan(9)
  })

  it('keeps the two-way centre boundary yellow and the outer boundaries as curbs', () => {
    const frame = buildRoadFrame({ position: { routeId: 'newmarket-teaching-loop-v1', edgeId: 'edge-local', sectionId: 'harry-walker-local', sMeters: 180, laneId: 'local-forward' } })
    const current = frame.slices.reduce((closest, slice) => Math.abs(slice.sM - 180) < Math.abs(closest.sM - 180) ? slice : closest)
    const forward = current.lanes.find((lane) => lane.laneId === 'local-forward')!
    const opposing = current.lanes.find((lane) => lane.laneId === 'local-opposing')!
    expect(forward.leftMarking).toBe('double-yellow')
    expect(opposing.rightMarking).toBe('double-yellow')
    expect(forward.rightMarking).toBe('curb')
    expect(opposing.leftMarking).toBe('curb')
    expect((forward.leftEdge.x + opposing.rightEdge.x) / 2).toBeCloseTo(current.centre.x)
  })

  it('keeps steering heading signs conventional', () => {
    const position = { routeId: 'newmarket-teaching-loop-v1', edgeId: 'edge-pocket', sectionId: 'left-turn-pocket', sMeters: 330, laneId: 'pocket-left-turn' }
    const left = buildRoadFrame({ position, turnDirection: 'left', turnProgress: 0.5 })
    const right = buildRoadFrame({ position, turnDirection: 'right', turnProgress: 0.5 })
    expect(left.camera.heading).toBeLessThan(right.camera.heading)
  })
})
