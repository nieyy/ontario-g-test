import { useEffect, useRef } from 'react'
import type { ActionType, ScenarioVariant } from '../content/types'
import {
  INTERSECTION_DISTANCE_METERS,
  INTERSECTION_HALF_DEPTH_METERS,
  ROAD_HALF_WIDTH_METERS,
  ROAD_VIEW_DISTANCE_METERS,
  intersectionPhase,
  vehiclePose,
  worldToScreen,
  type CameraPose,
  type WorldPoint,
} from '../domain/roadGeometry'

type Props = {
  scenario: ScenarioVariant
  speedKph: number
  lane: -1 | 0 | 1
  lanePosition: number
  laneChangeDirection: -1 | 0 | 1
  laneChangeProgress: number
  signal: 'left' | 'right' | null
  recentAction: ActionType | null
  scenarioElapsed: number
  scenarioDistanceMeters: number
  turnDirection: 'left' | 'right' | null
  turnProgress: number
  turnStartDistanceMeters: number | null
  reducedMotion: boolean
}

const INTERSECTION_TYPES = new Set(['right-on-red', 'yellow-light', 'multilane-left'])

const feedbackLabels: Partial<Record<ActionType, string>> = {
  'mirror-left': 'Left mirror checked',
  'mirror-right': 'Right mirror checked',
  'shoulder-left': 'Left shoulder checked',
  'shoulder-right': 'Right shoulder checked',
}

type RoadQuad = { points: WorldPoint[]; depth: number; fill: string }
type CameraPoint = { lateral: number; forward: number; height: number }
type Viewport = { width: number; height: number }

function polygon(ctx: CanvasRenderingContext2D, points: Array<{ x: number; y: number }>, fill: string) {
  if (points.length < 3) return
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  for (const point of points.slice(1)) ctx.lineTo(point.x, point.y)
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
}

function toCameraPoint(point: WorldPoint, camera: CameraPose): CameraPoint {
  const dx = point.x - camera.x
  const dz = point.z - camera.z
  const cosine = Math.cos(camera.heading)
  const sine = Math.sin(camera.heading)
  return {
    lateral: dx * cosine - dz * sine,
    forward: dx * sine + dz * cosine,
    height: point.height ?? 0,
  }
}

function clipToNearPlane(points: CameraPoint[]) {
  const near = 0.6
  const clipped: CameraPoint[] = []
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const previous = points[(index + points.length - 1) % points.length]
    const currentInside = current.forward >= near
    const previousInside = previous.forward >= near
    if (currentInside !== previousInside) {
      const ratio = (near - previous.forward) / (current.forward - previous.forward)
      clipped.push({
        lateral: previous.lateral + (current.lateral - previous.lateral) * ratio,
        forward: near,
        height: previous.height + (current.height - previous.height) * ratio,
      })
    }
    if (currentInside) clipped.push(current)
  }
  return clipped
}

function cameraPointToScreen(point: CameraPoint, viewport: Viewport) {
  const focalDistance = 34
  const scale = focalDistance / (point.forward + focalDistance)
  const horizon = viewport.height * 0.38
  const ground = viewport.height * 0.94
  const pixelsPerMeter = Math.min(viewport.width * 0.052, viewport.height * 0.096)
  return {
    x: viewport.width / 2 + point.lateral * pixelsPerMeter * scale,
    y: horizon + (ground - horizon) * scale - point.height * pixelsPerMeter * scale,
  }
}

function projectPolygon(ctx: CanvasRenderingContext2D, points: WorldPoint[], camera: CameraPose, viewport: Viewport, fill: string) {
  const clipped = clipToNearPlane(points.map((point) => toCameraPoint(point, camera)))
  if (clipped.length < 3) return
  polygon(ctx, clipped.map((point) => cameraPointToScreen(point, viewport)), fill)
}

function worldLine(ctx: CanvasRenderingContext2D, from: WorldPoint, to: WorldPoint, camera: CameraPose, viewport: Viewport, colour: string, width: number) {
  const start = worldToScreen(from, camera, viewport.width, viewport.height)
  const end = worldToScreen(to, camera, viewport.width, viewport.height)
  if (!start || !end) return
  ctx.beginPath()
  ctx.moveTo(start.x, start.y)
  ctx.lineTo(end.x, end.y)
  ctx.strokeStyle = colour
  ctx.lineWidth = Math.max(1, width * Math.min(viewport.width * 0.052, viewport.height * 0.096) * ((start.scale + end.scale) / 2))
  ctx.stroke()
}

