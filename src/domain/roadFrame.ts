import type { LaneBoundaryMarking, LaneRole, RoadPosition, RoadSectionDefinition, RouteGraph } from '../content/roadProfiles/types'
import { newmarketRoadProfile } from '../content/roadProfiles/newmarket'
import { getRoadFacts, laneEffectiveWidth, laneOffsetAt } from './roadModel'
import type { CameraPose, WorldPoint } from './roadGeometry'

export type RenderLaneSlice = {
  laneId: string
  role: LaneRole
  direction: 'forward' | 'opposing'
  centre: WorldPoint
  leftEdge: WorldPoint
  rightEdge: WorldPoint
  widthM: number
  leftMarking: LaneBoundaryMarking
  rightMarking: LaneBoundaryMarking
}

export type RenderRoadSlice = {
  sM: number
  routeDistanceM: number
  centre: WorldPoint
  heading: number
  lanes: RenderLaneSlice[]
  leftEdge: WorldPoint
  rightEdge: WorldPoint
}

export type RoadFrame = {
  camera: CameraPose
  slices: RenderRoadSlice[]
  intersection?: {
    atM: number
    centre: WorldPoint
    stopLineCentre: WorldPoint
    heading: number
    distanceAheadM: number
    crossRoadWidthM: number
    control: 'traffic-signal' | 'stop-sign' | 'uncontrolled'
  }
  arrows: Array<{ point: WorldPoint; movement: 'straight' | 'left' | 'right'; laneId: string }>
  roadSummary: string
}

type Placement = {
  edgeId: string
  section: RoadSectionDefinition
  routeStartM: number
  rotation: number
  localOrigin: WorldPoint
  worldOrigin: WorldPoint
}

function centreAt(points: Array<{ sM: number; xM: number; zM: number }>, sM: number) {
  if (sM <= points[0].sM) return { x: points[0].xM, z: points[0].zM }
  if (sM >= points.at(-1)!.sM) return { x: points.at(-1)!.xM, z: points.at(-1)!.zM }
  const index = points.findIndex((point) => point.sM >= sM)
  const from = points[index - 1]
  const to = points[index]
  const progress = (sM - from.sM) / (to.sM - from.sM)
  return { x: from.xM + (to.xM - from.xM) * progress, z: from.zM + (to.zM - from.zM) * progress }
}

function headingAt(points: Array<{ sM: number; xM: number; zM: number }>, sM: number) {
  const before = centreAt(points, Math.max(0, sM - 1))
  const after = centreAt(points, Math.min(points.at(-1)!.sM, sM + 1))
  return Math.atan2(after.x - before.x, Math.max(0.001, after.z - before.z))
}

function transform(point: WorldPoint, placement: Placement): WorldPoint {
  const x = point.x - placement.localOrigin.x
  const z = point.z - placement.localOrigin.z
  const cosine = Math.cos(placement.rotation)
  const sine = Math.sin(placement.rotation)
  return {
    x: placement.worldOrigin.x + x * cosine + z * sine,
    z: placement.worldOrigin.z - x * sine + z * cosine,
    height: point.height,
  }
}

function offsetPoint(centre: WorldPoint, heading: number, offsetM: number): WorldPoint {
  return { x: centre.x + Math.cos(heading) * offsetM, z: centre.z - Math.sin(heading) * offsetM }
}

function markingAt(segments: Array<{ fromM: number; toM: number; marking: LaneBoundaryMarking }>, sM: number) {
  return segments.find((segment) => sM >= segment.fromM && sM <= segment.toM)?.marking ?? 'none'
}

