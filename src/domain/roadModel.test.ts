import { describe, expect, it } from 'vitest'
import { newmarketRoadProfile, newmarketRouteBindings } from '../content/roadProfiles/newmarket'
import { scenarioOrder } from '../content/data'
import type { RouteBinding } from '../content/roadProfiles/types'
import { advanceRoadPosition, canTurnFromRoad, createRoadPosition, getAvailableLaneActions, getRoadFacts, laneEffectiveWidth, laneOffsetAt, requestAdjacentLane } from './roadModel'

describe('dynamic road model', () => {
  function routeDistance(position: ReturnType<typeof createRoadPosition>, binding: RouteBinding) {
    const edgeIndex = binding.edgeIds.indexOf(position.edgeId)
    const preceding = binding.edgeIds.slice(0, edgeIndex).reduce((total, edgeId) => {
      const edge = newmarketRoadProfile.routes[0].edges.find((candidate) => candidate.id === edgeId)!
      const section = newmarketRoadProfile.sections.find((candidate) => candidate.id === edge.sectionId)!
      return total + section.lengthM
    }, 0)
    return preceding + position.sMeters
  }

  it('uses stable route, edge, section and lane identifiers', () => {
    const position = createRoadPosition(newmarketRouteBindings['right-on-red'], 'right-on-red')
    expect(position).toEqual({ routeId: 'newmarket-teaching-loop-v1', edgeId: 'edge-parking', sectionId: 'newmarket-parking-exit', sMeters: 0, laneId: 'parking-access' })
  })

  it('only exposes a left-turn pocket after its authored split begins', () => {
    const start = createRoadPosition(newmarketRouteBindings['multilane-left'], 'multilane-left')
    expect(getAvailableLaneActions(start)).toEqual([])
    const visible = { ...start, sMeters: 160 }
    expect(getAvailableLaneActions(visible)).toMatchObject([{ direction: 'left', targetLaneId: 'pocket-left-turn', targetRole: 'left-turn' }])
    expect(requestAdjacentLane(visible, 'left').accepted).toBe(true)
  })

  it('rejects crossing into an opposing lane or over a solid boundary', () => {
    const local = createRoadPosition({ routeId: 'newmarket-teaching-loop-v1', edgeIds: ['edge-local'] }, 'yellow-light')
    expect(getAvailableLaneActions(local)).toEqual([])
  })

  it('moves deterministically across bound edges and route movements', () => {
    const binding = newmarketRouteBindings['right-on-red']
    const start = createRoadPosition(binding, 'right-on-red')
    const first = advanceRoadPosition(start, 700, binding)
    const second = advanceRoadPosition(start, 700, binding)
    expect(first).toEqual(second)
    expect(first.edgeId).toBe('edge-signal')
    expect(first.sectionId).toBe('urban-signal-junction')
    expect(first.sMeters).toBeCloseTo(80)
  })

  it('uses lane movement permissions and intersection distance for turns', () => {
    const through = { routeId: 'newmarket-teaching-loop-v1', edgeId: 'edge-pocket', sectionId: 'left-turn-pocket', sMeters: 320, laneId: 'pocket-through' }
    const left = { ...through, laneId: 'pocket-left-turn' }
    expect(canTurnFromRoad(through, 'left')).toBe(false)
    expect(canTurnFromRoad(left, 'left')).toBe(true)
  })

  it('presents one, two and three forward-lane road structures', () => {
    const facts = (edgeId: string, sectionId: string, laneId: string, sMeters = 0) => getRoadFacts({ routeId: 'newmarket-teaching-loop-v1', edgeId, sectionId, laneId, sMeters }, newmarketRoadProfile)
    expect(facts('edge-local', 'harry-walker-local', 'local-forward').forwardLaneCount).toBe(1)
    expect(facts('edge-arterial', 'davis-leslie-arterial', 'arterial-left').forwardLaneCount).toBe(2)
    expect(facts('edge-mainline', 'highway-404-mainline', 'mainline-centre').forwardLaneCount).toBe(3)
  })

  it('starts freeway merge on a single-lane ramp before exposing the mainline to the left', () => {
    const start = createRoadPosition(newmarketRouteBindings['freeway-merge'], 'freeway-merge')
    expect(start.laneId).toBe('ramp-merge')
    expect(getRoadFacts(start).forwardLaneCount).toBe(1)
    expect(getRoadFacts(start).speedLimitKph).toBe(70)
    expect(getAvailableLaneActions(start)).toEqual([])

    const separatedRamp = { ...start, sMeters: 270 }
    expect(getRoadFacts(separatedRamp).forwardLaneCount).toBe(4)
    expect(getAvailableLaneActions(separatedRamp)).toEqual([])

    const accelerationLane = { ...start, sMeters: 340 }
    expect(getRoadFacts(accelerationLane).forwardLaneCount).toBe(4)
    expect(getAvailableLaneActions(accelerationLane)).toMatchObject([{ direction: 'left', targetLaneId: 'ramp-mainline', targetRole: 'through' }])
  })

  it('keeps the entrance ramp to the right of the freeway instead of crossing its lanes', () => {
    const section = newmarketRoadProfile.sections.find((candidate) => candidate.id === 'highway-404-on-ramp')!
    const mergeLane = section.lanes.find((lane) => lane.id === 'ramp-merge')!
    const freewayRight = section.lanes.find((lane) => lane.id === 'ramp-mainline')!
    for (const sMeters of [140, 220, 300, 320, 360, 380, 400, 440, 479]) {
      const mergeLeftEdge = laneOffsetAt(mergeLane, sMeters) - laneEffectiveWidth(section, mergeLane, sMeters) / 2
      const freewayRightEdge = laneOffsetAt(freewayRight, sMeters) + laneEffectiveWidth(section, freewayRight, sMeters) / 2
      expect(mergeLeftEdge, `ramp boundary at ${sMeters}m`).toBeGreaterThanOrEqual(freewayRightEdge - 0.001)
    }
    expect(laneOffsetAt(mergeLane, 480)).toBe(
      laneOffsetAt(freewayRight, 480) + laneEffectiveWidth(section, freewayRight, 480) / 2,
    )
  })

  it('keeps enough freeway mainline ahead for the complete timed merge scene', () => {
    const binding = newmarketRouteBindings['freeway-merge']
    const start = createRoadPosition(binding, 'freeway-merge')
    const atMaximumDistance = advanceRoadPosition(start, (120 / 3.6) * 160, binding)
    expect(atMaximumDistance.edgeId).toBe('edge-mainline')
    expect(getRoadFacts(atMaximumDistance).speedLimitKph).toBe(100)
    expect(atMaximumDistance.sMeters).toBeGreaterThan(4_000)
    expect(atMaximumDistance.sMeters).toBeLessThan(getRoadFacts(atMaximumDistance).section.lengthM)
  })

  it('allows entering and leaving the visible freeway exit lane', () => {
    const binding = newmarketRouteBindings['freeway-exit']
    const start = createRoadPosition(binding, 'freeway-exit')
    for (const sMeters of [220, 320, 500, 740]) {
      const through = { ...start, sMeters }
      const enter = requestAdjacentLane(through, 'right')
      expect(enter.accepted, `enter exit lane at ${sMeters}m`).toBe(true)
      if (!enter.accepted) continue
      expect(enter.position.laneId).toBe('exit-ramp')
      const leave = requestAdjacentLane(enter.position, 'left')
      expect(leave.accepted, `leave exit lane at ${sMeters}m`).toBe(true)
      if (leave.accepted) expect(leave.position.laneId).toBe('exit-right')
    }
  })

  it('keeps physical road progress moving for every scenario after authored content ends', () => {
    const maximumDistance = (120 / 3.6) * 160
    for (const type of scenarioOrder) {
      const binding = newmarketRouteBindings[type]
      const start = createRoadPosition(binding, type)
      const before = advanceRoadPosition(start, maximumDistance - 100, binding)
      const after = advanceRoadPosition(start, maximumDistance, binding)
      expect(routeDistance(after, binding) - routeDistance(before, binding), type).toBeCloseTo(100)
    }
  })
})
