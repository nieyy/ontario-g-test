import { newmarketRoadProfile } from '../content/roadProfiles/newmarket'
import type { CentreRoadProfile, RoadPosition } from '../content/roadProfiles/types'
import { getEdge, getRoute, getSection } from './roadModel'

export type MiniMapModel = {
  contextPoints: Array<{ x: number; y: number }>
  points: Array<{ x: number; y: number }>
  nodes: Array<{ x: number; y: number; state: 'done' | 'current' | 'upcoming'; label: string }>
  vehicle: { x: number; y: number }
  currentLabel: string
  currentEdgeIndex: number
  edgeCount: number
}

type MiniMapOptions = {
  profile?: CentreRoadProfile
  edgeIds?: readonly string[]
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

function fitToMiniMap(paths: Array<Array<{ x: number; y: number }>>) {
  const source = paths.flat()
  const minX = Math.min(...source.map((point) => point.x))
  const maxX = Math.max(...source.map((point) => point.x))
  const minY = Math.min(...source.map((point) => point.y))
  const maxY = Math.max(...source.map((point) => point.y))
  const width = Math.max(1, maxX - minX)
  const height = Math.max(1, maxY - minY)
  const scale = Math.min(104 / width, 66 / height)
  const renderedWidth = width * scale
  const renderedHeight = height * scale
  const offsetX = 63 - renderedWidth / 2
  const offsetY = 44 - renderedHeight / 2
  return (point: { x: number; y: number }) => ({
    x: offsetX + (point.x - minX) * scale,
    y: offsetY + (point.y - minY) * scale,
  })
}

export function getRouteMiniMap(position: RoadPosition, options: MiniMapOptions = {}): MiniMapModel {
  const profile = options.profile ?? newmarketRoadProfile
  const route = getRoute(profile, position.routeId)
  const fullTraversal = route.traversalEdgeIds.map((edgeId) => getEdge(profile, route.id, edgeId))
  const requestedEdges = new Set(options.edgeIds ?? route.traversalEdgeIds)
  const scopedTraversal = fullTraversal.filter((edge) => requestedEdges.has(edge.id))
  const traversal = scopedTraversal.some((edge) => edge.id === position.edgeId) ? scopedTraversal : fullTraversal
  const currentEdgeIndex = Math.max(0, traversal.findIndex((edge) => edge.id === position.edgeId))
  const currentEdge = traversal[currentEdgeIndex]
  const currentSection = getSection(profile, currentEdge.sectionId)
  const progress = position.sMeters / currentSection.lengthM
  const firstFullIndex = fullTraversal.findIndex((edge) => edge.id === traversal[0].id)
  const lastFullIndex = fullTraversal.findIndex((edge) => edge.id === traversal.at(-1)!.id)
  const contextTraversal = fullTraversal.slice(Math.max(0, firstFullIndex - 1), Math.min(fullTraversal.length, lastFullIndex + 2))
  const fit = fitToMiniMap(traversal.map((edge) => edge.miniMapPath))
  const points = traversal.flatMap((edge, index) => (index === 0 ? edge.miniMapPath : edge.miniMapPath.slice(1))).map(fit)
  const contextPoints = contextTraversal.flatMap((edge, index) => (index === 0 ? edge.miniMapPath : edge.miniMapPath.slice(1))).map(fit)
  const nodes = traversal.map((edge, index) => {
    const section = getSection(profile, edge.sectionId)
    return {
      ...fit(edge.miniMapPath[0]),
      state: index < currentEdgeIndex ? 'done' as const : index === currentEdgeIndex ? 'current' as const : 'upcoming' as const,
      label: section.trainingLabel,
    }
  })
  nodes.push({ ...fit(traversal.at(-1)!.miniMapPath.at(-1)!), state: 'upcoming', label: 'Teaching route finish' })
  return {
    contextPoints,
    points,
    nodes,
    vehicle: fit(pointAlong(currentEdge.miniMapPath, progress)),
    currentLabel: currentSection.trainingLabel,
    currentEdgeIndex,
    edgeCount: traversal.length,
  }
}