function sectionSlice(placement: Placement, sM: number): RenderRoadSlice {
  const localCentre = centreAt(placement.section.centerline, sM)
  const centre = transform(localCentre, placement)
  const heading = headingAt(placement.section.centerline, sM) + placement.rotation
  const lanes = placement.section.lanes.map((lane) => {
    const widthM = laneEffectiveWidth(placement.section, lane, sM)
    const laneCentre = offsetPoint(centre, heading, laneOffsetAt(lane, sM))
    return {
      laneId: lane.id,
      role: lane.role,
      direction: lane.direction,
      centre: laneCentre,
      leftEdge: offsetPoint(laneCentre, heading, -widthM / 2),
      rightEdge: offsetPoint(laneCentre, heading, widthM / 2),
      widthM,
      leftMarking: markingAt(lane.leftBoundary, sM),
      rightMarking: markingAt(lane.rightBoundary, sM),
    }
  }).filter((lane) => lane.widthM > 0.08)
  const lateralEdges = placement.section.lanes.flatMap((lane) => {
    const rendered = lanes.find((item) => item.laneId === lane.id)
    if (!rendered) return []
    const offset = laneOffsetAt(lane, sM)
    return [{ offset: offset - rendered.widthM / 2, point: rendered.leftEdge }, { offset: offset + rendered.widthM / 2, point: rendered.rightEdge }]
  }).sort((left, right) => left.offset - right.offset)
  return {
    sM,
    routeDistanceM: placement.routeStartM + sM,
    centre,
    heading,
    lanes,
    leftEdge: lateralEdges[0].point,
    rightEdge: lateralEdges.at(-1)!.point,
  }
}

function sampleSection(placement: Placement, fromM: number, toM: number) {
  const samples = new Set<number>([fromM, toM])
  for (let sM = Math.ceil(fromM / 8) * 8; sM <= toM; sM += 8) samples.add(sM)
  if (placement.section.intersection) {
    samples.add(placement.section.intersection.atM)
    samples.add(placement.section.intersection.atM - placement.section.intersection.stopLineBeforeM)
  }
  for (const lane of placement.section.lanes) for (const arrow of lane.arrows) samples.add(arrow.atM)
  return [...samples]
    .filter((sM) => sM >= fromM && sM <= toM)
    .sort((left, right) => left - right)
    .map((sM) => sectionSlice(placement, sM))
}

function nextPlacement(previous: Placement, route: RouteGraph, edgeId: string, routeStartM: number): Placement {
  const profile = newmarketRoadProfile
  const edge = route.edges.find((item) => item.id === edgeId)!
  const section = profile.sections.find((item) => item.id === edge.sectionId)!
  const previousEnd = transform(centreAt(previous.section.centerline, previous.section.lengthM), previous)
  const previousHeading = headingAt(previous.section.centerline, previous.section.lengthM) + previous.rotation
  const movement = route.movements.find((item) => item.fromEdgeId === previous.edgeId && item.toEdgeId === edgeId)
  const targetHeading = previousHeading + ((movement?.headingDeltaDeg ?? 0) * Math.PI) / 180
  const localOrigin = centreAt(section.centerline, 0)
  return {
    edgeId,
    section,
    routeStartM,
    rotation: targetHeading - headingAt(section.centerline, 0),
    localOrigin,
    worldOrigin: previousEnd,
  }
}

