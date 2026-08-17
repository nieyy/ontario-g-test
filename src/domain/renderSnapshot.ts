import type { ActionType, ScenarioVariant } from '../content/types'
import type { EngineState } from './engine'
import { buildVisibleScene } from './threeSceneModel'
import { getRoadFacts } from './roadModel'

export type TrafficActor = {
  id: string
  role: 'lead' | 'opposing' | 'cross' | 'rear'
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

function trafficActors(scenario: ScenarioVariant, elapsed: number, intersectionDistanceM?: number): TrafficActor[] {
  const actors: TrafficActor[] = [{ id: 'rear-1', role: 'rear', lateralM: 0, forwardM: -18 - (elapsed % 4), heading: 0, colour: '#426a84' }]
  if (scenario.type === 'slow-lead') actors.push({ id: 'lead-1', role: 'lead', lateralM: 0, forwardM: 38, heading: 0, colour: '#c65b48' })
  if (scenario.type === 'freeway-merge') actors.push({ id: 'merge-1', role: 'lead', lateralM: -3.6, forwardM: 52 - (elapsed % 12), heading: 0, colour: '#d9d9d5' })
  if (scenario.type === 'multilane-left') actors.push({ id: 'opposing-1', role: 'opposing', lateralM: -3.6, forwardM: 85 - (elapsed * 7) % 70, heading: Math.PI, colour: '#496b9c' })
  if (scenario.type === 'right-on-red' || scenario.type === 'yellow-light') actors.push({ id: 'cross-1', role: 'cross', lateralM: -32 + (elapsed * 6) % 64, forwardM: Math.max(14, intersectionDistanceM ?? 80), heading: Math.PI / 2, colour: '#b1b7bb' })
  return actors
}

export function buildRenderSnapshot(input: { engine: EngineState; scenario: ScenarioVariant; recentAction?: ActionType | null }): RenderSnapshot {
  const road = buildVisibleScene(input.engine.roadPosition, input.engine.laneOffsetM, input.engine.turnDirection, input.engine.turnProgress)
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
    actors: trafficActors(input.scenario, input.engine.scenarioElapsed, distance),
    road,
    recentAction: input.recentAction ?? null,
  }
}
