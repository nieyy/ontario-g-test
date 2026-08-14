import { newmarketCentre, scenarioOrder } from '../content/data'
import type {
  ActionType,
  AttemptRecord,
  Finding,
  FindingDimension,
  InputAction,
  RunStage,
  ScenarioType,
  ScenarioVariant,
} from '../content/types'

export const TICK_SECONDS = 0.1
export const INTERSECTION_DECISION_DISTANCE_METERS = 180
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
  signal: 'left' | 'right' | null
  turnDirection: 'left' | 'right' | null
  turnProgress: number
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

export function buildRoute(seed: number, onlyType?: ScenarioType): ScenarioVariant[] {
  const random = mulberry32(seed)
  const types = onlyType ? [onlyType] : scenarioOrder
  return types.map((type) => {
    const choices = newmarketCentre.variants[type]
    return choices[Math.floor(random() * choices.length)]
  })
}

export function createEngine(seed: number, stage: RunStage = 'exam', onlyType?: ScenarioType): EngineState {
  return {
    seed,
    route: buildRoute(seed, onlyType),
    scenarioIndex: 0,
    scenarioElapsed: 0,
    scenarioDistanceMeters: 0,
    elapsed: 0,
    speedKph: 0,
    lane: 0,
    signal: null,
    turnDirection: null,
    turnProgress: 0,
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

export function resolveDrivingAction(state: EngineState, type: ActionType): ActionType {
  if (state.turnDirection || state.scenarioDistanceMeters < INTERSECTION_DECISION_DISTANCE_METERS) return type
  const scenario = currentScenario(state)
  if (type === 'lane-right' && scenario.type === 'right-on-red' && state.lane === 1) return 'turn-right'
  if (type === 'lane-left' && scenario.type === 'multilane-left' && state.lane === -1) return 'turn-left'
  return type
}

export function recordAction(state: EngineState, type: ActionType): EngineState {
  if (state.completed || (state.paused && type !== 'pause')) return state

  type = resolveDrivingAction(state, type)
  if (state.turnDirection && (type === 'turn-left' || type === 'turn-right')) return state

  const action = { type, atSeconds: state.elapsed }
  let lane = state.lane
  let signal = state.signal
  let speedKph = state.speedKph
  let turnDirection = state.turnDirection

  if (type === 'lane-left') lane = Math.max(-1, lane - 1) as -1 | 0 | 1
  if (type === 'lane-right') lane = Math.min(1, lane + 1) as -1 | 0 | 1
  if (type === 'signal-left') signal = signal === 'left' ? null : 'left'
  if (type === 'signal-right') signal = signal === 'right' ? null : 'right'
  if (type === 'accelerate') speedKph = Math.min(120, speedKph + 3)
  if (type === 'brake') speedKph = Math.max(0, speedKph - 7)
  if (type === 'turn-left') turnDirection = 'left'
  if (type === 'turn-right') turnDirection = 'right'

  return {
    ...state,
    lane,
    signal,
    speedKph,
    turnDirection,
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
  const dangerPending = state.stage === 'exam' && findings.some((finding) => finding.severity === 'dangerous')
  const isFinal = state.scenarioIndex >= state.route.length - 1

  return {
    ...state,
    findings: [...state.findings, ...findings],
    scenarioIndex: isFinal ? state.scenarioIndex : state.scenarioIndex + 1,
    scenarioElapsed: 0,
    scenarioDistanceMeters: 0,
    scenarioActions: [],
    lane: 0,
    signal: null,
    turnDirection: null,
    turnProgress: 0,
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
  const nextTurnProgress = state.turnDirection
    ? Math.min(1, state.turnProgress + seconds / TURN_DURATION_SECONDS)
    : 0
  const updated: EngineState = {
    ...state,
    speedKph: nextSpeed,
    elapsed: state.elapsed + seconds,
    scenarioElapsed: nextElapsed,
    scenarioDistanceMeters: nextDistance,
    turnProgress: nextTurnProgress,
  }

  if (state.turnDirection && nextTurnProgress >= 1) return completeScenario(updated)

  if (nextElapsed + 1e-9 < scenario.durationSeconds) return updated
  return completeScenario(updated)
}

export function resolveDanger(state: EngineState, choice: 'end' | 'continue'): EngineState {
  if (!state.dangerPending) return state
  return {
    ...state,
    stage: choice === 'continue' ? 'continued-practice' : state.stage,
    paused: false,
    dangerPending: false,
    completed: choice === 'end' || state.scenarioIndex >= state.route.length - 1,
  }
}

export function toAttemptRecord(state: EngineState, startedAt: string): AttemptRecord {
  const dangerousFindingIds = state.findings
    .filter((finding) => finding.severity === 'dangerous')
    .map((finding) => finding.id)
  return {
    id: `${state.seed}-${startedAt}`,
    centreId: 'newmarket',
    contentVersion: newmarketCentre.contentVersion,
    seed: state.seed,
    startedAt,
    completedAt: state.completed ? new Date().toISOString() : undefined,
    runStage: state.stage,
    durationSeconds: state.elapsed,
    scenarioIds: state.route.map((scenario) => scenario.id),
    actions: state.actions,
    findings: state.findings,
    dangerousFindingIds,
    completed: state.completed,
  }
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
