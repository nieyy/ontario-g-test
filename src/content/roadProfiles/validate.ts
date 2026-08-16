import type { CentreRoadProfile, LaneDefinition, RoadSectionDefinition } from './types'

const finite = (value: number) => Number.isFinite(value)
const near = (left: number, right: number, tolerance = 0.001) => Math.abs(left - right) <= tolerance

function duplicateIds(values: string[]): string[] {
  const seen = new Set<string>()
  return values.filter((value) => seen.has(value) || !seen.add(value))
}

function boundaryErrors(section: RoadSectionDefinition, lane: LaneDefinition, side: 'leftBoundary' | 'rightBoundary') {
  const errors: string[] = []
  const segments = [...lane[side]].sort((left, right) => left.fromM - right.fromM)
  if (!segments.length || !near(segments[0].fromM, lane.startsAtM) || !near(segments.at(-1)!.toM, lane.endsAtM)) {
    errors.push(`[boundary-coverage] ${section.id}/${lane.id}/${side} must cover the lane lifecycle`)
    return errors
  }
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]
    if (!finite(segment.fromM) || !finite(segment.toM) || segment.toM <= segment.fromM) errors.push(`[boundary-range] ${section.id}/${lane.id}/${side} has an invalid range`)
    if (index > 0 && !near(segments[index - 1].toM, segment.fromM)) errors.push(`[boundary-gap] ${section.id}/${lane.id}/${side} has a gap or overlap`)
  }
  return errors
}

function laneOffset(lane: LaneDefinition, sM: number) {
  const points = lane.offsetProfile
  if (sM <= points[0].sM) return points[0].centerOffsetM
  if (sM >= points.at(-1)!.sM) return points.at(-1)!.centerOffsetM
  const nextIndex = points.findIndex((point) => point.sM >= sM)
  const from = points[nextIndex - 1]
  const to = points[nextIndex]
  const progress = (sM - from.sM) / (to.sM - from.sM)
  return from.centerOffsetM + (to.centerOffsetM - from.centerOffsetM) * progress
}

