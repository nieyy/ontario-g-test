import { newmarketRoadProfile } from '../content/roadProfiles/newmarket'
import type {
  CentreRoadProfile,
  LaneBoundaryMarking,
  LaneDefinition,
  LaneRole,
  RoadPosition,
  RoadSectionDefinition,
  RoadSectionTemplate,
  RouteBinding,
  RouteEdge,
  RouteGraph,
} from '../content/roadProfiles/types'
import type { ScenarioType } from '../content/types'

export type LaneAction = { direction: 'left' | 'right'; targetLaneId: string; targetRole: LaneRole; label: string }
export type RoadFacts = {
  section: RoadSectionDefinition
  edge: RouteEdge
  route: RouteGraph
  lane: LaneDefinition
  laneRole: LaneRole
  laneOffsetM: number
  forwardLaneCount: number
  availableLaneActions: LaneAction[]
  intersectionDistanceMeters?: number
  speedLimitKph: number
  template: RoadSectionTemplate
}

export function roadProfile(): CentreRoadProfile {
  return newmarketRoadProfile
}

export function getRoute(profile: CentreRoadProfile, routeId: string) {
  const route = profile.routes.find((candidate) => candidate.id === routeId)
  if (!route) throw new Error(`Unknown road route ${routeId}`)
  return route
}

export function getEdge(profile: CentreRoadProfile, routeId: string, edgeId: string) {
  const route = getRoute(profile, routeId)
  const edge = route.edges.find((candidate) => candidate.id === edgeId)
  if (!edge) throw new Error(`Unknown road edge ${routeId}/${edgeId}`)
  return edge
}

export function getSection(profile: CentreRoadProfile, sectionId: string) {
  const section = profile.sections.find((candidate) => candidate.id === sectionId)
  if (!section) throw new Error(`Unknown road section ${sectionId}`)
  return section
}

export function getLane(section: RoadSectionDefinition, laneId: string) {
  const lane = section.lanes.find((candidate) => candidate.id === laneId)
  if (!lane) throw new Error(`Unknown lane ${section.id}/${laneId}`)
  return lane
}

function interpolate(points: Array<{ sM: number; centerOffsetM: number }>, sM: number) {
  if (sM <= points[0].sM) return points[0].centerOffsetM
  if (sM >= points.at(-1)!.sM) return points.at(-1)!.centerOffsetM
  const index = points.findIndex((point) => point.sM >= sM)
  const from = points[index - 1]
  const to = points[index]
  const progress = (sM - from.sM) / (to.sM - from.sM)
  return from.centerOffsetM + (to.centerOffsetM - from.centerOffsetM) * progress
}

export function laneOffsetAt(lane: LaneDefinition, sM: number) {
  return interpolate(lane.offsetProfile, Math.max(lane.startsAtM, Math.min(lane.endsAtM, sM)))
}

export function laneEffectiveWidth(section: RoadSectionDefinition, lane: LaneDefinition, sM: number) {
  if (sM < lane.startsAtM || sM > lane.endsAtM) return 0
  for (const transition of section.transitions) {
    const progress = Math.max(0, Math.min(1, (sM - transition.atM) / transition.taperLengthM))
    if (transition.kind === 'split' && transition.toLaneIds.includes(lane.id) && !transition.fromLaneIds.includes(lane.id) && sM <= transition.atM + transition.taperLengthM) return lane.widthM * progress
    if (transition.kind === 'merge' && transition.fromLaneIds.includes(lane.id) && !transition.toLaneIds.includes(lane.id) && sM >= transition.atM) return lane.widthM * (1 - progress)
  }
  return lane.widthM
}

export function activeForwardLanes(section: RoadSectionDefinition, sM: number) {
  return section.lanes
    .filter((lane) => lane.direction === 'forward' && laneEffectiveWidth(section, lane, sM) > 0.25)
    .sort((left, right) => laneOffsetAt(left, sM) - laneOffsetAt(right, sM))
}

function boundaryAt(lane: LaneDefinition, side: 'leftBoundary' | 'rightBoundary', sM: number): LaneBoundaryMarking {
  return lane[side].find((segment) => sM >= segment.fromM && sM <= segment.toM)?.marking ?? 'none'
}

function canCross(marking: LaneBoundaryMarking) {
  return marking === 'none' || marking === 'dashed-white'
}

export function getAvailableLaneActions(position: RoadPosition, profile = newmarketRoadProfile): LaneAction[] {
  const section = getSection(profile, position.sectionId)
  const lanes = activeForwardLanes(section, position.sMeters)
  const currentIndex = lanes.findIndex((lane) => lane.id === position.laneId)
  if (currentIndex < 0) return []
  const actions: LaneAction[] = []
  const current = lanes[currentIndex]
  const left = lanes[currentIndex - 1]
  const right = lanes[currentIndex + 1]
  if (left && canCross(boundaryAt(current, 'leftBoundary', position.sMeters)) && canCross(boundaryAt(left, 'rightBoundary', position.sMeters))) actions.push({ direction: 'left', targetLaneId: left.id, targetRole: left.role, label: `Move left to ${left.role.replace('-', ' ')} lane` })
  if (right && canCross(boundaryAt(current, 'rightBoundary', position.sMeters)) && canCross(boundaryAt(right, 'leftBoundary', position.sMeters))) actions.push({ direction: 'right', targetLaneId: right.id, targetRole: right.role, label: `Move right to ${right.role.replace('-', ' ')} lane` })
  return actions
}

