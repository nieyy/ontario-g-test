import type { LaneBoundaryMarking, LaneRole, RoadPosition } from '../content/roadProfiles/types'
import { newmarketRoadProfile } from '../content/roadProfiles/newmarket'
import { getRoadFacts, laneEffectiveWidth, laneOffsetAt } from './roadModel'
import type { CameraPose, WorldPoint } from './roadGeometry'

export type RenderLaneSlice = {
  laneId: string
  role: LaneRole
  direction: 'forward' | 'opposing'
  centre: WorldPoint
  widthM: number
  leftMarking: LaneBoundaryMarking
  rightMarking: LaneBoundaryMarking
}

export type RenderRoadSlice = { sM: number; centre: WorldPoint; lanes: RenderLaneSlice[]; leftEdgeX: number; rightEdgeX: number }
export type RoadFrame = {
  camera: CameraPose
  slices: RenderRoadSlice[]
  intersection?: { atM: number; centre: WorldPoint; crossRoadWidthM: number; stopLineZ: number; control: 'traffic-signal' | 'stop-sign' | 'uncontrolled' }
  arrows: Array<{ point: WorldPoint; movement: 'straight' | 'left' | 'right'; laneId: string }>
  roadSummary: string
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

function markingAt(segments: Array<{ fromM: number; toM: number; marking: LaneBoundaryMarking }>, sM: number) {
  return segments.find((segment) => sM >= segment.fromM && sM <= segment.toM)?.marking ?? 'none'
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
  const fromM = Math.max(0, input.position.sMeters - 10)
  const toM = Math.min(section.lengthM, input.position.sMeters + (input.viewDistanceM ?? 320))
  const samples = new Set<number>([fromM, toM, input.position.sMeters, ...(section.intersection ? [section.intersection.atM, section.intersection.atM - section.intersection.stopLineBeforeM] : [])])
  for (let sM = Math.ceil(fromM / 8) * 8; sM <= toM; sM += 8) samples.add(sM)
  for (const lane of section.lanes) for (const arrow of lane.arrows) if (arrow.atM >= fromM && arrow.atM <= toM) samples.add(arrow.atM)

  const slices: RenderRoadSlice[] = [...samples].filter((sM) => sM >= fromM && sM <= toM).sort((a, b) => a - b).map((sM) => {
    const centre = centreAt(section.centerline, sM)
    const lanes = section.lanes.map((lane) => {
      const widthM = laneEffectiveWidth(section, lane, sM)
      const offset = laneOffsetAt(lane, sM)
      return {
        laneId: lane.id,
        role: lane.role,
        direction: lane.direction,
        centre: { x: centre.x + offset, z: centre.z },
        widthM,
        leftMarking: markingAt(lane.leftBoundary, sM),
        rightMarking: markingAt(lane.rightBoundary, sM),
      }
    }).filter((lane) => lane.widthM > 0.08)
    const edges = lanes.flatMap((lane) => [lane.centre.x - lane.widthM / 2, lane.centre.x + lane.widthM / 2])
    return { sM, centre, lanes, leftEdgeX: Math.min(...edges), rightEdgeX: Math.max(...edges) }
  })

  const cameraCentre = centreAt(section.centerline, input.position.sMeters)
  const ahead = centreAt(section.centerline, Math.min(section.lengthM, input.position.sMeters + 2))
  const baseHeading = Math.atan2(ahead.x - cameraCentre.x, Math.max(0.001, ahead.z - cameraCentre.z))
  const turnSign = input.turnDirection === 'right' ? 1 : input.turnDirection === 'left' ? -1 : 0
  const heading = baseHeading + turnSign * (input.turnProgress ?? 0) * Math.PI / 2
  const camera: CameraPose = { x: cameraCentre.x + (input.laneOffsetM ?? facts.laneOffsetM), z: cameraCentre.z, heading }
  const arrows = section.lanes.flatMap((lane) => lane.arrows.filter((arrow) => arrow.atM >= fromM && arrow.atM <= toM).map((arrow) => {
    const centre = centreAt(section.centerline, arrow.atM)
    return { point: { x: centre.x + laneOffsetAt(lane, arrow.atM), z: centre.z }, movement: arrow.movement, laneId: lane.id }
  }))
  const intersection = section.intersection ? (() => {
    const centre = centreAt(section.centerline, section.intersection.atM)
    return { atM: section.intersection.atM, centre, crossRoadWidthM: section.intersection.crossRoadWidthM, stopLineZ: centre.z - section.intersection.stopLineBeforeM, control: section.intersection.control }
  })() : undefined

  return {
    camera,
    slices,
    intersection,
    arrows,
    roadSummary: `${section.trainingLabel}. ${facts.forwardLaneCount} forward ${facts.forwardLaneCount === 1 ? 'lane' : 'lanes'}. Current lane: ${facts.laneRole.replace('-', ' ')}.`,
  }
}
