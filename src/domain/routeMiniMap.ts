import { newmarketRoadProfile } from '../content/roadProfiles/newmarket'
import type { CentreRoadProfile, RoadPosition } from '../content/roadProfiles/types'
import { getEdge, getRoute, getSection } from './roadModel'

export type MiniMapModel = {
  points: Array<{ x: number; y: number }>
  nodes: Array<{ x: number; y: number; state: 'done' | 'current' | 'upcoming'; label: string }>
  vehicle: { x: number; y: number }
  currentLabel: string
  currentEdgeIndex: number
  edgeCount: number
}

function pointAlong(path: Array<{ x: number; y: number }>, progress: number) {
  const lengths = path.slice(1).map((point, index) => Math.hypot(point.x - path[index].x, point.y - path[index].y))
  const total = lengths.reduce((sum, length) => sum + length, 0)
  let remaining = total * Math.max(0, Math.min(1, progress))
  for (let index = 0; index < lengths.length; index += 1) {
    if (remaining <= lengths[index] || index === lengths.length - 1) {
      const from = path[index]
      const to = path[index + 1]
      const ratio = lengths[index] ? remaining / lengths[index] : 0
      return { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio }
    }
    remaining -= lengths[index]
  }
  return path.at(-1)!
}

export function getRouteMiniMap(position: RoadPosition, profile: CentreRoadProfile = newmarketRoadProfile): MiniMapModel {
  const route = getRoute(profile, position.routeId)
  const traversal = route.traversalEdgeIds.map((edgeId) => getEdge(profile, route.id, edgeId))
  const currentEdgeIndex = Math.max(0, traversal.findIndex((edge) => edge.id === position.edgeId))
  const currentEdge = traversal[currentEdgeIndex]
  const currentSection = getSection(profile, currentEdge.sectionId)
  const progress = position.sMeters / currentSection.lengthM
  const points = traversal.flatMap((edge, index) => index === 0 ? edge.miniMapPath : edge.miniMapPath.slice(1))
  const nodes = traversal.map((edge, index) => {
    const section = getSection(profile, edge.sectionId)
    return {
      ...edge.miniMapPath[0],
      state: index < currentEdgeIndex ? 'done' as const : index === currentEdgeIndex ? 'current' as const : 'upcoming' as const,
      label: section.trainingLabel,
    }
  })
  nodes.push({ ...traversal.at(-1)!.miniMapPath.at(-1)!, state: 'upcoming', label: 'Teaching route finish' })
  return {
    points,
    nodes,
    vehicle: pointAlong(currentEdge.miniMapPath, progress),
    currentLabel: currentSection.trainingLabel,
    currentEdgeIndex,
    edgeCount: traversal.length,
  }
}