const preferredInitialRole: Partial<Record<ScenarioType, LaneRole[]>> = {
  'right-on-red': ['parking-access', 'through'],
  'yellow-light': ['through'],
  'multilane-left': ['through'],
  'freeway-merge': ['through', 'merge'],
  'slow-lead': ['through'],
  'freeway-exit': ['through'],
}

export function createRoadPosition(binding: RouteBinding, scenarioType: ScenarioType, profile = newmarketRoadProfile): RoadPosition {
  const edge = getEdge(profile, binding.routeId, binding.edgeIds[0])
  const section = getSection(profile, edge.sectionId)
  const lanes = activeForwardLanes(section, 0)
  const roles = preferredInitialRole[scenarioType] ?? ['through']
  let selected = roles.flatMap((role) => lanes.filter((lane) => lane.role === role)).at(-1) ?? lanes.at(-1)
  if (scenarioType === 'freeway-exit') selected = lanes.find((lane) => lane.id === 'exit-right') ?? selected
  if (scenarioType === 'slow-lead') selected = lanes.find((lane) => lane.id === 'mainline-right') ?? selected
  if (!selected) throw new Error(`No forward lane at ${section.id}`)
  return { routeId: binding.routeId, edgeId: edge.id, sectionId: section.id, sMeters: 0, laneId: selected.id }
}

function transitionLaneAtEnd(section: RoadSectionDefinition, laneId: string, sMeters: number) {
  const transition = section.transitions.find((candidate) => candidate.kind === 'merge' && candidate.fromLaneIds.includes(laneId) && sMeters >= candidate.atM + candidate.taperLengthM)
  return transition?.toLaneIds[0] ?? laneId
}

export function advanceRoadPosition(position: RoadPosition, deltaMeters: number, binding: RouteBinding, profile = newmarketRoadProfile): RoadPosition {
  if (deltaMeters <= 0) return position
  let next = { ...position }
  let remaining = deltaMeters
  let guard = binding.edgeIds.length + 2
  while (remaining > 0 && guard-- > 0) {
    const section = getSection(profile, next.sectionId)
    const available = section.lengthM - next.sMeters
    const travelled = Math.min(remaining, Math.max(0, available))
    next.sMeters += travelled
    remaining -= travelled
    next.laneId = transitionLaneAtEnd(section, next.laneId, next.sMeters)
    if (remaining <= 0 || next.sMeters < section.lengthM) break
    const edgeIndex = binding.edgeIds.indexOf(next.edgeId)
    const nextEdgeId = binding.edgeIds[edgeIndex + 1]
    if (!nextEdgeId) break
    const route = getRoute(profile, next.routeId)
    const nextEdge = getEdge(profile, next.routeId, nextEdgeId)
    const movement = route.movements.find((candidate) => candidate.fromEdgeId === next.edgeId && candidate.toEdgeId === nextEdgeId && candidate.fromLaneId === next.laneId)
      ?? route.movements.find((candidate) => candidate.fromEdgeId === next.edgeId && candidate.toEdgeId === nextEdgeId)
    const nextSection = getSection(profile, nextEdge.sectionId)
    const target = movement ? nextSection.lanes.find((lane) => lane.id === movement.toLaneId) : activeForwardLanes(nextSection, 0)[0]
    if (!target) break
    next = { ...next, edgeId: nextEdge.id, sectionId: nextSection.id, sMeters: 0, laneId: target.id }
  }
  return next
}

export function getRoadFacts(position: RoadPosition, profile = newmarketRoadProfile): RoadFacts {
  const route = getRoute(profile, position.routeId)
  const edge = getEdge(profile, position.routeId, position.edgeId)
  const section = getSection(profile, position.sectionId)
  const lane = getLane(section, position.laneId)
  return {
    section,
    edge,
    route,
    lane,
    laneRole: lane.role,
    laneOffsetM: laneOffsetAt(lane, position.sMeters),
    forwardLaneCount: activeForwardLanes(section, position.sMeters).length,
    availableLaneActions: getAvailableLaneActions(position, profile),
    intersectionDistanceMeters: section.intersection ? section.intersection.atM - position.sMeters : undefined,
    speedLimitKph: section.speedLimitKph,
    template: section.template,
  }
}

export function requestAdjacentLane(position: RoadPosition, direction: 'left' | 'right', profile = newmarketRoadProfile) {
  const action = getAvailableLaneActions(position, profile).find((candidate) => candidate.direction === direction)
  if (!action) return { accepted: false as const, position, reason: 'No reachable adjacent lane' }
  return { accepted: true as const, position: { ...position, laneId: action.targetLaneId }, action }
}

export function canTurnFromRoad(position: RoadPosition, direction: 'left' | 'right', profile = newmarketRoadProfile) {
  const facts = getRoadFacts(position, profile)
  const distance = facts.intersectionDistanceMeters
  return distance !== undefined && distance <= 75 && distance >= -8 && facts.lane.allowedMovements.includes(direction)
}
