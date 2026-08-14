export const LANE_WIDTH_METERS = 3.6
export const ROAD_HALF_WIDTH_METERS = LANE_WIDTH_METERS * 1.5
export const INTERSECTION_DISTANCE_METERS = 230
export const INTERSECTION_HALF_DEPTH_METERS = 7
export const ROAD_VIEW_DISTANCE_METERS = 320

export type WorldPoint = {
  x: number
  z: number
  height?: number
}

export type CameraPose = {
  x: number
  z: number
  heading: number
}

export type ScreenPoint = {
  x: number
  y: number
  scale: number
  forward: number
}

export type IntersectionPhase = 'ahead' | 'approaching' | 'decision' | 'crossing' | 'passed'

export function laneCentre(lanePosition: number) {
  return lanePosition * LANE_WIDTH_METERS
}

export function intersectionPhase(distanceMeters: number): IntersectionPhase {
  const relative = INTERSECTION_DISTANCE_METERS - distanceMeters
  if (relative > 115) return 'ahead'
  if (relative > 35) return 'approaching'
  if (relative > INTERSECTION_HALF_DEPTH_METERS) return 'decision'
  if (relative > -INTERSECTION_HALF_DEPTH_METERS - 8) return 'crossing'
  return 'passed'
}

export function vehiclePose(
  distanceMeters: number,
  lanePosition: number,
  turnDirection: 'left' | 'right' | null,
  turnProgress: number,
  turnStartDistanceMeters: number | null,
): CameraPose {
  const startX = laneCentre(lanePosition)
  if (!turnDirection || turnStartDistanceMeters === null) {
    return { x: startX, z: distanceMeters, heading: 0 }
  }

  const sign = turnDirection === 'right' ? 1 : -1
  const theta = Math.max(0, Math.min(1, turnProgress)) * Math.PI / 2
  const radius = Math.max(12, INTERSECTION_DISTANCE_METERS - turnStartDistanceMeters)
  return {
    x: startX + sign * radius * (1 - Math.cos(theta)),
    z: turnStartDistanceMeters + radius * Math.sin(theta),
    heading: sign * theta,
  }
}

export function worldToScreen(
  point: WorldPoint,
  camera: CameraPose,
  width = 960,
  height = 540,
): ScreenPoint | null {
  const dx = point.x - camera.x
  const dz = point.z - camera.z
  const cosine = Math.cos(camera.heading)
  const sine = Math.sin(camera.heading)
  const lateral = dx * cosine - dz * sine
  const forward = dx * sine + dz * cosine
  if (forward <= 0.6) return null

  const focalDistance = 34
  const scale = focalDistance / (forward + focalDistance)
  const horizon = height * 0.38
  const ground = height * 0.94
  const pixelsPerMeter = width * 0.052
  return {
    x: width / 2 + lateral * pixelsPerMeter * scale,
    y: horizon + (ground - horizon) * scale - (point.height ?? 0) * pixelsPerMeter * scale,
    scale,
    forward,
  }
}

export function intersectionRelativeDistance(camera: CameraPose) {
  return INTERSECTION_DISTANCE_METERS - camera.z
}
