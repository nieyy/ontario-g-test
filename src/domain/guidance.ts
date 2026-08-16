import type {
  CoachFrame,
  CoachState,
  FindingV2,
  GuidanceCompletion,
  GuidanceCondition,
  GuidancePlan,
  GuidanceStep,
  InputAction,
  KeyBinding,
} from '../content/types'
import type { EngineState } from './engine'
import { getRoadFacts } from './roadModel'

export function createCoachState(plan: GuidancePlan): CoachState {
  return {
    planId: plan.id,
    planVersion: plan.version,
    currentStepIndex: 0,
    completedStepIds: [],
    missedStepIds: [],
    lastProcessedActionIndex: -1,
  }
}

function conditionMatches(condition: GuidanceCondition, state: Readonly<EngineState>, actions: readonly InputAction[]): boolean {
  switch (condition.kind) {
    case 'scenario-elapsed-at-least': return state.scenarioElapsed >= condition.seconds
    case 'distance-at-least': return state.scenarioDistanceMeters >= condition.metres
    case 'distance-at-most': return state.scenarioDistanceMeters <= condition.metres
    case 'lane-is': return state.lane === condition.lane
    case 'lane-role-is': return state.roadProfileEnabled
      ? getRoadFacts(state.roadPosition).laneRole === condition.role
      : condition.role === 'through'
        || (condition.role === 'left-turn' && state.lane === -1)
        || ((condition.role === 'right-turn' || condition.role === 'exit') && state.lane === 1)
    case 'lane-transition-available': return state.roadProfileEnabled
      ? getRoadFacts(state.roadPosition).availableLaneActions.some((action) => action.direction === condition.direction)
      : condition.direction === 'left' ? state.lane > -1 : state.lane < 1
    case 'intersection-distance-band': {
      const distance = state.roadProfileEnabled
        ? getRoadFacts(state.roadPosition).intersectionDistanceMeters
        : 230 - state.scenarioDistanceMeters
      return distance !== undefined && distance >= condition.minMetres && distance <= condition.maxMetres
    }
    case 'road-section-kind': return state.roadProfileEnabled && getRoadFacts(state.roadPosition).template === condition.template
    case 'speed-at-most': return state.speedKph <= condition.kph
    case 'speed-at-least': return state.speedKph >= condition.kph
    case 'action-observed': return actions.some((action) => action.type === condition.action)
    case 'turn-completed': return actions.some((action) => action.type === `turn-${condition.direction}`)
  }
}

function allMatch(conditions: GuidanceCondition[] | undefined, state: Readonly<EngineState>, actions: readonly InputAction[]): boolean {
  return Boolean(conditions?.length) && conditions!.every((condition) => conditionMatches(condition, state, actions))
}

function completionMatches(completion: GuidanceCompletion, state: Readonly<EngineState>, actions: readonly InputAction[]): boolean {
  switch (completion.kind) {
    case 'action': return actions.some((action) => action.type === completion.action)
    case 'lane': return state.lane === completion.lane
    case 'speed-range': return state.speedKph >= completion.minKph && state.speedKph <= completion.maxKph
    case 'turn-completed': return actions.some((action) => action.type === `turn-${completion.direction}`)
    case 'scenario-completed': return state.completed || state.scenarioElapsed === 0
  }
}

function positive(step: GuidanceStep, atSeconds: number) {
  return {
    id: `done:${step.id}`,
    tone: 'positive' as const,
    messageEn: `${step.titleEn} complete. Continue the routine.`,
    messageZh: step.titleZh ? `已完成“${step.titleZh}”，继续下一步。` : undefined,
    atSeconds,
  }
}

function corrective(step: GuidanceStep, atSeconds: number) {
  return {
    id: `correct:${step.id}:${atSeconds}`,
    tone: 'corrective' as const,
    messageEn: step.correctiveFeedbackEn ?? `Complete ${step.titleEn.toLowerCase()} before continuing.`,
    messageZh: step.correctiveFeedbackZh,
    atSeconds,
  }
}