function validateSection(section: RoadSectionDefinition, laneIds: Set<string>): string[] {
  const errors: string[] = []
  if (section.fidelity !== 'authored-approximation') errors.push(`[fidelity] ${section.id} geometry must be authored-approximation`)
  if (!finite(section.lengthM) || section.lengthM <= 0) errors.push(`[section-length] ${section.id} length must be positive`)
  if (!Number.isInteger(section.speedLimitKph) || section.speedLimitKph < 10 || section.speedLimitKph > 110) errors.push(`[speed-limit] ${section.id} speed limit must be an integer from 10 to 110`)
  if (section.centerline.length < 2 || !near(section.centerline[0]?.sM ?? -1, 0) || !near(section.centerline.at(-1)?.sM ?? -1, section.lengthM)) errors.push(`[centerline-coverage] ${section.id} centerline must cover 0..lengthM`)
  section.centerline.forEach((point, index) => {
    if (![point.sM, point.xM, point.zM].every(finite)) errors.push(`[centerline-number] ${section.id} has non-finite centerline coordinates`)
    if (index > 0) {
      const previous = section.centerline[index - 1]
      if (point.sM <= previous.sM || (near(point.xM, previous.xM) && near(point.zM, previous.zM))) errors.push(`[centerline-order] ${section.id} centerline must increase without duplicate points`)
    }
  })

  for (const lane of section.lanes) {
    if (laneIds.has(lane.id)) errors.push(`[duplicate-lane] ${lane.id}`)
    laneIds.add(lane.id)
    if (!finite(lane.widthM) || lane.widthM <= 0 || lane.startsAtM < 0 || lane.endsAtM > section.lengthM || lane.endsAtM <= lane.startsAtM) errors.push(`[lane-lifecycle] ${section.id}/${lane.id} has an invalid lifecycle`)
    if (lane.offsetProfile.length < 2 || !near(lane.offsetProfile[0]?.sM ?? -1, lane.startsAtM) || !near(lane.offsetProfile.at(-1)?.sM ?? -1, lane.endsAtM)) errors.push(`[offset-coverage] ${section.id}/${lane.id} offset profile must cover its lifecycle`)
    lane.offsetProfile.forEach((point, index) => {
      if (![point.sM, point.centerOffsetM].every(finite)) errors.push(`[offset-number] ${section.id}/${lane.id} contains non-finite offsets`)
      if (index > 0 && point.sM <= lane.offsetProfile[index - 1].sM) errors.push(`[offset-order] ${section.id}/${lane.id} offsets must increase`)
    })
    errors.push(...boundaryErrors(section, lane, 'leftBoundary'), ...boundaryErrors(section, lane, 'rightBoundary'))
    for (const arrow of lane.arrows) {
      const mapped = arrow.movement === 'straight' ? 'continue' : arrow.movement
      if (arrow.atM < lane.startsAtM || arrow.atM > lane.endsAtM) errors.push(`[arrow-range] ${section.id}/${lane.id} arrow is outside the lane`)
      if (!lane.allowedMovements.includes(mapped)) errors.push(`[arrow-movement] ${section.id}/${lane.id} arrow does not match allowed movements`)
    }
  }

  const laneById = new Map(section.lanes.map((lane) => [lane.id, lane]))
  for (const transition of section.transitions) {
    if (!finite(transition.atM) || !finite(transition.taperLengthM) || transition.atM < 0 || transition.taperLengthM <= 0 || transition.atM + transition.taperLengthM > section.lengthM) errors.push(`[transition-range] ${section.id}/${transition.id} has an invalid taper`)
    const input = transition.fromLaneIds.map((id) => laneById.get(id))
    const output = transition.toLaneIds.map((id) => laneById.get(id))
    if ([...input, ...output].some((lane) => !lane)) errors.push(`[transition-reference] ${section.id}/${transition.id} references a missing lane`)
    if ([...input, ...output].filter(Boolean).some((lane) => lane!.direction !== 'forward')) errors.push(`[transition-direction] ${section.id}/${transition.id} cannot use opposing lanes`)
    if (transition.kind === 'split') {
      const created = output.filter((lane) => lane && !transition.fromLaneIds.includes(lane.id))
      if (!created.length || created.some((lane) => !near(lane!.startsAtM, transition.atM))) errors.push(`[transition-split] ${section.id}/${transition.id} split targets must start at atM`)
    } else {
      const removed = input.filter((lane) => lane && !transition.toLaneIds.includes(lane.id))
      if (!removed.length || removed.some((lane) => !near(lane!.endsAtM, transition.atM + transition.taperLengthM))) errors.push(`[transition-merge] ${section.id}/${transition.id} merge sources must end at taper end`)
    }
  }

  const samples = new Set<number>([0, section.lengthM, ...section.lanes.flatMap((lane) => [lane.startsAtM, lane.endsAtM, ...lane.offsetProfile.map((point) => point.sM)])])
  for (const sM of samples) {
    const active = section.lanes.filter((lane) => sM >= lane.startsAtM && sM <= lane.endsAtM)
    for (let left = 0; left < active.length; left += 1) for (let right = left + 1; right < active.length; right += 1) {
      const a = active[left]
      const b = active[right]
      const sharedTransition = section.transitions.some((transition) => sM >= transition.atM && sM <= transition.atM + transition.taperLengthM && [...transition.fromLaneIds, ...transition.toLaneIds].includes(a.id) && [...transition.fromLaneIds, ...transition.toLaneIds].includes(b.id))
      if (!sharedTransition && Math.abs(laneOffset(a, sM) - laneOffset(b, sM)) + 0.001 < (a.widthM + b.widthM) / 2) errors.push(`[lane-overlap] ${section.id}/${a.id}/${b.id} overlap at ${sM}m`)
    }
  }

  if (section.intersection) {
    const { atM, crossRoadWidthM, stopLineBeforeM } = section.intersection
    if (![atM, crossRoadWidthM, stopLineBeforeM].every(finite) || crossRoadWidthM <= 0 || stopLineBeforeM < 0 || atM - crossRoadWidthM / 2 < 0 || atM + crossRoadWidthM / 2 > section.lengthM) errors.push(`[intersection-range] ${section.id} intersection is outside the section`)
  }
  return errors
}

