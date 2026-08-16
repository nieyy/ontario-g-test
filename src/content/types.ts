export type CentreId = 'newmarket'

export type RouteStatus = 'preview' | 'playable' | 'retired'

export type ScenarioType =
  | 'right-on-red'
  | 'yellow-light'
  | 'multilane-left'
  | 'freeway-merge'
  | 'slow-lead'
  | 'freeway-exit'

export type EvidenceLevel = 'verified' | 'inferred' | 'authored'

export type Evidence = {
  level: EvidenceLevel
  label: string
  sourceUrl?: string
  checkedOn: string
}

export type ScenarioVariant = {
  id: string
  type: ScenarioType
  title: string
  examinerInstruction: string
  subtitleZh: string
  environment: 'urban' | 'freeway'
  durationSeconds: number
  speedLimitKph: number
  targetSpeedKph: number
  trafficLight?: 'red' | 'yellow' | 'green'
  safeStop?: boolean
  requiredActions: ActionType[]
  dangerousWhenMissing: ActionType[]
  evidence: Evidence
  routeBinding: import('./roadProfiles/types').RouteBinding
}

export type CentreProfile = {
  id: CentreId
  name: string
  address: string
  region: string
  services: string[]
  routeStatus: RouteStatus
  contentVersion: string
  disclaimer: string
  evidence: Evidence[]
  variants: Record<ScenarioType, ScenarioVariant[]>
}

export type ActionType =
  | 'accelerate'
  | 'brake'
  | 'signal-left'
  | 'signal-right'
  | 'mirror-left'
  | 'mirror-right'
  | 'shoulder-left'
  | 'shoulder-right'
  | 'lane-left'
  | 'lane-right'
  | 'turn-left'
  | 'turn-right'
  | 'pause'

export type InputAction = {
  type: ActionType
  atSeconds: number
}

export type FindingDimension =
  | 'observation'
  | 'speed'
  | 'space'
  | 'signalling'
  | 'decision'

export type Finding = {
  id: string
  scenarioId: string
  scenarioType: ScenarioType
  dimension: FindingDimension
  severity: 'good' | 'improve' | 'dangerous'
  situation: string
  action: string
  impact: string
  improvement: string
  evidence: Evidence
  atSeconds: number
}

export type RunStage = 'exam' | 'practice' | 'continued-practice'

export type AttemptMode = 'exam' | 'practice'
export type GuidanceMode = 'off' | 'guided'
export type FindingContext = 'exam' | 'practice' | 'legacy-unknown'

export type PracticeScope =
  | { kind: 'full-route' }
  | {
      kind: 'scenario'
      scenarioType: ScenarioType
      variantId?: string
      practiceSessionId: string
      roundIndex: number
      retryOfAttemptId?: string
    }

export type RunConfig =
  | {
      mode: 'exam'
      centreId: CentreId
      scope: { kind: 'full-route' }
      initialGuidance: 'off'
      seed: number
    }
  | {
      mode: 'practice'
      centreId: CentreId
      scope: PracticeScope
      initialGuidance: 'guided'
      seed: number
    }

export type ResolvedPracticeScope =
  | { kind: 'full-route' }
  | (Extract<PracticeScope, { kind: 'scenario' }> & { variantId: string })

export type ResolvedRunConfig =
  | Extract<RunConfig, { mode: 'exam' }>
  | {
      mode: 'practice'
      centreId: CentreId
      scope: ResolvedPracticeScope
      initialGuidance: 'guided'
      seed: number
    }

export type AttemptStatus =
  | 'briefing'
  | 'running'
  | 'paused'
  | 'danger-review'
  | 'round-summary'
  | 'completed'
  | 'aborted'

export type AttemptRuntimeContext = {
  originMode: AttemptMode
  guidanceMode: GuidanceMode
  findingContext: Exclude<FindingContext, 'legacy-unknown'>
  continuedAfterDangerAtSeconds?: number
}

export type AttemptRecord = {
  id: string
  centreId: CentreId
  contentVersion: string
  seed: number
  startedAt: string
  completedAt?: string
  runStage: RunStage
  durationSeconds: number
  scenarioIds: string[]
  actions: InputAction[]
  findings: Finding[]
  dangerousFindingIds: string[]
  completed: boolean
}