export function reduceCoachState(input: {
  coach: Readonly<CoachState>
  plan: GuidancePlan
  engineState: Readonly<EngineState>
  scenarioActions: readonly InputAction[]
  latestFinding?: FindingV2
}): CoachState {
  const { plan, engineState, scenarioActions, latestFinding } = input
  const coach = input.coach.planId === plan.id ? { ...input.coach } : createCoachState(plan)
  let changed = input.coach.planId !== plan.id

  if (coach.feedback && engineState.elapsed - coach.feedback.atSeconds >= 2.5) {
    coach.feedback = undefined
    changed = true
  }

  if (latestFinding?.severity === 'dangerous') {
    const id = `danger:${latestFinding.id}`
    if (coach.feedback?.id !== id) {
      coach.feedback = {
        id,
        tone: 'danger',
        messageEn: `${latestFinding.action} ${latestFinding.improvement}`,
        messageZh: '危险反馈来自评分记录。请阅读原因，并选择重试或继续。',
        atSeconds: engineState.elapsed,
      }
      changed = true
    }
  }

  const unseen = scenarioActions.slice(coach.lastProcessedActionIndex + 1)
  for (const action of unseen) {
    const step = plan.steps[coach.currentStepIndex]
    if (!step) break
    const active = !step.startsWhen.length || step.startsWhen.every((condition) => conditionMatches(condition, engineState, scenarioActions))
    if (active && step.completeWhen.kind === 'action' && step.completeWhen.action === action.type) {
      if (!coach.completedStepIds.includes(step.id)) coach.completedStepIds = [...coach.completedStepIds, step.id]
      coach.currentStepIndex += 1
      coach.feedback = positive(step, engineState.elapsed)
      changed = true
      continue
    }
    if (active && step.oppositeActions?.includes(action.type)) {
      coach.feedback = corrective(step, engineState.elapsed)
      changed = true
    }
  }
  if (unseen.length) {
    coach.lastProcessedActionIndex = scenarioActions.length - 1
    changed = true
  }

  let guard = plan.steps.length + 1
  while (guard-- > 0) {
    const step = plan.steps[coach.currentStepIndex]
    if (!step) break
    const active = !step.startsWhen.length || step.startsWhen.every((condition) => conditionMatches(condition, engineState, scenarioActions))
    if (!active) break
    if (step.completeWhen.kind !== 'action' && completionMatches(step.completeWhen, engineState, scenarioActions)) {
      coach.completedStepIds = [...coach.completedStepIds, step.id]
      coach.currentStepIndex += 1
      coach.feedback = positive(step, engineState.elapsed)
      changed = true
      continue
    }
    if (allMatch(step.expiresWhen, engineState, scenarioActions)) {
      coach.missedStepIds = [...coach.missedStepIds, step.id]
      coach.currentStepIndex += 1
      coach.feedback = corrective(step, engineState.elapsed)
      changed = true
      continue
    }
    break
  }

  return changed ? coach : input.coach as CoachState
}

export function toCoachFrame(input: {
  coach: Readonly<CoachState>
  plan: GuidancePlan
  keyBindings: KeyBinding[]
  subtitlesZh: boolean
}): CoachFrame {
  const labels = new Map(input.keyBindings.map((binding) => [binding.action, binding.label]))
  return {
    planId: input.plan.id,
    currentStepId: input.plan.steps[input.coach.currentStepIndex]?.id,
    completedStepIds: [...input.coach.completedStepIds],
    visibleSteps: input.plan.steps.map((step, index) => ({
      id: step.id,
      state: input.coach.completedStepIds.includes(step.id)
        ? 'done'
        : input.coach.missedStepIds.includes(step.id)
          ? 'missed'
          : index === input.coach.currentStepIndex
            ? 'current'
            : 'upcoming',
      title: input.subtitlesZh && step.titleZh ? `${step.titleEn} · ${step.titleZh}` : step.titleEn,
      instruction: index === input.coach.currentStepIndex
        ? input.subtitlesZh && step.instructionZh
          ? `${step.instructionEn} ${step.instructionZh}`
          : step.instructionEn
        : undefined,
      highlightedAction: index === input.coach.currentStepIndex ? step.highlightedAction : undefined,
      keyLabel: index === input.coach.currentStepIndex && step.highlightedAction ? labels.get(step.highlightedAction) : undefined,
    })),
    feedback: input.coach.feedback,
    progress: { completed: input.coach.completedStepIds.length, total: input.plan.steps.length },
  }
}
