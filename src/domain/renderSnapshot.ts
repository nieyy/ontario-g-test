import type { ActionType, ScenarioVariant } from '../content/types'
import type { EngineState } from './engine'
import { buildVisibleScene } from './threeSceneModel'
import { getRoadFacts } from './roadModel'

export type TrafficActor = {
  id: string
  role: 'lead' | 'opposing' | 'cross' | 'rear'
  model: 'sedan' | 'suv' | 'pickup'
  lateralM: number
  forwardM: number
  heading: number
  colour: string
}

export type RenderSnapshot = {
  tick: number
  camera: { x: number; z: number; heading: number; laneOffsetM: number }
  steeringAngle: number
  intersectionPhase: 'none' | 'ahead' | 'approaching' | 'decision' | 'crossing' | 'passed'
  trafficLightVisible: boolean
  trafficLight: 'red' | 'yellow' | 'green' | null
  actors: TrafficActor[]
  road: ReturnType<typeof buildVisibleScene>
  recentAction: ActionType | null
}

const TRAFFIC_COLOURS = ['#496b9c', '#b9b9b3', '#8b4038', '#416b55', '#a78245', '#5f586f'] as const
const TRAFFIC_MODELS = ['sedan', 'suv', 'pickup'] as const

function randomUnit(seed: number, stream: number, cycle: number, channel: number): number {
  let value = (seed ^ Math.imul(stream + 1, 0x9e3779b1) ^ Math.imul(cycle + 11, 0x85ebca6b) ^ Math.imul(channel + 7, 0xc2b2ae35)) >>> 0
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d)
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b)
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296
}

function streamActor(input: {
  seed: number
  elapsed: number
  stream: number
  role: TrafficActor['role']
  heading: number
  start: number
  end: number
  lateralM: number
  forwardM: number
  axis: 'forward' | 'lateral'
  slotSeconds?: number
}): TrafficActor | null {
  const slotSeconds = input.slotSeconds ?? 20
  const cycle = Math.floor(input.elapsed / slotSeconds)
  const localSeconds = input.elapsed - cycle * slotSeconds
  // The first actor is visible immediately. Later actors enter only after a
  // seeded quiet interval, so a completed vehicle cannot visibly teleport.
  const spawnDelay = cycle === 0 ? 0 : 2.5 + randomUnit(input.seed, input.stream, cycle, 0) * 3.5
  const age = localSeconds - spawnDelay
  const speedMps = 9 + randomUnit(input.seed, input.stream, cycle, 1) * 4
  const position = input.start + Math.sign(input.end - input.start) * speedMps * age
  const passedEnd = input.end > input.start ? position > input.end : position < input.end
  if (age < 0 || passedEnd) return null
  const colour = TRAFFIC_COLOURS[Math.floor(randomUnit(input.seed, input.stream, cycle, 2) * TRAFFIC_COLOURS.length)]
  const model = TRAFFIC_MODELS[Math.floor(randomUnit(input.seed, input.stream, cycle, 3) * TRAFFIC_MODELS.length)]
  return {
    id: `${input.role}-${input.stream}-${cycle}`,
    role: input.role,
    model,
    lateralM: input.axis === 'lateral' ? position : input.lateralM,
    forwardM: input.axis === 'forward' ? position : input.forwardM,
    heading: input.heading,
    colour,
  }
}

function trafficActors(seed: number, scenario: ScenarioVariant, elapsed: number, intersectionDistanceM?: number): TrafficActor[] {
  const actors: TrafficActor[] = [{ id: 'rear-1', role: 'rear', model: 'sedan', lateralM: 0, forwardM: -18 - Math.min(5, elapsed * 0.35), heading: 0, colour: '#426a84' }]
  if (scenario.type === 'slow-lead') actors.push({ id: 'lead-1', role: 'lead', model: 'suv', lateralM: 0, forwardM: 38, heading: 0, colour: '#c65b48' })
  if (scenario.type === 'freeway-merge') {
    const actor = streamActor({ seed, elapsed, stream: 1, role: 'lead', heading: 0, start: 78, end: -28, lateralM: -3.6, forwardM: 0, axis: 'forward', slotSeconds: 18 })
    if (actor) actors.push(actor)
  }
  if (scenario.type === 'multilane-left') {
    const actor = streamActor({ seed, elapsed, stream: 2, role: 'opposing', heading: Math.PI, start: 105, end: -28, lateralM: -3.6, forwardM: 0, axis: 'forward' })
    if (actor) actors.push(actor)
  }
  if (scenario.type === 'right-on-red' || scenario.type === 'yellow-light') {
    const actor = streamActor({ seed, elapsed, stream: 3, role: 'cross', heading: Math.PI / 2, start: -42, end: 42, lateralM: 0, forwardM: Math.max(14, intersectionDistanceM ?? 80), axis: 'lateral', slotSeconds: 17 })
    if (actor) actors.push(actor)
  }
  return actors
}

export function buildRenderSnapshot(input: { engine: EngineState; scenario: ScenarioVariant; recentAction?: ActionType | null }): RenderSnapshot {
  const road = buildVisibleScene(input.engine.roadPosition, input.engine.laneOffsetM, input.engine.turnDirection, input.engine.turnProgress, input.scenario.routeBinding.edgeIds)
  const distance = road.intersection?.distanceAheadM ?? getRoadFacts(input.engine.roadPosition).intersectionDistanceMeters
  const intersectionPhase = distance === undefined ? 'none' : distance > 115 ? 'ahead' : distance > 35 ? 'approaching' : distance > 7 ? 'decision' : distance > -18 ? 'crossing' : 'passed'
  const targetLaneOffset = getRoadFacts(input.engine.roadPosition).laneOffsetM
  const laneDirection = input.engine.laneChangeFrom === null ? 0 : Math.sign(targetLaneOffset - (input.engine.laneChangeFromOffsetM ?? input.engine.laneOffsetM))
  const laneProgress = input.engine.laneChangeFrom === null ? 1 : Math.min(1, input.engine.laneChangeElapsed / 0.9)
  const turnSign = input.engine.turnDirection === 'right' ? 1 : input.engine.turnDirection === 'left' ? -1 : 0
  const steeringAngle = input.engine.turnDirection
    ? turnSign * 22 * Math.sin(input.engine.turnProgress * Math.PI)
    : laneDirection * 6 * Math.sin(laneProgress * Math.PI)
  return {
    tick: Math.round(input.engine.elapsed * 10),
    camera: { ...road.camera, laneOffsetM: input.engine.laneOffsetM },
    steeringAngle,
    intersectionPhase,
    trafficLightVisible: road.intersection?.control === 'traffic-signal' && intersectionPhase !== 'passed',
    trafficLight: input.scenario.trafficLight ?? (road.intersection?.control === 'traffic-signal' ? 'red' : null),
    actors: trafficActors(input.engine.seed, input.scenario, input.engine.scenarioElapsed, distance),
    road,
    recentAction: input.recentAction ?? null,
  }
}
