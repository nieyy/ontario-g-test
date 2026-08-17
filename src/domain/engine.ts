import { newmarketCentre, scenarioOrder } from '../content/data'
import { newmarketRoadProfile } from '../content/roadProfiles/newmarket'
import type { RoadPosition } from '../content/roadProfiles/types'
import type {
  ActionType,
  AttemptRecordV2,
  AttemptRuntimeContext,
  Finding,
  FindingDimension,
  PracticeScope,
  ResolvedRunConfig,
  RunConfig,
  InputAction,
  RunStage,
  ScenarioType,
  ScenarioVariant,
} from '../content/types'
import {
  advanceRoadPosition,
  canTurnFromRoad,
  createRoadPosition,
  getRoadFacts,
  requestAdjacentLane,
} from './roadModel'

export const TICK_SECONDS = 0.1
export const INTERSECTION_DECISION_DISTANCE_METERS = 180
export const INTERSECTION_TURN_EXIT_DISTANCE_METERS = 245
export const LANE_CHANGE_DURATION_SECONDS = 0.9
export const TAP_ACCELERATION_KPH = 1.5
export const TAP_BRAKING_KPH = 2.5
const TURN_DURATION_SECONDS = 1.4

export type EngineState = {
  seed: number
  route: ScenarioVariant[]
  scenarioIndex: number
  scenarioElapsed: number
  scenarioDistanceMeters: number
  elapsed: number
  speedKph: number
  lane: -1 | 0 | 1
  lanePosition: number
  laneChangeFrom: number | null
  laneChangeElapsed: number
  roadPosition: RoadPosition
  laneOffsetM: number
  laneChangeFromOffsetM: number | null
  signal: 'left' | 'right' | null
  turnDirection: 'left' | 'right' | null
  turnProgress: number
  turnStartDistanceMeters: number | null
  stage: RunStage
  paused: boolean
  dangerPending: boolean
  completed: boolean
  actions: InputAction[]
  scenarioActions: InputAction[]
  findings: Finding[]
}