export type FindingV2 = Finding & { context: FindingContext }

export type AttemptRecordV2 = Omit<AttemptRecord, 'findings'> & {
  schemaVersion: 2
  mode: AttemptMode
  scope:
    | { kind: 'full-route' }
    | {
        kind: 'scenario'
        scenarioType: ScenarioType
        variantId: string
        practiceSessionId: string
        roundIndex: number
        retryOfAttemptId?: string
      }
  continuedAfterDangerAtSeconds?: number
  findings: FindingV2[]
  guidanceSummary?: Array<{
    planId: string
    completedStepIds: string[]
    missedStepIds: string[]
  }>
  migrationSource?: 'v1' | 'v2'
  roadProfileId?: string
  routeId?: string
  sectionIds?: string[]
}

export type GuidanceStepPhase = 'prepare' | 'act' | 'confirm'

export type GuidanceCondition =
  | { kind: 'scenario-elapsed-at-least'; seconds: number }
  | { kind: 'distance-at-least'; metres: number }
  | { kind: 'distance-at-most'; metres: number }
  | { kind: 'lane-is'; lane: -1 | 0 | 1 }
  | { kind: 'lane-role-is'; role: import('./roadProfiles/types').LaneRole }
  | { kind: 'lane-transition-available'; direction: 'left' | 'right' }
  | { kind: 'intersection-distance-band'; minMetres: number; maxMetres: number }
  | { kind: 'road-section-kind'; template: import('./roadProfiles/types').RoadSectionTemplate }
  | { kind: 'speed-at-most'; kph: number }
  | { kind: 'speed-at-least'; kph: number }
  | { kind: 'action-observed'; action: ActionType }
  | { kind: 'turn-completed'; direction: 'left' | 'right' }

export type GuidanceCompletion =
  | { kind: 'action'; action: ActionType }
  | { kind: 'lane'; lane: -1 | 0 | 1 }
  | { kind: 'speed-range'; minKph: number; maxKph: number }
  | { kind: 'turn-completed'; direction: 'left' | 'right' }
  | { kind: 'scenario-completed' }

export type GuidanceStep = {
  id: string
  phase: GuidanceStepPhase
  titleEn: string
  titleZh?: string
  instructionEn: string
  instructionZh?: string
  highlightedAction?: ActionType
  startsWhen: GuidanceCondition[]
  completeWhen: GuidanceCompletion
  expiresWhen?: GuidanceCondition[]
  oppositeActions?: ActionType[]
  correctiveFeedbackEn?: string
  correctiveFeedbackZh?: string
}

export type GuidancePlan = {
  id: string
  version: 1
  scenarioType: ScenarioType
  variantIds: string[]
  steps: GuidanceStep[]
  commonMistakes: Array<{
    id: string
    whenAction?: ActionType
    messageEn: string
    messageZh?: string
  }>
}

export type CoachFeedback = {
  id: string
  tone: 'positive' | 'corrective' | 'danger'
  messageEn: string
  messageZh?: string
  atSeconds: number
}

export type CoachState = {
  planId: string
  planVersion: number
  currentStepIndex: number
  completedStepIds: string[]
  missedStepIds: string[]
  lastProcessedActionIndex: number
  feedback?: CoachFeedback
}

export type CoachFrame = {
  planId: string
  currentStepId?: string
  completedStepIds: string[]
  visibleSteps: Array<{
    id: string
    state: 'done' | 'current' | 'upcoming' | 'missed'
    title: string
    instruction?: string
    highlightedAction?: ActionType
    keyLabel?: string
  }>
  feedback?: CoachFeedback
  progress: { completed: number; total: number }
}

export type KeyBinding = {
  action: ActionType
  code: string
  label: string
}

export type Preferences = {
  subtitlesZh: boolean
  speechEnabled: boolean
  ambientSoundEnabled: boolean
  reducedMotion: boolean
  highContrast: boolean
  keyBindings: KeyBinding[]
}