function roadQuads(camera: CameraPose, hasIntersection: boolean) {
  const quads: RoadQuad[] = []
  const startZ = Math.max(-30, camera.z - 8)
  const endZ = camera.z + ROAD_VIEW_DISTANCE_METERS
  for (let z = startZ; z < endZ; z += 8) {
    const next = Math.min(endZ, z + 8)
    quads.push({
      points: [
        { x: -ROAD_HALF_WIDTH_METERS, z },
        { x: ROAD_HALF_WIDTH_METERS, z },
        { x: ROAD_HALF_WIDTH_METERS, z: next },
        { x: -ROAD_HALF_WIDTH_METERS, z: next },
      ],
      depth: Math.hypot(z - camera.z, camera.x),
      fill: '#343b41',
    })
  }

  if (hasIntersection) {
    for (let x = -ROAD_VIEW_DISTANCE_METERS; x < ROAD_VIEW_DISTANCE_METERS; x += 8) {
      const next = x + 8
      quads.push({
        points: [
          { x, z: INTERSECTION_DISTANCE_METERS - ROAD_HALF_WIDTH_METERS },
          { x: next, z: INTERSECTION_DISTANCE_METERS - ROAD_HALF_WIDTH_METERS },
          { x: next, z: INTERSECTION_DISTANCE_METERS + ROAD_HALF_WIDTH_METERS },
          { x, z: INTERSECTION_DISTANCE_METERS + ROAD_HALF_WIDTH_METERS },
        ],
        depth: Math.hypot(x - camera.x, INTERSECTION_DISTANCE_METERS - camera.z),
        fill: '#343b41',
      })
    }
  }
  return quads.sort((left, right) => right.depth - left.depth)
}

function drawRoad(ctx: CanvasRenderingContext2D, camera: CameraPose, viewport: Viewport, hasIntersection: boolean, distance: number) {
  for (const quad of roadQuads(camera, hasIntersection)) projectPolygon(ctx, quad.points, camera, viewport, quad.fill)

  const startZ = Math.max(-20, camera.z - 6)
  const endZ = camera.z + ROAD_VIEW_DISTANCE_METERS
  for (const edge of [-ROAD_HALF_WIDTH_METERS, ROAD_HALF_WIDTH_METERS]) {
    for (let z = startZ; z < endZ; z += 12) {
      const next = Math.min(endZ, z + 12)
      if (hasIntersection && next >= INTERSECTION_DISTANCE_METERS - ROAD_HALF_WIDTH_METERS && z <= INTERSECTION_DISTANCE_METERS + ROAD_HALF_WIDTH_METERS) continue
      worldLine(ctx, { x: edge, z }, { x: edge, z: next }, camera, viewport, '#f4f1df', 0.15)
    }
  }

  const dashOffset = distance % 14
  for (const divider of [-1.8, 1.8]) {
    for (let z = startZ - dashOffset; z < endZ; z += 14) {
      const from = Math.max(startZ, z)
      const to = Math.min(endZ, z + 7)
      if (hasIntersection && to >= INTERSECTION_DISTANCE_METERS - ROAD_HALF_WIDTH_METERS && from <= INTERSECTION_DISTANCE_METERS + ROAD_HALF_WIDTH_METERS) continue
      worldLine(ctx, { x: divider, z: from }, { x: divider, z: to }, camera, viewport, '#f5f1d3', 0.11)
    }
  }

  if (!hasIntersection) return
  for (const edge of [INTERSECTION_DISTANCE_METERS - ROAD_HALF_WIDTH_METERS, INTERSECTION_DISTANCE_METERS + ROAD_HALF_WIDTH_METERS]) {
    for (let x = -ROAD_VIEW_DISTANCE_METERS; x < ROAD_VIEW_DISTANCE_METERS; x += 12) worldLine(ctx, { x, z: edge }, { x: x + 12, z: edge }, camera, viewport, '#f4f1df', 0.15)
  }
  for (const divider of [INTERSECTION_DISTANCE_METERS - 1.8, INTERSECTION_DISTANCE_METERS + 1.8]) {
    for (let x = -ROAD_VIEW_DISTANCE_METERS - dashOffset; x < ROAD_VIEW_DISTANCE_METERS; x += 14) worldLine(ctx, { x, z: divider }, { x: x + 7, z: divider }, camera, viewport, '#f5f1d3', 0.11)
  }

  const stopZ = INTERSECTION_DISTANCE_METERS - INTERSECTION_HALF_DEPTH_METERS - 2
  worldLine(ctx, { x: -ROAD_HALF_WIDTH_METERS, z: stopZ }, { x: ROAD_HALF_WIDTH_METERS, z: stopZ }, camera, viewport, '#ffffff', 0.35)
  for (let x = -ROAD_HALF_WIDTH_METERS; x < ROAD_HALF_WIDTH_METERS; x += 1.8) {
    worldLine(ctx, { x, z: stopZ - 2.4 }, { x: x + 1.1, z: stopZ - 2.4 }, camera, viewport, '#f8f6ec', 0.65)
  }
}