function mulberry32(seed: number) {
  let value = seed >>> 0
  return () => {
    value += 0x6d2b79f5
    let t = value
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function buildRoute(seed: number, onlyType?: ScenarioType, variantId?: string): ScenarioVariant[] {
  const random = mulberry32(seed)
  const types = onlyType ? [onlyType] : scenarioOrder
  return types.map((type) => {
    const choices = newmarketCentre.variants[type]
    if (variantId) {
      const selected = choices.find((candidate) => candidate.id === variantId)
      if (!selected) throw new Error(`Variant ${variantId} does not belong to ${type}`)
      return selected
    }
    return choices[Math.floor(random() * choices.length)]
  })
}

export function createRunConfig(input: {
  centreId: 'newmarket'
  mode: 'exam' | 'practice'
  scope?: PracticeScope
  seed: number
}): RunConfig {
  if (input.mode === 'exam') return { mode: 'exam', centreId: input.centreId, scope: { kind: 'full-route' }, initialGuidance: 'off', seed: input.seed }
  return { mode: 'practice', centreId: input.centreId, scope: input.scope ?? { kind: 'full-route' }, initialGuidance: 'guided', seed: input.seed }
}

export function resolveRunConfig(config: RunConfig): ResolvedRunConfig {
  if (config.mode === 'exam') return config
  if (config.scope.kind === 'full-route') return config as ResolvedRunConfig
  const choices = newmarketCentre.variants[config.scope.scenarioType]
  const variantId = config.scope.variantId ?? choices[Math.floor(mulberry32(config.seed)() * choices.length)].id
  if (!choices.some((variant) => variant.id === variantId)) throw new Error(`Unknown ${config.scope.scenarioType} variant ${variantId}`)
  return { ...config, scope: { ...config.scope, variantId } }
}

export function createEngine(config: ResolvedRunConfig): EngineState
export function createEngine(seed: number, stage?: RunStage, onlyType?: ScenarioType): EngineState
export function createEngine(configOrSeed: ResolvedRunConfig | number, legacyStage: RunStage = 'exam', legacyType?: ScenarioType): EngineState {
  const config = typeof configOrSeed === 'number'
    ? resolveRunConfig(createRunConfig({
        centreId: 'newmarket',
        mode: legacyStage === 'exam' ? 'exam' : 'practice',
        scope: legacyType ? { kind: 'scenario', scenarioType: legacyType, practiceSessionId: `legacy-${configOrSeed}`, roundIndex: 1 } : { kind: 'full-route' },
        seed: configOrSeed,
      }))
    : configOrSeed
  const scenarioScope = config.mode === 'practice' && config.scope.kind === 'scenario' ? config.scope : undefined
  const stage: RunStage = config.mode === 'exam' ? 'exam' : legacyStage === 'continued-practice' ? 'continued-practice' : 'practice'
  const route = buildRoute(config.seed, scenarioScope?.scenarioType, scenarioScope?.variantId)
  const roadPosition = createRoadPosition(route[0].routeBinding, route[0].type)
  const laneOffsetM = getRoadFacts(roadPosition).laneOffsetM
  return {
    seed: config.seed,
    route,
    scenarioIndex: 0,
    scenarioElapsed: 0,
    scenarioDistanceMeters: 0,
    elapsed: 0,
    speedKph: 0,
    lane: 0,
    lanePosition: 0,
    laneChangeFrom: null,
    laneChangeElapsed: 0,
    roadPosition,
    laneOffsetM,
    laneChangeFromOffsetM: null,
    signal: null,
    turnDirection: null,
    turnProgress: 0,
    turnStartDistanceMeters: null,
    stage,
    paused: false,
    dangerPending: false,
    completed: false,
    actions: [],
    scenarioActions: [],
    findings: [],
  }
}

export function currentScenario(state: EngineState): ScenarioVariant {
  return state.route[Math.min(state.scenarioIndex, state.route.length - 1)]
}

export function canStartTurn(state: EngineState, type: 'turn-left' | 'turn-right'): boolean {
  if (
    state.turnDirection
    || state.laneChangeFrom !== null
  ) return false
  return canTurnFromRoad(state.roadPosition, type === 'turn-left' ? 'left' : 'right')
}

export function recordAction(state: EngineState, type: ActionType): EngineState {
  if (state.completed || (state.paused && type !== 'pause')) return state
  if ((state.turnDirection || state.laneChangeFrom !== null) && (type.startsWith('lane-') || type.startsWith('turn-'))) return state
  if ((type === 'turn-left' || type === 'turn-right') && !canStartTurn(state, type)) return state

  let lane = state.lane
  let laneChangeFrom = state.laneChangeFrom
  let laneChangeElapsed = state.laneChangeElapsed
  let roadPosition = state.roadPosition
  const laneOffsetM = state.laneOffsetM
  let laneChangeFromOffsetM = state.laneChangeFromOffsetM
  let signal = state.signal
  let speedKph = state.speedKph
  let turnDirection = state.turnDirection
  let turnStartDistanceMeters = state.turnStartDistanceMeters

  if (type === 'lane-left' || type === 'lane-right') {
    const result = requestAdjacentLane(state.roadPosition, type === 'lane-left' ? 'left' : 'right')
    if (!result.accepted) return state
    roadPosition = result.position
    lane = Math.max(-1, Math.min(1, lane + (type === 'lane-left' ? -1 : 1))) as -1 | 0 | 1
    laneChangeFromOffsetM = state.laneOffsetM
  }
  const roadLaneChanged = roadPosition.laneId !== state.roadPosition.laneId
  if (type.startsWith('lane-') && lane === state.lane && !roadLaneChanged) return state
  if (lane !== state.lane || roadLaneChanged) {
    laneChangeFrom = state.lanePosition
    laneChangeElapsed = 0
  }
  if (roadPosition !== state.roadPosition && laneChangeFromOffsetM === null) laneChangeFromOffsetM = laneOffsetM
  if (type === 'signal-left') signal = signal === 'left' ? null : 'left'
  if (type === 'signal-right') signal = signal === 'right' ? null : 'right'
  if (type === 'accelerate') speedKph = Math.min(120, speedKph + TAP_ACCELERATION_KPH)
  if (type === 'brake') speedKph = Math.max(0, speedKph - TAP_BRAKING_KPH)
  if (type === 'turn-left') {
    turnDirection = 'left'
    turnStartDistanceMeters = state.scenarioDistanceMeters
  }
  if (type === 'turn-right') {
    turnDirection = 'right'
    turnStartDistanceMeters = state.scenarioDistanceMeters
  }

  const action = { type, atSeconds: state.elapsed }

  return {
    ...state,
    lane,
    laneChangeFrom,
    laneChangeElapsed,
    roadPosition,
    laneOffsetM,
    laneChangeFromOffsetM,
    signal,
    speedKph,
    turnDirection,
    turnStartDistanceMeters,
    actions: [...state.actions, action],
    scenarioActions: [...state.scenarioActions, action],
  }
}

function dimensionFor(action: ActionType): FindingDimension {
  if (action.startsWith('mirror') || action.startsWith('shoulder')) return 'observation'
  if (action.startsWith('signal')) return 'signalling'
  if (action === 'accelerate' || action === 'brake') return 'speed'
  if (action.startsWith('lane')) return 'space'
  return 'decision'
}

const actionLabels: Partial<Record<ActionType, string>> = {
  'signal-left': 'left signal',
  'signal-right': 'right signal',
  'mirror-left': 'left mirror check',
  'mirror-right': 'right mirror check',
  'shoulder-left': 'left blind-spot check',
  'shoulder-right': 'right blind-spot check',
  'lane-left': 'left lane movement',
  'lane-right': 'right lane movement',
  'turn-left': 'left turn',
  'turn-right': 'right turn',
  accelerate: 'acceleration to traffic speed',
  brake: 'controlled braking',
}

function evaluateScenario(state: EngineState): Finding[] {
  const scenario = currentScenario(state)
  const observed = new Set(state.scenarioActions.map((action) => action.type))
  const findings: Finding[] = []

  for (const required of scenario.requiredActions) {
    if (observed.has(required)) continue
    const dangerous = scenario.dangerousWhenMissing.includes(required)
    findings.push({
      id: `${state.seed}-${scenario.id}-${required}`,
      scenarioId: scenario.id,
      scenarioType: scenario.type,
      dimension: dimensionFor(required),
      severity: dangerous ? 'dangerous' : 'improve',
      situation: scenario.title,
      action: `No ${actionLabels[required] ?? required} was recorded.`,
      impact: dangerous
        ? 'This can hide an immediate conflict or create a major speed difference.'
        : 'The examiner may not see a complete, predictable routine.',
      improvement: `Use the full routine and make the ${actionLabels[required] ?? required} visible before committing.`,
      evidence: scenario.evidence,
      atSeconds: state.elapsed,
    })
  }

  const speedGap = Math.abs(state.speedKph - scenario.targetSpeedKph)
  if (speedGap > 18 && scenario.type !== 'right-on-red') {
    findings.push({
      id: `${state.seed}-${scenario.id}-speed`,
      scenarioId: scenario.id,
      scenarioType: scenario.type,
      dimension: 'speed',
      severity: scenario.environment === 'freeway' && state.speedKph < scenario.targetSpeedKph - 25 ? 'dangerous' : 'improve',
      situation: `${scenario.title} at ${Math.round(state.speedKph)} km/h`,
      action: `Speed differed substantially from the authored traffic target of ${scenario.targetSpeedKph} km/h.`,
      impact: 'A large speed difference reduces time and space for everyone to react.',
      improvement: 'Scan early and adjust smoothly so speed is appropriate before the decision point.',
      evidence: scenario.evidence,
      atSeconds: state.elapsed,
    })
  }

  if (!findings.length) {
    findings.push({
      id: `${state.seed}-${scenario.id}-good`,
      scenarioId: scenario.id,
      scenarioType: scenario.type,
      dimension: 'decision',
      severity: 'good',
      situation: scenario.title,
      action: 'The expected observation and control sequence was completed.',
      impact: 'The manoeuvre was predictable and left time to respond to conflicts.',
      improvement: 'Keep the same visible scan–signal–position–speed routine.',
      evidence: scenario.evidence,
      atSeconds: state.elapsed,
    })
  }

  return findings
}

function completeScenario(state: EngineState): EngineState {
  const findings = evaluateScenario(state)
  const dangerPending = findings.some((finding) => finding.severity === 'dangerous')
  const isFinal = state.scenarioIndex >= state.route.length - 1
  const nextScenarioIndex = isFinal ? state.scenarioIndex : state.scenarioIndex + 1
  const nextScenario = state.route[nextScenarioIndex]
  const roadPosition = isFinal ? state.roadPosition : createRoadPosition(nextScenario.routeBinding, nextScenario.type)
  const laneOffsetM = getRoadFacts(roadPosition).laneOffsetM

  return {
    ...state,
    findings: [...state.findings, ...findings],
    scenarioIndex: nextScenarioIndex,
    scenarioElapsed: 0,
    scenarioDistanceMeters: 0,
    scenarioActions: [],
    lane: 0,
    lanePosition: 0,
    laneChangeFrom: null,
    laneChangeElapsed: 0,
    roadPosition,
    laneOffsetM,
    laneChangeFromOffsetM: null,
    signal: null,
    turnDirection: null,
    turnProgress: 0,
    turnStartDistanceMeters: null,
    paused: dangerPending,
    dangerPending,
    completed: isFinal && !dangerPending,
  }
}

export function advanceEngine(
  state: EngineState,
  seconds: number,
  controls: ReadonlySet<ActionType> = new Set(),
): EngineState {
  if (state.paused || state.completed || seconds <= 0) return state

  const scenario = currentScenario(state)
  const acceleration = controls.has('accelerate') ? 18 : 0
  const braking = controls.has('brake') ? 34 : 0
  // Keyboard-friendly speed assist: releasing both pedals holds the chosen
  // speed so attention can stay on observation and decision practice.
  const nextSpeed = Math.max(0, Math.min(120, state.speedKph + (acceleration - braking) * seconds))
  const nextElapsed = state.scenarioElapsed + seconds
  const currentDistance = state.scenarioDistanceMeters ?? 0
  const nextDistance = currentDistance + ((state.speedKph + nextSpeed) / 2 / 3.6) * seconds
  const deltaDistance = nextDistance - currentDistance
  const nextRoadPosition = advanceRoadPosition(state.roadPosition, deltaDistance, scenario.routeBinding)
  const nextTurnProgress = state.turnDirection
    ? Math.min(1, state.turnProgress + seconds / TURN_DURATION_SECONDS)
    : 0
  const nextLaneChangeElapsed = state.laneChangeFrom === null
    ? 0
    : Math.min(LANE_CHANGE_DURATION_SECONDS, state.laneChangeElapsed + seconds)
  const laneChangeProgress = state.laneChangeFrom === null
    ? 1
    : nextLaneChangeElapsed / LANE_CHANGE_DURATION_SECONDS
  const easedLaneProgress = laneChangeProgress * laneChangeProgress * (3 - 2 * laneChangeProgress)
  const nextLanePosition = state.laneChangeFrom === null
    ? state.lanePosition
    : state.laneChangeFrom + (state.lane - state.laneChangeFrom) * easedLaneProgress
  const laneChangeComplete = state.laneChangeFrom !== null && laneChangeProgress >= 1
  const targetRoadOffset = getRoadFacts(nextRoadPosition, newmarketRoadProfile).laneOffsetM
  const nextLaneOffsetM = state.laneChangeFromOffsetM === null
    ? targetRoadOffset
    : state.laneChangeFromOffsetM + (targetRoadOffset - state.laneChangeFromOffsetM) * easedLaneProgress
  const updated: EngineState = {
    ...state,
    speedKph: nextSpeed,
    elapsed: state.elapsed + seconds,
    scenarioElapsed: nextElapsed,
    scenarioDistanceMeters: nextDistance,
    turnProgress: nextTurnProgress,
    lanePosition: laneChangeComplete ? state.lane : nextLanePosition,
    laneChangeFrom: laneChangeComplete ? null : state.laneChangeFrom,
    laneChangeElapsed: laneChangeComplete ? 0 : nextLaneChangeElapsed,
    roadPosition: nextRoadPosition,
    laneOffsetM: laneChangeComplete ? targetRoadOffset : nextLaneOffsetM,
    laneChangeFromOffsetM: laneChangeComplete ? null : state.laneChangeFromOffsetM,
  }

  if (state.turnDirection && nextTurnProgress >= 1) return completeScenario(updated)

  if (nextElapsed + 1e-9 < scenario.durationSeconds) return updated
  return completeScenario(updated)
}

export function resolveDanger(state: EngineState, choice: 'end' | 'continue'): EngineState {
  if (!state.dangerPending) return state
  return {
    ...state,
    stage: choice === 'continue' && state.stage === 'exam' ? 'continued-practice' : state.stage,
    paused: false,
    dangerPending: false,
    completed: choice === 'end' || state.scenarioIndex >= state.route.length - 1,
  }
}

function inferredConfig(state: EngineState): ResolvedRunConfig {
  if (state.stage === 'exam') return resolveRunConfig(createRunConfig({ centreId: 'newmarket', mode: 'exam', seed: state.seed }))
  const only = state.route.length === 1 ? state.route[0] : undefined
  return resolveRunConfig(createRunConfig({
    centreId: 'newmarket',
    mode: 'practice',
    seed: state.seed,
    scope: only
      ? { kind: 'scenario', scenarioType: only.type, variantId: only.id, practiceSessionId: `legacy-${state.seed}`, roundIndex: 1 }
      : { kind: 'full-route' },
  }))
}

export function toAttemptRecord(
  state: EngineState,
  startedAt: string,
  config: ResolvedRunConfig = inferredConfig(state),
  runtime: AttemptRuntimeContext = {
    originMode: config.mode,
    guidanceMode: config.initialGuidance,
    findingContext: config.mode,
    continuedAfterDangerAtSeconds: state.stage === 'continued-practice' ? state.elapsed : undefined,
  },
  guidanceSummary: AttemptRecordV2['guidanceSummary'] = [],
): AttemptRecordV2 {
  const dangerousFindingIds = state.findings
    .filter((finding) => finding.severity === 'dangerous')
    .map((finding) => finding.id)
  const runStage: RunStage = runtime.originMode === 'practice'
    ? 'practice'
    : runtime.continuedAfterDangerAtSeconds === undefined
      ? 'exam'
      : 'continued-practice'
  const findings = state.findings.map((finding) => ({
    ...finding,
    context: config.mode === 'practice'
      ? 'practice' as const
      : runtime.continuedAfterDangerAtSeconds !== undefined && finding.atSeconds > runtime.continuedAfterDangerAtSeconds
        ? 'practice' as const
        : 'exam' as const,
  }))
  const scope = config.mode === 'practice' && config.scope.kind === 'scenario'
    ? {
        kind: 'scenario' as const,
        scenarioType: config.scope.scenarioType,
        variantId: config.scope.variantId,
        practiceSessionId: config.scope.practiceSessionId,
        roundIndex: config.scope.roundIndex,
        retryOfAttemptId: config.scope.retryOfAttemptId,
      }
    : { kind: 'full-route' as const }
  return {
    schemaVersion: 2,
    id: `${state.seed}-${startedAt}`,
    centreId: 'newmarket',
    contentVersion: newmarketCentre.contentVersion,
    seed: state.seed,
    startedAt,
    completedAt: state.completed ? new Date().toISOString() : undefined,
    runStage,
    mode: runtime.originMode,
    scope,
    continuedAfterDangerAtSeconds: runtime.continuedAfterDangerAtSeconds,
    durationSeconds: state.elapsed,
    scenarioIds: state.route.map((scenario) => scenario.id),
    actions: state.actions,
    findings,
    dangerousFindingIds,
    completed: state.completed,
    guidanceSummary,
    migrationSource: 'v2',
    roadProfileId: newmarketRoadProfile.id,
    routeId: state.roadPosition.routeId,
    sectionIds: [...new Set(state.route.flatMap((scenario) => scenario.routeBinding.edgeIds.map((edgeId) => getRoadFacts(createRoadPosition({ routeId: scenario.routeBinding.routeId, edgeIds: [edgeId] }, scenario.type)).section.id)))],
  }
}

function hashSeed(value: string): number {
  let hash = 2166136261
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  return hash >>> 0
}

export function restartScenario(input: {
  source: Readonly<EngineState>
  config: ResolvedRunConfig
  strategy: 'same' | 'next'
}): { config: ResolvedRunConfig; state: EngineState } {
  if (input.config.mode !== 'practice' || input.config.scope.kind !== 'scenario') throw new Error('Scenario retry requires focused practice')
  const current = input.config.scope
  const variants = newmarketCentre.variants[current.scenarioType]
  const currentIndex = variants.findIndex((variant) => variant.id === current.variantId)
  if (currentIndex < 0) throw new Error(`Retry source ${current.variantId} is unavailable`)
  const roundIndex = current.roundIndex + 1
  const variantId = input.strategy === 'same' ? current.variantId : variants[(currentIndex + 1) % variants.length].id
  const seed = input.strategy === 'same' ? input.config.seed : hashSeed(`${current.practiceSessionId}:${roundIndex}:${variantId}`)
  const config: ResolvedRunConfig = {
    ...input.config,
    seed,
    scope: { ...current, variantId, roundIndex, retryOfAttemptId: `${input.source.seed}` },
  }
  return { config, state: createEngine(config) }
}

export function summarizeDimensions(findings: Finding[]): Record<FindingDimension, number> {
  const dimensions: FindingDimension[] = ['observation', 'speed', 'space', 'signalling', 'decision']
  return Object.fromEntries(
    dimensions.map((dimension) => {
      const relevant = findings.filter((finding) => finding.dimension === dimension)
      const value = relevant.reduce(
        (score, finding) => score + (finding.severity === 'good' ? 1 : finding.severity === 'improve' ? -1 : -2),
        3,
      )
      return [dimension, Math.max(0, Math.min(5, value))]
    }),
  ) as Record<FindingDimension, number>
}
