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