function drawTrafficLight(ctx: CanvasRenderingContext2D, camera: CameraPose, viewport: Viewport, colour: 'red' | 'yellow' | 'green') {
  const base = worldToScreen({ x: 7.4, z: INTERSECTION_DISTANCE_METERS - ROAD_HALF_WIDTH_METERS }, camera, viewport.width, viewport.height)
  if (!base) return false
  const poleHeight = Math.max(30, 155 * base.scale)
  const boxWidth = Math.max(16, 45 * base.scale)
  const boxHeight = Math.max(38, 95 * base.scale)
  const boxX = base.x - boxWidth / 2
  const boxY = base.y - poleHeight - boxHeight
  ctx.fillStyle = '#333b40'
  ctx.fillRect(base.x - Math.max(2, 4 * base.scale), boxY + boxHeight - 2, Math.max(4, 8 * base.scale), poleHeight + 2)
  ctx.fillStyle = '#20282d'
  ctx.beginPath()
  ctx.roundRect(boxX, boxY, boxWidth, boxHeight, Math.max(3, 7 * base.scale))
  ctx.fill()
  const colours = ['red', 'yellow', 'green'] as const
  colours.forEach((name, index) => {
    ctx.beginPath()
    ctx.arc(base.x, boxY + boxHeight * (0.22 + index * 0.29), Math.max(4, boxWidth * 0.19), 0, Math.PI * 2)
    ctx.fillStyle = name === colour ? ({ red: '#ef4e43', yellow: '#ffd041', green: '#42cc75' }[name]) : '#4b5358'
    ctx.fill()
  })
  return true
}

function drawLeadVehicle(ctx: CanvasRenderingContext2D, camera: CameraPose, viewport: Viewport) {
  const ground = worldToScreen({ x: camera.x, z: camera.z + 48 }, camera, viewport.width, viewport.height)
  if (!ground) return
  const width = 56 * ground.scale + 18
  const height = width * 0.58
  ctx.fillStyle = '#26333f'
  ctx.fillRect(ground.x - width / 2, ground.y - height, width, height)
  ctx.fillStyle = '#79a5bb'
  ctx.fillRect(ground.x - width * 0.31, ground.y - height * 0.78, width * 0.62, height * 0.36)
  ctx.fillStyle = '#171b1e'
  ctx.beginPath()
  ctx.arc(ground.x - width * 0.3, ground.y, width * 0.1, 0, Math.PI * 2)
  ctx.arc(ground.x + width * 0.3, ground.y, width * 0.1, 0, Math.PI * 2)
  ctx.fill()
}

