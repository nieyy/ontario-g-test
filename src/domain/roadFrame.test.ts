import { describe, expect, it } from 'vitest'
import { buildRoadFrame } from './roadFrame'

describe('road frame builder', () => {
  it('starts the car in the right half of a two-way parking access aisle', () => {
    const frame = buildRoadFrame({ position: { routeId: 'newmarket-teaching-loop-v1', edgeId: 'edge-parking', sectionId: 'newmarket-parking-exit', sMeters: 0, laneId: 'parking-access' } })
    const first = frame.slices[0]
    const access = first.lanes.find((lane) => lane.laneId === 'parking-access')!
    const opposing = first.lanes.find((lane) => lane.laneId === 'parking-opposing')!
    expect(access.centre.x).toBeGreaterThan(first.centre.x)
    expect(opposing.centre.x).toBeLessThan(first.centre.x)
    expect(frame.camera.x).toBeCloseTo(access.centre.x)
    expect(first.rightEdge.x - first.leftEdge.x).toBeCloseTo(7.2)
    expect(access.leftMarking).toBe('single-yellow')
    expect(opposing.rightMarking).toBe('single-yellow')
  })

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

  it('renders a continuous terminal road tangent after a focused scenario edge ends', () => {
    const input = { routeId: 'newmarket-teaching-loop-v1', edgeId: 'edge-exit', sectionId: 'highway-404-off-ramp', laneId: 'exit-ramp' }
    const before = buildRoadFrame({ position: { ...input, sMeters: 1300 }, edgeIds: ['edge-exit'] })
    const after = buildRoadFrame({ position: { ...input, sMeters: 1400 }, edgeIds: ['edge-exit'] })
    expect(Math.hypot(after.camera.x - before.camera.x, after.camera.z - before.camera.z)).toBeGreaterThan(98)
    expect(after.slices.at(-1)!.routeDistanceM).toBeGreaterThanOrEqual(312)
    expect(after.slices.every((slice) => slice.lanes.some((lane) => lane.laneId === 'exit-ramp'))).toBe(true)
  })

  it('joins the acceleration lane to the freeway right lane without a lateral jump', () => {
    const frame = buildRoadFrame({
      position: { routeId: 'newmarket-teaching-loop-v1', edgeId: 'edge-ramp', sectionId: 'highway-404-on-ramp', sMeters: 520, laneId: 'ramp-mainline' },
      edgeIds: ['edge-ramp', 'edge-mainline'],
    })
    const rampEnd = frame.slices.find((slice) => slice.edgeId === 'edge-ramp' && slice.sM === 560)!
    const freewayStart = frame.slices.find((slice) => slice.edgeId === 'edge-mainline' && slice.sM === 0)!
    const rampLane = rampEnd.lanes.find((lane) => lane.laneId === 'ramp-mainline')!
    const freewayLane = freewayStart.lanes.find((lane) => lane.laneId === 'mainline-right')!
    expect(Math.hypot(freewayLane.centre.x - rampLane.centre.x, freewayLane.centre.z - rampLane.centre.z)).toBeLessThan(0.1)
    expect(rampEnd.lanes.some((lane) => lane.laneId === 'ramp-merge')).toBe(false)
  })
})
