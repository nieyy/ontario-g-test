import type { CentreRoadProfile, LaneBoundaryMarking, RoadPosition, RoadSectionTemplate } from '../content/roadProfiles/types'
import { newmarketRoadProfile } from '../content/roadProfiles/newmarket'
import { buildRoadFrame, type RenderRoadSlice } from './roadFrame'

export type SceneTheme = 'parking' | 'industrial' | 'arterial' | 'freeway'

export type RouteSceneModel = {
  id: string
  contentHash: string
  routeId: string
  sectionIds: string[]
  themes: Record<string, SceneTheme>
  intersectionIds: string[]
  seed: number
}

const themes: Record<RoadSectionTemplate, SceneTheme> = {
  'parking-exit': 'parking',
  'two-way-local': 'industrial',
  'urban-arterial': 'arterial',
  'turn-pocket-intersection': 'arterial',
  'freeway-on-ramp': 'freeway',
  'freeway-mainline': 'freeway',
  'freeway-off-ramp': 'freeway',
}

function hash(value: string) {
  let result = 2166136261
  for (const character of value) result = Math.imul(result ^ character.charCodeAt(0), 16777619)
  return result >>> 0
}

export function buildRouteSceneModel(input: { profile?: CentreRoadProfile; routeId: string }): RouteSceneModel {
  const profile = input.profile ?? newmarketRoadProfile
  const route = profile.routes.find((candidate) => candidate.id === input.routeId)
  if (!route) throw new Error(`route:${input.routeId}: unknown route`)
  const sectionIds = route.traversalEdgeIds.map((edgeId) => {
    const edge = route.edges.find((candidate) => candidate.id === edgeId)
    if (!edge) throw new Error(`edge:${edgeId}: missing route edge`)
    if (!profile.sections.some((section) => section.id === edge.sectionId)) throw new Error(`section:${edge.sectionId}: missing section`)
    return edge.sectionId
  })
  const themeEntries = sectionIds.map((sectionId) => {
    const section = profile.sections.find((candidate) => candidate.id === sectionId)!
    return [sectionId, themes[section.template]] as const
  })
  return {
    id: `${profile.id}:${route.id}`,
    contentHash: profile.contentHash,
    routeId: route.id,
    sectionIds,
    themes: Object.fromEntries(themeEntries),
    intersectionIds: sectionIds.filter((sectionId) => profile.sections.find((section) => section.id === sectionId)?.intersection),
    seed: hash(`${profile.contentHash}:${route.id}`),
  }
}

export function buildVisibleScene(position: RoadPosition, laneOffsetM: number, turnDirection: 'left' | 'right' | null, turnProgress: number) {
  return buildRoadFrame({ position, laneOffsetM, turnDirection, turnProgress, viewDistanceM: 360 })
}

export function validateSceneSlices(slices: RenderRoadSlice[]) {
  const errors: string[] = []
  if (slices.length < 2) errors.push('road ribbon requires at least two slices')
  const ids = new Set<string>()
  for (const [index, slice] of slices.entries()) {
    const values = [slice.sM, slice.routeDistanceM, slice.centre.x, slice.centre.z, slice.heading, slice.leftEdge.x, slice.rightEdge.x]
    if (values.some((value) => !Number.isFinite(value))) errors.push(`slice:${index}: non-finite coordinate`)
    for (const lane of slice.lanes) {
      const id = `${index}:${lane.laneId}`
      if (ids.has(id)) errors.push(`slice:${index}: duplicate lane ${lane.laneId}`)
      ids.add(id)
      const markings: LaneBoundaryMarking[] = [lane.leftMarking, lane.rightMarking]
      if (lane.direction === 'forward' && lane.role !== 'parking-access' && markings.includes('single-yellow') && markings.includes('dashed-white')) {
        errors.push(`slice:${index}:${lane.laneId}: conflicting boundary semantics`)
      }
    }
  }
  return errors
}