export function validateRoadProfile(profile: CentreRoadProfile): string[] {
  const errors: string[] = []
  if (!profile.id || profile.version !== '1.0.0' || profile.centreId !== 'newmarket') errors.push('[profile-identity] profile identity/version is invalid')
  if (!profile.disclaimer.toLowerCase().includes('not an official')) errors.push('[profile-disclaimer] profile must state that it is not an official route')
  if (!profile.routes.length) errors.push('[route-empty] at least one route is required')

  const sourceIds = profile.sources.map((source) => source.id)
  for (const duplicate of duplicateIds(sourceIds)) errors.push(`[duplicate-source] ${duplicate}`)
  for (const source of profile.sources) {
    if (!source.observedAt || !source.notes || !source.supports.length) errors.push(`[source-required] ${source.id} is incomplete`)
    if (source.kind === 'verified-context' && !source.sourceUrl) errors.push(`[source-url] ${source.id} verified context requires a URL`)
  }

  const sectionIds = new Set<string>()
  const laneIds = new Set<string>()
  const transitionIds = new Set<string>()
  for (const section of profile.sections) {
    if (sectionIds.has(section.id)) errors.push(`[duplicate-section] ${section.id}`)
    sectionIds.add(section.id)
    for (const reference of section.sourceRefs) if (!sourceIds.includes(reference)) errors.push(`[source-reference] ${section.id} references ${reference}`)
    for (const transition of section.transitions) {
      if (transitionIds.has(transition.id)) errors.push(`[duplicate-transition] ${transition.id}`)
      transitionIds.add(transition.id)
    }
    errors.push(...validateSection(section, laneIds))
  }

  const routeIds = new Set<string>()
  const movementIds = new Set<string>()
  const edgeIds = new Set<string>()
  const nodeIds = new Set<string>()
  const sectionById = new Map(profile.sections.map((section) => [section.id, section]))
  for (const route of profile.routes) {
    if (routeIds.has(route.id)) errors.push(`[duplicate-route] ${route.id}`)
    routeIds.add(route.id)
    for (const node of route.nodes) {
      if (nodeIds.has(node.id)) errors.push(`[duplicate-node] ${node.id}`)
      nodeIds.add(node.id)
    }
    for (const edge of route.edges) {
      if (edgeIds.has(edge.id)) errors.push(`[duplicate-edge] ${edge.id}`)
      edgeIds.add(edge.id)
      if (!route.nodes.some((node) => node.id === edge.fromNodeId) || !route.nodes.some((node) => node.id === edge.toNodeId) || !sectionIds.has(edge.sectionId)) errors.push(`[edge-reference] ${route.id}/${edge.id} has a missing reference`)
      if (edge.miniMapPath.length < 2 || edge.miniMapPath.some((point) => !finite(point.x) || !finite(point.y))) errors.push(`[minimap-path] ${route.id}/${edge.id} needs two finite points`)
    }
    const traversal = route.traversalEdgeIds.map((id) => route.edges.find((edge) => edge.id === id))
    if (!traversal.length || traversal.some((edge) => !edge)) errors.push(`[traversal-reference] ${route.id} traversal references a missing edge`)
    else {
      if (traversal[0]!.fromNodeId !== route.startNodeId || traversal.at(-1)!.toNodeId !== route.endNodeId) errors.push(`[traversal-endpoints] ${route.id} does not connect start to end`)
      for (let index = 1; index < traversal.length; index += 1) {
        const previous = traversal[index - 1]!
        const current = traversal[index]!
        if (previous.toNodeId !== current.fromNodeId) errors.push(`[traversal-connectivity] ${route.id}/${previous.id}/${current.id} is disconnected`)
        const previousPoint = previous.miniMapPath.at(-1)!
        const currentPoint = current.miniMapPath[0]
        if (Math.hypot(previousPoint.x - currentPoint.x, previousPoint.y - currentPoint.y) > 0.01) errors.push(`[minimap-connectivity] ${route.id}/${previous.id}/${current.id} jumps`)
        if (!route.movements.some((movement) => movement.fromEdgeId === previous.id && movement.toEdgeId === current.id)) errors.push(`[movement-missing] ${route.id}/${previous.id}/${current.id}`)
      }
    }
    for (const movement of route.movements) {
      if (movementIds.has(movement.id)) errors.push(`[duplicate-movement] ${movement.id}`)
      movementIds.add(movement.id)
      const fromEdge = route.edges.find((edge) => edge.id === movement.fromEdgeId)
      const toEdge = route.edges.find((edge) => edge.id === movement.toEdgeId)
      const fromLane = fromEdge ? sectionById.get(fromEdge.sectionId)?.lanes.find((lane) => lane.id === movement.fromLaneId) : undefined
      const toLane = toEdge ? sectionById.get(toEdge.sectionId)?.lanes.find((lane) => lane.id === movement.toLaneId) : undefined
      if (!fromEdge || !toEdge || !fromLane || !toLane) errors.push(`[movement-reference] ${route.id}/${movement.id} has a missing edge or lane`)
      else {
        if (fromLane.direction !== toLane.direction || !fromLane.allowedMovements.includes(movement.movement)) errors.push(`[movement-legality] ${route.id}/${movement.id} is not allowed by its source lane`)
        if ((movement.movement === 'left' && movement.headingDeltaDeg >= 0) || (movement.movement === 'right' && movement.headingDeltaDeg <= 0) || (movement.movement === 'continue' && movement.headingDeltaDeg !== 0)) errors.push(`[movement-heading] ${route.id}/${movement.id} has the wrong heading sign`)
        if ((movement.movement === 'left' || movement.movement === 'right') && !sectionById.get(fromEdge.sectionId)?.intersection) errors.push(`[movement-intersection] ${route.id}/${movement.id} needs an intersection definition`)
      }
      if (!finite(movement.headingDeltaDeg) || !finite(movement.connectorLengthM) || movement.connectorLengthM <= 0) errors.push(`[movement-number] ${route.id}/${movement.id} has invalid geometry`)
    }
  }
  return [...new Set(errors)]
}

export function assertValidRoadProfile(profile: CentreRoadProfile): void {
  const errors = validateRoadProfile(profile)
  if (errors.length) throw new Error(`Road profile ${profile.id} is invalid:\n${errors.join('\n')}`)
}
