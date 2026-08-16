import { describe, expect, it } from 'vitest'
import { newmarketRoadProfile, newmarketRouteBindings } from '../content/roadProfiles/newmarket'
import { advanceRoadPosition, canTurnFromRoad, createRoadPosition, getAvailableLaneActions, getRoadFacts, requestAdjacentLane } from './roadModel'

describe('dynamic road model', () => {
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
})
