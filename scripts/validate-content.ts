import { centres } from '../src/content/data'
import { guidancePlans } from '../src/content/guidance'
import { validateCentreContent, validateGuidanceContent } from '../src/content/validate'
import { newmarketRoadProfile } from '../src/content/roadProfiles/newmarket'
import { validateRoadProfile } from '../src/content/roadProfiles/validate'
import { buildRouteSceneModel, buildVisibleScene, validateSceneSlices } from '../src/domain/threeSceneModel'

const errors = centres.flatMap((centre) =>
  [...validateCentreContent(centre), ...validateGuidanceContent(centre, guidancePlans)]
    .map((error) => `${centre.id}: ${error}`),
)
errors.push(...validateRoadProfile(newmarketRoadProfile).map((error) => `newmarket-road-profile-v1: ${error}`))
for (const route of newmarketRoadProfile.routes) {
  const scene = buildRouteSceneModel({ profile: newmarketRoadProfile, routeId: route.id })
  const edge = route.edges.find((candidate) => candidate.id === route.traversalEdgeIds[0])
  if (!edge) {
    errors.push(`${route.id}: no initial route edge for 3D validation`)
    continue
  }
  const section = newmarketRoadProfile.sections.find((candidate) => candidate.id === edge.sectionId)
  const lane = section?.lanes.find((candidate) => candidate.direction === 'forward')
  if (!section || !lane) {
    errors.push(`${route.id}: no initial forward lane for 3D validation`)
    continue
  }
  const frame = buildVisibleScene({ routeId: scene.routeId, edgeId: edge.id, sectionId: section.id, laneId: lane.id, sMeters: 0 }, 0, null, 0)
  errors.push(...validateSceneSlices(frame.slices).map((error) => `${scene.id}: ${error}`))
}

if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}

console.log(`Validated ${centres.length} centre, six scenario families, ${guidancePlans.length} guidance plans, the Newmarket road profile, and its deterministic 3D route scenes.`)