function drawCockpit(ctx: CanvasRenderingContext2D, viewport: Viewport, steeringAngle: number, signal: 'left' | 'right' | null) {
  const centre = viewport.width / 2
  const bottom = viewport.height
  const dashboardTop = viewport.height * 0.72
  const wheelCentreY = viewport.height * 0.905
  const wheelRadius = Math.min(viewport.height * 0.17, viewport.width * 0.096)
  ctx.fillStyle = '#172129'
  ctx.beginPath()
  ctx.moveTo(centre - viewport.width * 0.33, bottom)
  ctx.bezierCurveTo(centre - viewport.width * 0.25, viewport.height * 0.79, centre - viewport.width * 0.15, dashboardTop, centre, dashboardTop)
  ctx.bezierCurveTo(centre + viewport.width * 0.15, dashboardTop, centre + viewport.width * 0.25, viewport.height * 0.79, centre + viewport.width * 0.33, bottom)
  ctx.closePath()
  ctx.fill()
  ctx.save()
  ctx.translate(centre, wheelCentreY)
  ctx.rotate((steeringAngle * Math.PI) / 180)
  ctx.fillStyle = '#0b1014'
  ctx.strokeStyle = '#34444e'
  ctx.lineWidth = Math.max(4, wheelRadius * 0.09)
  ctx.beginPath()
  ctx.arc(0, 0, wheelRadius, Math.PI, 0)
  ctx.lineTo(wheelRadius * 1.52, wheelRadius * 0.56)
  ctx.lineTo(-wheelRadius * 1.52, wheelRadius * 0.56)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#25333d'
  ctx.strokeStyle = '#52636d'
  ctx.lineWidth = Math.max(4, wheelRadius * 0.1)
  ctx.beginPath()
  ctx.arc(0, 0, wheelRadius * 0.47, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.restore()
  if (signal) {
    ctx.fillStyle = '#62d584'
    ctx.font = `bold ${Math.max(24, viewport.height * 0.083)}px system-ui`
    ctx.fillText(signal === 'left' ? '←' : '→', signal === 'left' ? viewport.width * 0.25 : viewport.width * 0.7, viewport.height * 0.925)
  }
}

function drawScene(canvas: HTMLCanvasElement, props: Props, camera: CameraPose, steeringAngle: number, viewport: Viewport, pixelRatio: number) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return false
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
  ctx.clearRect(0, 0, viewport.width, viewport.height)
  const hasIntersection = INTERSECTION_TYPES.has(props.scenario.type)
  const sky = ctx.createLinearGradient(0, 0, 0, viewport.height)
  sky.addColorStop(0, '#88c9f4')
  sky.addColorStop(1, '#eaf5fb')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, viewport.width, viewport.height)
  ctx.fillStyle = props.scenario.environment === 'freeway' ? '#678a56' : '#779861'
  ctx.fillRect(0, viewport.height * 0.38, viewport.width, viewport.height * 0.56)
  if (props.scenario.environment === 'urban') {
    const unit = Math.min(viewport.width / 960, viewport.height / 540)
    ctx.fillStyle = '#ddd7cb'
    ctx.fillRect(viewport.width * 0.06, viewport.height * 0.29, 140 * unit, 90 * unit)
    ctx.fillStyle = '#e1c8ad'
    ctx.fillRect(viewport.width * 0.82, viewport.height * 0.27, 125 * unit, 100 * unit)
    ctx.fillStyle = '#4a783f'
    ctx.beginPath()
    ctx.arc(viewport.width * 0.26, viewport.height * 0.37, 38 * unit, 0, Math.PI * 2)
    ctx.arc(viewport.width * 0.75, viewport.height * 0.37, 45 * unit, 0, Math.PI * 2)
    ctx.fill()
  }
  drawRoad(ctx, camera, viewport, hasIntersection, props.scenarioDistanceMeters)
  if (props.scenario.type === 'slow-lead' || props.scenario.type === 'freeway-merge') drawLeadVehicle(ctx, camera, viewport)
  const trafficLightVisible = props.scenario.trafficLight ? drawTrafficLight(ctx, camera, viewport, props.scenario.trafficLight) : false
  drawCockpit(ctx, viewport, steeringAngle, props.signal)
  return trafficLightVisible
}