export function buildRoadFrame(input: {
  position: RoadPosition
  laneOffsetM?: number
  turnDirection?: 'left' | 'right' | null
  turnProgress?: number
  viewDistanceM?: number
}): RoadFrame {
  const profile = newmarketRoadProfile
  const facts = getRoadFacts(input.position, profile)
  const section = facts.section
  const route = profile.routes.find((item) => item.id === input.position.routeId)!
  const currentEdgeIndex = route.traversalEdgeIds.indexOf(input.position.edgeId)
  const currentStart = centreAt(section.centerline, 0)
  const currentPlacement: Placement = { edgeId: input.position.edgeId, section, routeStartM: -input.position.sMeters, rotation: 0, localOrigin: currentStart, worldOrigin: currentStart }
  const viewDistanceM = input.viewDistanceM ?? 320
  const placements = [currentPlacement]
  let routeStartM = section.lengthM - input.position.sMeters
  let previous = currentPlacement
  for (const edgeId of route.traversalEdgeIds.slice(currentEdgeIndex + 1)) {
    if (routeStartM > viewDistanceM) break
    const placement = nextPlacement(previous, route, edgeId, routeStartM)
    placements.push(placement)
    routeStartM += placement.section.lengthM
    previous = placement
  }

  const slices = placements.flatMap((placement, index) => {
    const fromM = index === 0 ? Math.max(0, input.position.sMeters - 10) : 0
    const remaining = viewDistanceM - placement.routeStartM
    const toM = Math.min(placement.section.lengthM, index === 0 ? input.position.sMeters + viewDistanceM : remaining)
    return toM >= fromM ? sampleSection(placement, fromM, toM) : []
  })

  if (slices.length && slices.at(-1)!.routeDistanceM < viewDistanceM) {
    const last = slices.at(-1)!
    const forward = { x: Math.sin(last.heading), z: Math.cos(last.heading) }
    for (let distance = last.routeDistanceM + 8; distance <= viewDistanceM; distance += 8) {
      const delta = distance - last.routeDistanceM
      const shift = (point: WorldPoint) => ({ x: point.x + forward.x * delta, z: point.z + forward.z * delta })
      slices.push({
        ...last,
        sM: last.sM + delta,
        routeDistanceM: distance,
        centre: shift(last.centre),
        leftEdge: shift(last.leftEdge),
        rightEdge: shift(last.rightEdge),
        lanes: last.lanes.map((lane) => ({ ...lane, centre: shift(lane.centre), leftEdge: shift(lane.leftEdge), rightEdge: shift(lane.rightEdge) })),
      })
    }
  }

  const cameraCentre = centreAt(section.centerline, input.position.sMeters)
  const baseHeading = headingAt(section.centerline, input.position.sMeters)
  const turnSign = input.turnDirection === 'right' ? 1 : input.turnDirection === 'left' ? -1 : 0
  const heading = baseHeading + turnSign * (input.turnProgress ?? 0) * Math.PI / 2
  const cameraPoint = offsetPoint(cameraCentre, baseHeading, input.laneOffsetM ?? facts.laneOffsetM)
  const camera: CameraPose = { ...cameraPoint, heading }
  const arrows = placements.flatMap((placement) => placement.section.lanes.flatMap((lane) => lane.arrows
    .filter((arrow) => placement.routeStartM + arrow.atM >= -10 && placement.routeStartM + arrow.atM <= viewDistanceM)
    .map((arrow) => {
      const centre = transform(centreAt(placement.section.centerline, arrow.atM), placement)
      const arrowHeading = headingAt(placement.section.centerline, arrow.atM) + placement.rotation
      return { point: offsetPoint(centre, arrowHeading, laneOffsetAt(lane, arrow.atM)), movement: arrow.movement, laneId: lane.id }
    })))
  const intersection = placements.flatMap((placement) => {
    const definition = placement.section.intersection
    if (!definition) return []
    const distanceAheadM = placement.routeStartM + definition.atM
    if (distanceAheadM < -30 || distanceAheadM > viewDistanceM) return []
    const centre = transform(centreAt(placement.section.centerline, definition.atM), placement)
    const intersectionHeading = headingAt(placement.section.centerline, definition.atM) + placement.rotation
    const forward = { x: Math.sin(intersectionHeading), z: Math.cos(intersectionHeading) }
    return [{
      atM: definition.atM,
      centre,
      stopLineCentre: { x: centre.x - forward.x * definition.stopLineBeforeM, z: centre.z - forward.z * definition.stopLineBeforeM },
      heading: intersectionHeading,
      distanceAheadM,
      crossRoadWidthM: definition.crossRoadWidthM,
      control: definition.control,
    }]
  }).sort((left, right) => left.distanceAheadM - right.distanceAheadM)[0]

  return {
    camera,
    slices,
    intersection,
    arrows,
    roadSummary: `${section.trainingLabel}. ${facts.forwardLaneCount} forward ${facts.forwardLaneCount === 1 ? 'lane' : 'lanes'}. Current lane: ${facts.laneRole.replace('-', ' ')}.`,
  }
}