export function CanvasRoadScene(props: Props) {
  const { scenario, speedKph, lane, lanePosition, laneChangeDirection, laneChangeProgress, signal, recentAction, scenarioDistanceMeters, turnDirection, turnProgress, turnStartDistanceMeters, reducedMotion } = props
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hasIntersection = INTERSECTION_TYPES.has(scenario.type)
  const phase = hasIntersection ? intersectionPhase(scenarioDistanceMeters) : null
  const camera = vehiclePose(scenarioDistanceMeters, reducedMotion ? lane : lanePosition, turnDirection, turnProgress, turnStartDistanceMeters)
  const laneSteeringAngle = reducedMotion || laneChangeDirection === 0 ? 0 : laneChangeDirection * 7 * Math.sin(laneChangeProgress * Math.PI * 2)
  const turnSign = turnDirection === 'right' ? 1 : turnDirection === 'left' ? -1 : 0
  const steeringAngle = turnDirection ? turnSign * 25 * Math.sin(turnProgress * Math.PI) : laneSteeringAngle
  const laneName = lane === -1 ? 'Left' : lane === 1 ? 'Right' : 'Centre'
  const stageLabel = turnDirection
    ? `Turning ${turnDirection}`
    : phase === 'ahead' ? 'Intersection ahead'
      : phase === 'approaching' ? 'Intersection approaching'
        : phase === 'decision' ? 'Decision zone'
          : phase === 'crossing' ? 'Crossing intersection'
            : 'Intersection passed'
  const label = `First-person ${scenario.environment} road scene for ${scenario.title}. ${hasIntersection ? `${stageLabel}. ` : ''}Current speed ${Math.round(speedKph)} kilometres per hour.`
  const feedbackLabel = recentAction === 'signal-left' ? `Left signal ${signal === 'left' ? 'on' : 'off'}`
    : recentAction === 'signal-right' ? `Right signal ${signal === 'right' ? 'on' : 'off'}`
      : recentAction === 'lane-left' ? `Changing one lane left — target ${laneName} lane`
        : recentAction === 'lane-right' ? `Changing one lane right — target ${laneName} lane`
          : recentAction === 'turn-left' ? 'Turning left through the intersection'
            : recentAction === 'turn-right' ? 'Turning right through the intersection'
              : recentAction ? feedbackLabels[recentAction] : undefined

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const render = () => {
      const bounds = canvas.getBoundingClientRect()
      const viewport = { width: Math.max(320, bounds.width), height: Math.max(180, bounds.height) }
      const pixelRatio = Math.min(2, window.devicePixelRatio || 1)
      const targetWidth = Math.round(viewport.width * pixelRatio)
      const targetHeight = Math.round(viewport.height * pixelRatio)
      if (canvas.width !== targetWidth) canvas.width = targetWidth
      if (canvas.height !== targetHeight) canvas.height = targetHeight
      const visible = drawScene(canvas, props, camera, steeringAngle, viewport, pixelRatio)
      canvas.dataset.trafficLightVisible = String(visible)
    }
    render()
    const observer = new ResizeObserver(render)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [camera, props, steeringAngle])

  return (
    <div className="road-frame" data-testid="road-world" data-camera-x={camera.x.toFixed(2)} data-camera-z={camera.z.toFixed(2)} data-camera-heading={camera.heading.toFixed(3)} data-intersection-phase={phase ?? 'none'}>
      <canvas ref={canvasRef} className="road-scene" width="1920" height="1080" role="img" aria-label={label} data-testid="driving-canvas" data-lane-position={(reducedMotion ? lane : lanePosition).toFixed(2)} data-steering-angle={steeringAngle.toFixed(1)} />
      <div className={`mirror mirror-left ${recentAction === 'mirror-left' ? 'mirror-checked' : ''}`} aria-hidden="true"><b>LEFT MIRROR</b><span /></div>
      <div className={`mirror mirror-right ${recentAction === 'mirror-right' ? 'mirror-checked' : ''}`} aria-hidden="true"><b>RIGHT MIRROR</b><span /></div>
      <div className="lane-indicator" aria-label="Current lane" aria-live="polite">
        {(['Left', 'Centre', 'Right'] as const).map((name, index) => <span key={name} className={lane === index - 1 ? 'current' : ''}><i aria-hidden="true">▲</i>{name}</span>)}
      </div>
      {hasIntersection && phase !== 'passed' && <div className={`scene-event ${phase === 'decision' || phase === 'crossing' ? 'decision' : ''}`} aria-live="polite"><strong>{stageLabel}</strong><span>{turnDirection ? 'Follow the road into the new street' : phase === 'crossing' ? 'Intersection is passing under the car' : phase === 'decision' ? 'Correct lane · slow down · turn' : 'Watch the signal and road markings'}</span></div>}
      {recentAction && feedbackLabel && <div className={`action-feedback feedback-${recentAction}`} role="status"><span>{recentAction.includes('left') ? '←' : '→'}</span>{feedbackLabel}</div>}
    </div>
  )
}
