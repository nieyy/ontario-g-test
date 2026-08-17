import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './styles.css'
import { CoachPanel } from './components/CoachPanel'
import { ModeSelect } from './components/ModeSelect'
import { PracticeRoundSummary } from './components/PracticeRoundSummary'
import { PracticeSelect } from './components/PracticeSelect'
import { RouteMiniMap } from './components/RouteMiniMap'
import { newmarketCentre, scenarioLabels } from './content/data'
import { getGuidancePlan } from './content/guidance'
import { newmarketRoadProfile } from './content/roadProfiles/newmarket'
import type {
  ActionType,
  AttemptRecordV2,
  AttemptRuntimeContext,
  CoachState,
  Finding,
  Preferences,
  ResolvedRunConfig,
  RunConfig,
  ScenarioType,
} from './content/types'
import {
  advanceEngine,
  canStartTurn,
  createEngine,
  createRunConfig,
  currentScenario,
  recordAction,
  resolveRunConfig,
  resolveDanger,
  restartScenario,
  summarizeDimensions,
  TICK_SECONDS,
  toAttemptRecord,
  type EngineState,
} from './domain/engine'
import { createCoachState, reduceCoachState, toCoachFrame } from './domain/guidance'
import { advanceRoadPosition, getRoadFacts } from './domain/roadModel'
import {
  defaultPreferences,
  acquireAttemptLock,
  clearAttempts,
  deleteAttempt,
  deleteCheckpoint,
  exportAttempt,
  getAttempts,
  getLatestCheckpoint,
  loadPreferences,
  normalizeEngineCheckpoint,
  refreshAttemptLock,
  releaseAttemptLock,
  saveAttempt,
  saveCheckpoint,
  savePreferences,
  weakestScenarioSuggestion,
  type AttemptCheckpointV3,
} from './services/storage'
import { speakInstruction } from './services/speech'
import { createRoadAmbience, type RoadAmbience } from './services/roadAmbience'

type View = 'home' | 'centre' | 'mode-select' | 'practice-select' | 'briefing' | 'player' | 'round-summary' | 'report' | 'history' | 'settings'
const ThreeRoadScene = lazy(() => import('./components/ThreeRoadScene').then((module) => ({ default: module.ThreeRoadScene })))
const PRACTICE_MODE_ENABLED = true
type PedalAction = 'accelerate' | 'brake'

const PEDAL_HOLD_DELAY_MS = 350

const actionNames: Record<ActionType, string> = {
  accelerate: 'Accelerate',
  brake: 'Brake',
  'signal-left': 'Left signal',
  'signal-right': 'Right signal',
  'mirror-left': 'Left mirror',
  'mirror-right': 'Right mirror',
  'shoulder-left': 'Left shoulder',
  'shoulder-right': 'Right shoulder',
  'lane-left': 'Move left',
  'lane-right': 'Move right',
  'turn-left': 'Turn left',
  'turn-right': 'Turn right',
  pause: 'Pause',
}

function formatTime(seconds: number) {
  const value = Math.max(0, Math.round(seconds))
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`
}

function seedFromUrl() {
  const value = new URLSearchParams(window.location.search).get('seed')
  return value ? Number(value) || 1 : Date.now() % 1_000_000_000
}

function actionForKey(event: KeyboardEvent, preferences: Preferences): ActionType | undefined {
  const composite = event.shiftKey ? `Shift+${event.code}` : event.code
  const aliases: Record<string, ActionType> = {
    ArrowUp: 'accelerate',
    ArrowDown: 'brake',
    ArrowLeft: 'lane-left',
    ArrowRight: 'lane-right',
    Comma: 'signal-left',
    Period: 'signal-right',
  }
  return aliases[event.code] ?? preferences.keyBindings.find((binding) => binding.code === composite)?.action
}

function SeverityPill({ finding }: { finding: Finding }) {
  const label = finding.severity === 'good' ? 'Good routine' : finding.severity === 'dangerous' ? 'Dangerous moment' : 'Needs practice'
  return <span className={`pill severity-${finding.severity}`}>{label}</span>
}

function Header({ view, navigate }: { view: View; navigate: (view: View) => void }) {
  if (view === 'player') return null
  return (
    <header className="site-header">
      <button className="brand" onClick={() => navigate('home')} aria-label="Ontario G Practice home">
        <span className="brand-mark">G</span>
        <span>Ontario G Practice</span>
      </button>
      <nav aria-label="Main navigation">
        <button className={view === 'history' ? 'active' : ''} onClick={() => navigate('history')}>History</button>
        <button className={view === 'settings' ? 'active' : ''} onClick={() => navigate('settings')}>Settings</button>
      </nav>
    </header>
  )
}

function Home({ start, practiceWeak, weakType, resume, resumeNotice }: { start: () => void; practiceWeak: () => void; weakType?: ScenarioType; resume?: () => void; resumeNotice?: string }) {
  return (
    <main id="main-content">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Independent, local-first practice</p>
          <h1>Make the G-test routine visible before test day.</h1>
          <p className="lede">A 16-minute interactive Newmarket-inspired practice drive: follow an authored low-poly 3D corridor with changing local-road, turn-pocket, arterial, freeway and exit structures, then review each decision.</p>
          <div className="hero-actions">
            <button className="primary large" onClick={start}>Choose a test centre</button>
            {resume && <button className="secondary large" onClick={resume}>Resume interrupted drive</button>}
            {weakType && <button className="secondary large" onClick={practiceWeak}>Practise: {scenarioLabels[weakType]}</button>}
          </div>
          <p className="privacy-note">No account, analytics, ads, map API, or data upload. Attempts stay in this browser.</p>
          {resumeNotice && <p className="checkpoint-notice" role="status">{resumeNotice}</p>}
        </div>
        <div className="hero-visual" aria-label="Illustration of a road toward the horizon">
          <div className="road-card">
            <span className="road-sign">G<br /><small>practice</small></span>
            <span className="road-line road-line-a" />
            <span className="road-line road-line-b" />
          </div>
        </div>
      </section>
      <section className="feature-grid" aria-label="Training features">
        <article><span>01</span><h2>Hear the instruction</h2><p>Common Ontario-style English prompts with optional Chinese subtitles.</p></article>
        <article><span>02</span><h2>Make the decision</h2><p>Mouse, touch, or racing-game-inspired keyboard controls in a lightweight 3D road world.</p></article>
        <article><span>03</span><h2>Review the evidence</h2><p>Situation–action–impact–improvement findings, without invented pass scores.</p></article>
      </section>
    </main>
  )
}

function CentrePicker({ onSelect }: { onSelect: () => void }) {
  return (
    <main id="main-content" className="page-shell">
      <p className="eyebrow">Step 1 of 2</p>
      <h1>Choose a test centre</h1>
      <p className="page-intro">The centre determines the road vocabulary and scenario mix. Newmarket is the first playable authored approximation.</p>
      <div className="centre-grid">
        <article className="centre-card selected">
          <div className="card-top"><span className="pill playable">Playable</span><span>Central Ontario</span></div>
          <h2>{newmarketCentre.name}</h2>
          <p>{newmarketCentre.address}</p>
          <ul><li>One-, two- and three-lane road structures</li><li>Visible left-turn pocket and signalized junctions</li><li>Authored freeway entrance, merge and exit</li></ul>
          <button className="primary" onClick={onSelect}>Select Newmarket</button>
        </article>
        <article className="centre-card future" aria-disabled="true">
          <div className="card-top"><span className="pill">Future</span></div>
          <h2>More Ontario centres</h2>
          <p>The content model supports additional centres without pretending one route represents all locations.</p>
        </article>
      </div>
      <aside className="evidence-box">
        <strong>What is verified?</strong>
        <p>The centre address and G service are linked to the official DriveTest listing. The roads and traffic events are authored teaching scenarios—not an official, recorded, or predicted test route.</p>
        <a href={newmarketCentre.evidence[0].sourceUrl} target="_blank" rel="noreferrer">View official centre listing</a>{' · '}
        <a href="https://www.newmarket.ca/resident-services/by-law-enforcement/restricted-area-driving-instructors-driving-schools" target="_blank" rel="noreferrer">View Town of Newmarket road context</a>
      </aside>
    </main>
  )
}

function Briefing({ preferences, start, back, config }: { preferences: Preferences; start: () => void; back: () => void; config: RunConfig }) {
  const practiceType = config.mode === 'practice' && config.scope.kind === 'scenario' ? config.scope.scenarioType : undefined
  const guided = config.mode === 'practice'
  return (
    <main id="main-content" className="page-shell briefing">
      <p className="eyebrow">Ready to start</p>
      <h1>{practiceType ? `Guided scene: ${scenarioLabels[practiceType]}` : guided ? 'Guided Newmarket route' : 'Newmarket exam practice'}</h1>
      <div className="briefing-grid">
        <section className="panel">
          <h2>Before you drive</h2>
          <p><strong>Newmarket-inspired teaching corridor.</strong> Road order, lane layouts, signals, ramps, exits and speed parameters are hand-authored approximations—not an official, recorded or predicted test route.</p>
          <ol className="brief-list">
            <li><strong>Listen first.</strong><span>The examiner gives a destination, never the exact driving technique.</span></li>
            <li><strong>Make checks visible.</strong><span>Mirror and blind-spot actions must be explicit in this simulation.</span></li>
            <li><strong>Danger pauses the drive.</strong><span>Exam mode can end or continue as practice. Guided Practice can retry or continue.</span></li>
          </ol>
        </section>
        <section className="panel controls-cheat">
          <h2>Keyboard</h2>
          <div><kbd>W</kbd><kbd>↑</kbd><span>Tap for a small speed increase; hold for continuous acceleration</span></div>
          <div><kbd>S</kbd><kbd>↓</kbd><span>Tap for light braking; hold for firm continuous braking</span></div>
          <div><kbd>A / ←</kbd><kbd>D / →</kbd><span>Steer: change lane; repeat at the edge to turn when prompted</span></div>
          <div><kbd>Z</kbd><kbd>C</kbd><span>Left / right signal <small>(, / . also work)</small></span></div>
          <div><kbd>Q</kbd><kbd>E</kbd><span>Left / right mirror</span></div>
          <div><kbd>⇧Q</kbd><kbd>⇧E</kbd><span>Left / right shoulder</span></div>
        </section>
      </div>
      <div className="briefing-footer">
        <p>{practiceType ? 'About 2–3 minutes' : 'About 16 minutes'} · {guided ? 'Coach on' : 'Coach off'} · Speech {preferences.speechEnabled ? 'on' : 'off'} · Road ambience {preferences.ambientSoundEnabled ? 'on' : 'off'} · Chinese subtitles {preferences.subtitlesZh ? 'on' : 'off'}</p>
        <div><button className="secondary" onClick={back}>Back</button><button className="primary large" onClick={start}>Start when ready</button></div>
      </div>
    </main>
  )
}

type PlayerProps = {
  preferences: Preferences
  config: ResolvedRunConfig
  onFinish: (attempt: AttemptRecordV2) => void
  onRetryScene: (config: ResolvedRunConfig, attempt: AttemptRecordV2) => void
  onExit: () => void
  checkpoint?: AttemptCheckpointV3
  onLockConflict: () => void
}

function Player({ preferences, config, onFinish, onRetryScene, onExit, checkpoint, onLockConflict }: PlayerProps) {
  const [engine, setEngine] = useState<EngineState>(() => {
    if (checkpoint) return {
        ...checkpoint.state,
        scenarioDistanceMeters: checkpoint.state.scenarioDistanceMeters ?? 0,
        lanePosition: checkpoint.state.lanePosition ?? checkpoint.state.lane ?? 0,
        laneChangeFrom: checkpoint.state.laneChangeFrom ?? null,
        laneChangeElapsed: checkpoint.state.laneChangeElapsed ?? 0,
        turnDirection: checkpoint.state.turnDirection ?? null,
        turnProgress: checkpoint.state.turnProgress ?? 0,
        turnStartDistanceMeters: checkpoint.state.turnStartDistanceMeters ?? null,
      }
    const created = createEngine(config)
    const parameters = new URLSearchParams(window.location.search)
    const debugDistance = Number(parameters.get('startDistance'))
    if (parameters.get('debug') === '1' && Number.isFinite(debugDistance) && debugDistance > 0) {
      const roadPosition = advanceRoadPosition(created.roadPosition, debugDistance, created.route[0].routeBinding)
      return {
        ...created,
        scenarioDistanceMeters: debugDistance,
        roadPosition,
        laneOffsetM: getRoadFacts(roadPosition).laneOffsetM,
      }
    }
    return created
  })
  const [runtime, setRuntime] = useState<AttemptRuntimeContext>(checkpoint?.runtime ?? {
    originMode: config.mode,
    guidanceMode: config.initialGuidance,
    findingContext: config.mode,
  })
  const [manualPaused, setManualPaused] = useState(false)
  const [recentAction, setRecentAction] = useState<ActionType | null>(null)
  const controls = useRef(new Set<ActionType>())
  const pressedPedals = useRef(new Set<PedalAction>())
  const pedalHoldTimers = useRef<Partial<Record<PedalAction, number>>>({})
  const feedbackTimer = useRef<number | undefined>(undefined)
  const ambienceRef = useRef<RoadAmbience | null>(null)
  const [startedAt] = useState(checkpoint?.startedAt ?? new Date().toISOString())
  const [attemptId] = useState(checkpoint?.attemptId ?? `${engine.seed}-${startedAt}`)
  const engineRef = useRef(engine)
  const lastCheckpointBucket = useRef(Math.floor(engine.elapsed / 10) - 1)
  const finished = useRef(false)
  const scenario = currentScenario(engine)
  const guidancePlan = getGuidancePlan(scenario.id)
  const [coach, setCoach] = useState<CoachState | undefined>(() => checkpoint?.coach ?? (config.initialGuidance === 'guided' && guidancePlan ? createCoachState(guidancePlan) : undefined))
  const coachSummaries = useRef<NonNullable<AttemptRecordV2['guidanceSummary']>>([])
  const urlParameters = new URLSearchParams(window.location.search)
  const requestedDebugScale = Number(urlParameters.get('timeScale'))
  const timeScale = urlParameters.get('debug') === '1'
    ? requestedDebugScale > 0 ? requestedDebugScale : 80
    : 1

  useEffect(() => {
    if (runtime.guidanceMode !== 'guided' || !guidancePlan) return
    // The Coach reducer intentionally follows the authoritative Engine snapshot.
    setCoach((previous) => {
      if (!previous || previous.planId !== guidancePlan.id) {
        if (previous && !coachSummaries.current.some((summary) => summary.planId === previous.planId)) {
          coachSummaries.current.push({ planId: previous.planId, completedStepIds: previous.completedStepIds, missedStepIds: previous.missedStepIds })
        }
        return createCoachState(guidancePlan)
      }
      const latest = engine.findings.at(-1)
      const latestFinding = latest && latest.scenarioId === scenario.id
        ? { ...latest, context: runtime.findingContext }
        : undefined
      return reduceCoachState({ coach: previous, plan: guidancePlan, engineState: engine, scenarioActions: engine.scenarioActions, latestFinding })
    })
  }, [engine, guidancePlan, runtime.findingContext, runtime.guidanceMode, scenario.id])

  const startAmbience = useCallback(() => {
    if (!preferences.ambientSoundEnabled) return
    if (!ambienceRef.current) ambienceRef.current = createRoadAmbience()
    void ambienceRef.current?.resume()
  }, [preferences.ambientSoundEnabled])

  const perform = useCallback((action: ActionType) => {
    if (action === 'pause') {
      setManualPaused((value) => !value)
      return
    }
    if ((engineRef.current.turnDirection || engineRef.current.laneChangeFrom !== null) && (action.startsWith('lane-') || action.startsWith('turn-'))) return
    if ((action === 'turn-left' || action === 'turn-right') && !canStartTurn(engineRef.current, action)) return
    if (action === 'accelerate') startAmbience()
    window.clearTimeout(feedbackTimer.current)
    setRecentAction(action)
    feedbackTimer.current = window.setTimeout(() => setRecentAction(null), 900)
    setEngine((state) => recordAction(state, action))
  }, [startAmbience])

  const endControl = useCallback((action: PedalAction) => {
    pressedPedals.current.delete(action)
    controls.current.delete(action)
    window.clearTimeout(pedalHoldTimers.current[action])
    delete pedalHoldTimers.current[action]
  }, [])

  const beginControl = useCallback((action: PedalAction) => {
    if (pressedPedals.current.has(action)) return
    pressedPedals.current.add(action)
    perform(action)
    pedalHoldTimers.current[action] = window.setTimeout(() => {
      if (pressedPedals.current.has(action)) controls.current.add(action)
    }, PEDAL_HOLD_DELAY_MS)
  }, [perform])

  useEffect(() => () => {
    window.clearTimeout(feedbackTimer.current)
    endControl('accelerate')
    endControl('brake')
  }, [endControl])

  useEffect(() => { engineRef.current = engine }, [engine])

  useEffect(() => {
    if (!preferences.ambientSoundEnabled) {
      ambienceRef.current?.dispose()
      ambienceRef.current = null
      return
    }
    ambienceRef.current?.update(engine.speedKph, !manualPaused && !engine.dangerPending && !engine.completed)
  }, [engine.completed, engine.dangerPending, engine.speedKph, manualPaused, preferences.ambientSoundEnabled])

  useEffect(() => () => {
    ambienceRef.current?.dispose()
    ambienceRef.current = null
  }, [])

  useEffect(() => {
    if (!acquireAttemptLock(attemptId)) {
      onLockConflict()
      return
    }
    const lockTimer = window.setInterval(() => refreshAttemptLock(attemptId), 5_000)
    return () => {
      window.clearInterval(lockTimer)
      releaseAttemptLock(attemptId)
    }
  }, [attemptId, onLockConflict])

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!manualPaused) setEngine((state) => advanceEngine(state, TICK_SECONDS * timeScale, controls.current))
    }, TICK_SECONDS * 1000)
    return () => window.clearInterval(timer)
  }, [manualPaused, timeScale])

  useEffect(() => {
    speakInstruction(scenario.examinerInstruction, preferences.speechEnabled)
  }, [preferences.speechEnabled, scenario.id, scenario.examinerInstruction])

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      let action = actionForKey(event, preferences)
      if (!action) return
      if (action === 'lane-left' && canStartTurn(engineRef.current, 'turn-left')) action = 'turn-left'
      if (action === 'lane-right' && canStartTurn(engineRef.current, 'turn-right')) action = 'turn-right'
      event.preventDefault()
      if (action === 'accelerate' || action === 'brake') {
        if (!event.repeat) beginControl(action)
        return
      }
      if (!event.repeat) perform(action)
    }
    const keyUp = (event: KeyboardEvent) => {
      const action = actionForKey(event, preferences)
      if (action === 'accelerate' || action === 'brake') endControl(action)
    }
    const hidden = () => {
      if (document.hidden) {
        endControl('accelerate')
        endControl('brake')
        setManualPaused(true)
        const hiddenCheckpoint: AttemptCheckpointV3 = {
          attemptId,
          contentVersion: newmarketCentre.contentVersion,
          startedAt,
          savedAt: new Date().toISOString(),
          state: engineRef.current,
          schemaVersion: 3,
          roadProfileId: newmarketRoadProfile.id,
          roadProfileVersion: newmarketRoadProfile.version,
          routeSeed: engineRef.current.seed,
          config,
          runtime,
          status: 'paused',
          coach,
          guidancePlanVersion: guidancePlan?.version,
        }
        void saveCheckpoint(hiddenCheckpoint)
      }
    }
    window.addEventListener('keydown', keyDown)
    window.addEventListener('keyup', keyUp)
    document.addEventListener('visibilitychange', hidden)
    return () => {
      window.removeEventListener('keydown', keyDown)
      window.removeEventListener('keyup', keyUp)
      document.removeEventListener('visibilitychange', hidden)
    }
  }, [attemptId, beginControl, coach, config, endControl, guidancePlan?.version, perform, preferences, runtime, startedAt])

  useEffect(() => {
    if (!manualPaused && !engine.dangerPending) return
    endControl('accelerate')
    endControl('brake')
  }, [endControl, engine.dangerPending, manualPaused])

  useEffect(() => {
    const bucket = Math.floor(engine.elapsed / 10)
    if (engine.completed || bucket <= lastCheckpointBucket.current) return
    lastCheckpointBucket.current = bucket
    const checkpointValue: AttemptCheckpointV3 = {
      attemptId,
      contentVersion: newmarketCentre.contentVersion,
      startedAt,
      savedAt: new Date().toISOString(),
      state: engine,
      schemaVersion: 3,
      roadProfileId: newmarketRoadProfile.id,
      roadProfileVersion: newmarketRoadProfile.version,
      routeSeed: engine.seed,
      config,
      runtime,
      status: manualPaused ? 'paused' : engine.dangerPending ? 'danger-review' : 'running',
      coach,
      guidancePlanVersion: guidancePlan?.version,
    }
    void saveCheckpoint(checkpointValue)
  }, [attemptId, coach, config, engine, guidancePlan?.version, manualPaused, runtime, startedAt])

  useEffect(() => {
    if (engine.completed && !finished.current) {
      finished.current = true
      void deleteCheckpoint(attemptId)
      const summaries = [...coachSummaries.current]
      if (coach && !summaries.some((summary) => summary.planId === coach.planId)) {
        summaries.push({ planId: coach.planId, completedStepIds: coach.completedStepIds, missedStepIds: coach.missedStepIds })
      }
      onFinish(toAttemptRecord(engine, startedAt, config, runtime, summaries))
    }
  }, [attemptId, coach, config, engine, onFinish, runtime, startedAt])

  const totalDuration = engine.route.reduce((sum, item) => sum + item.durationSeconds, 0)
  const remaining = totalDuration - engine.elapsed
  const checklist = new Set(engine.scenarioActions.map((action) => action.type))
  const roadFacts = getRoadFacts(engine.roadPosition)
  const leftLaneAction = roadFacts?.availableLaneActions.find((action) => action.direction === 'left')
  const rightLaneAction = roadFacts?.availableLaneActions.find((action) => action.direction === 'right')
  const leftLaneTarget = leftLaneAction?.targetRole.replace('-', ' ') ?? (engine.lane === 1 ? 'Centre' : 'Left')
  const rightLaneTarget = rightLaneAction?.targetRole.replace('-', ' ') ?? (engine.lane === -1 ? 'Centre' : 'Right')
  const inTurnZone = engine.roadPosition.edgeId === scenario.routeBinding.decisionEdgeId && roadFacts.intersectionDistanceMeters !== undefined && roadFacts.intersectionDistanceMeters <= 75 && roadFacts.intersectionDistanceMeters >= -8
  const canTurnLeft = inTurnZone && canStartTurn(engine, 'turn-left')
  const canTurnRight = inTurnZone && canStartTurn(engine, 'turn-right')
  const laneChanging = engine.laneChangeFrom !== null
  const keyLabel = (action: ActionType) => preferences.keyBindings.find((binding) => binding.action === action)?.label ?? '—'
  const coachFrame = coach && guidancePlan && runtime.guidanceMode === 'guided'
    ? toCoachFrame({ coach, plan: guidancePlan, keyBindings: preferences.keyBindings, subtitlesZh: preferences.subtitlesZh })
    : undefined
  const highlightedAction = coachFrame?.visibleSteps.find((step) => step.state === 'current')?.highlightedAction
  const controlClass = (action: ActionType, active = false) => [
    'control-tile',
    checklist.has(action) ? 'used' : '',
    recentAction === action ? 'recent-control' : '',
    active ? 'active-control' : '',
    highlightedAction === action ? 'coach-highlight' : '',
  ].filter(Boolean).join(' ')

  const guidanceSummary = () => {
    const summaries = [...coachSummaries.current]
    if (coach && !summaries.some((summary) => summary.planId === coach.planId)) {
      summaries.push({ planId: coach.planId, completedStepIds: coach.completedStepIds, missedStepIds: coach.missedStepIds })
    }
    return summaries
  }

  const retryDangerousScene = () => {
    const finding = [...engine.findings].reverse().find((item) => item.severity === 'dangerous')
    const variant = finding ? engine.route.find((item) => item.id === finding.scenarioId) : undefined
    if (!variant) return
    const existingScope = config.mode === 'practice' && config.scope.kind === 'scenario' ? config.scope : undefined
    const retryConfig = resolveRunConfig(createRunConfig({
      centreId: 'newmarket',
      mode: 'practice',
      seed: config.seed,
      scope: {
        kind: 'scenario',
        scenarioType: variant.type,
        variantId: variant.id,
        practiceSessionId: existingScope?.practiceSessionId ?? `danger-${attemptId}`,
        roundIndex: (existingScope?.roundIndex ?? 0) + 1,
        retryOfAttemptId: attemptId,
      },
    }))
    onRetryScene(retryConfig, toAttemptRecord(engine, startedAt, config, runtime, guidanceSummary()))
  }

  return (
    <main id="main-content" className="player-shell">
      <header className="player-header">
        <div><span className="brand-mark small">G</span><strong>G TEST PRACTICE</strong></div>
        <div className="player-status"><span className="mode-badge">{runtime.originMode === 'practice' ? 'GUIDED PRACTICE' : runtime.guidanceMode === 'guided' ? 'PRACTICE CONTINUATION' : 'EXAM MODE'}</span><span>Scene {engine.scenarioIndex + 1}/{engine.route.length}</span><button onClick={() => setManualPaused(true)}>Pause <kbd>Esc</kbd></button></div>
      </header>
      <div className="progress-track"><span style={{ width: `${Math.min(100, (engine.elapsed / totalDuration) * 100)}%` }} /></div>
      <section className="drive-layout">
        <div className="scene-column">
          <Suspense fallback={<div className="road-frame renderer-status" aria-live="polite">Loading the 3D driving module…</div>}>
            <ThreeRoadScene engine={engine} scenario={scenario} recentAction={recentAction} reducedMotion={preferences.reducedMotion} onRendererBlocked={() => setManualPaused(true)} />
          </Suspense>
          <p className="sr-only" aria-live="polite">{roadFacts ? `${roadFacts.section.trainingLabel}. ${roadFacts.forwardLaneCount} forward lanes. Current lane role ${roadFacts.laneRole}.` : `Current ${engine.lane === -1 ? 'left' : engine.lane === 1 ? 'right' : 'centre'} lane.`}</p>
          <button className={`lane-target lane-target-left ${highlightedAction === 'lane-left' ? 'coach-highlight' : ''}`} disabled={engine.turnDirection !== null || laneChanging || !leftLaneAction} onClick={() => perform('lane-left')} aria-label={`Move one lane left to ${leftLaneTarget} lane`}><span>← MOVE 1 LANE</span><small>to {leftLaneTarget}</small><kbd>{keyLabel('lane-left')}</kbd></button>
          <button className={`lane-target lane-target-right ${highlightedAction === 'lane-right' ? 'coach-highlight' : ''}`} disabled={engine.turnDirection !== null || laneChanging || !rightLaneAction} onClick={() => perform('lane-right')} aria-label={`Move one lane right to ${rightLaneTarget} lane`}><span>MOVE 1 LANE →</span><small>to {rightLaneTarget}</small><kbd>{keyLabel('lane-right')}</kbd></button>
          {inTurnZone && engine.turnDirection === null && scenario.type === 'multilane-left' && <button className={`turn-command turn-command-left ${highlightedAction === 'turn-left' ? 'coach-highlight' : ''}`} disabled={!canTurnLeft || laneChanging} onClick={() => perform('turn-left')} aria-label="Turn left at the intersection"><span>↰ TURN LEFT</span><small>{canTurnLeft && !laneChanging ? 'turn now' : 'move to left lane first'}</small><kbd>←</kbd></button>}
          {inTurnZone && engine.turnDirection === null && scenario.type === 'right-on-red' && <button className={`turn-command turn-command-right ${highlightedAction === 'turn-right' ? 'coach-highlight' : ''}`} disabled={!canTurnRight || laneChanging} onClick={() => perform('turn-right')} aria-label="Turn right at the intersection"><span>TURN RIGHT ↱</span><small>{canTurnRight && !laneChanging ? 'turn now' : 'move to right lane first'}</small><kbd>→</kbd></button>}
          <div className="examiner-card" aria-live="polite">
            <span className="examiner-avatar" aria-hidden="true">EX</span>
            <div><small>EXAMINER</small><p>“{scenario.examinerInstruction}”</p>{preferences.subtitlesZh && <span>{scenario.subtitleZh}</span>}</div>
            <button onClick={() => speakInstruction(scenario.examinerInstruction, true)} aria-label="Repeat examiner instruction">↻</button>
          </div>
          <div className="route-progress-card" aria-label={`Practice route map: scene ${engine.scenarioIndex + 1} of ${engine.route.length}`}>
            <RouteMiniMap route={engine.route} scenarioIndex={engine.scenarioIndex} scenarioElapsed={engine.scenarioElapsed} roadPosition={engine.roadPosition} />
          </div>
        </div>
        <div className="mobile-route-progress-card" aria-label={`Practice route map: scene ${engine.scenarioIndex + 1} of ${engine.route.length}`}>
          <RouteMiniMap route={engine.route} scenarioIndex={engine.scenarioIndex} scenarioElapsed={engine.scenarioElapsed} roadPosition={engine.roadPosition} />
        </div>
        {coachFrame && <CoachPanel frame={coachFrame} />}
        <aside className="control-deck" aria-label="Driving controls">
          <div className="instrument-panel">
            <div className="speed-readout"><span>SPEED</span><strong>{Math.round(engine.speedKph)}</strong><small><b className="hold-badge">HOLD</b> km/h</small></div>
            <div className="limit-readout"><span>LIMIT</span><strong>{roadFacts?.speedLimitKph ?? scenario.speedLimitKph}</strong></div>
            <div className="time-readout"><span>TIME LEFT</span><strong>{formatTime(remaining)}</strong></div>
          </div>
          <div className="control-grid">
            <div className="side-control-group" aria-label="Left Mirror Signal Shoulder controls">
              <small>LEFT MSS</small>
              <button aria-label="Left mirror" className={controlClass('mirror-left')} onClick={() => perform('mirror-left')}><span className="control-icon mirror-icon">▱</span><strong>MIRROR</strong><kbd>{keyLabel('mirror-left')}</kbd></button>
              <button aria-label="Left signal" aria-pressed={engine.signal === 'left'} className={controlClass('signal-left', engine.signal === 'left')} onClick={() => perform('signal-left')}><span className="control-icon signal-icon">←</span><strong>SIGNAL</strong><kbd>{keyLabel('signal-left')}</kbd></button>
              <button aria-label="Left shoulder check" className={controlClass('shoulder-left')} onClick={() => perform('shoulder-left')}><span className="control-icon shoulder-icon">◉←</span><strong>SHOULDER</strong><kbd>{keyLabel('shoulder-left')}</kbd></button>
            </div>
            <div className="side-control-group" aria-label="Right Mirror Signal Shoulder controls">
              <small>RIGHT MSS</small>
              <button aria-label="Right mirror" className={controlClass('mirror-right')} onClick={() => perform('mirror-right')}><span className="control-icon mirror-icon">▰</span><strong>MIRROR</strong><kbd>{keyLabel('mirror-right')}</kbd></button>
              <button aria-label="Right signal" aria-pressed={engine.signal === 'right'} className={controlClass('signal-right', engine.signal === 'right')} onClick={() => perform('signal-right')}><span className="control-icon signal-icon">→</span><strong>SIGNAL</strong><kbd>{keyLabel('signal-right')}</kbd></button>
              <button aria-label="Right shoulder check" className={controlClass('shoulder-right')} onClick={() => perform('shoulder-right')}><span className="control-icon shoulder-icon">→◉</span><strong>SHOULDER</strong><kbd>{keyLabel('shoulder-right')}</kbd></button>
            </div>
          </div>
          <div className="pedals">
            <button aria-label="Brake" className={`brake ${highlightedAction === 'brake' ? 'coach-highlight' : ''}`} onPointerDown={() => beginControl('brake')} onPointerUp={() => endControl('brake')} onPointerCancel={() => endControl('brake')} onPointerLeave={() => endControl('brake')}><span>!</span><strong>BRAKE</strong><kbd>{keyLabel('brake')}</kbd></button>
            <button aria-label="Accelerate" className={`accelerate ${highlightedAction === 'accelerate' ? 'coach-highlight' : ''}`} onPointerDown={() => beginControl('accelerate')} onPointerUp={() => endControl('accelerate')} onPointerCancel={() => endControl('accelerate')} onPointerLeave={() => endControl('accelerate')}><span>↑</span><strong>ACCELERATE</strong><kbd>{keyLabel('accelerate')}</kbd></button>
          </div>
        </aside>
      </section>

      {manualPaused && (
        <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="pause-title"><p className="eyebrow">Drive paused</p><h2 id="pause-title">Take a moment.</h2><p>The simulation clock and vehicle controls are stopped.</p><div className="modal-actions"><button className="secondary" onClick={onExit}>Exit drive</button><button className="primary" autoFocus onClick={() => setManualPaused(false)}>Resume</button></div></section></div>
      )}
      {engine.dangerPending && runtime.findingContext === 'exam' && (
        <div className="modal-backdrop"><section className="modal danger-modal" role="alertdialog" aria-modal="true" aria-labelledby="danger-title">
          <span className="danger-icon">!</span><p className="eyebrow">Dangerous moment detected</p><h2 id="danger-title">The exam portion stops here.</h2>
          <p>{engine.findings.at(-1)?.impact}</p><p>You can end and review now, or continue the remaining route as practice. This finding will remain in the report.</p>
          <div className="modal-actions"><button className="secondary" onClick={() => setEngine((state) => resolveDanger(state, 'end'))}>End & review</button><button className="primary" autoFocus onClick={() => { setRuntime((value) => ({ ...value, guidanceMode: 'guided', findingContext: 'practice', continuedAfterDangerAtSeconds: engine.elapsed })); setEngine((state) => resolveDanger(state, 'continue')) }}>Continue as practice</button></div>
        </section></div>
      )}
      {engine.dangerPending && runtime.findingContext === 'practice' && (
        <div className="modal-backdrop"><section className="modal danger-modal" role="alertdialog" aria-modal="true" aria-labelledby="practice-danger-title">
          <span className="danger-icon">!</span><p className="eyebrow">Guided Practice paused</p><h2 id="practice-danger-title">Review this dangerous moment.</h2>
          <p>{engine.findings.at(-1)?.impact}</p><p>This is practice—not an exam failure. Retry the same authored situation or continue from the current route state.</p>
          <div className="modal-actions"><button className="secondary" onClick={retryDangerousScene}>Retry this scene</button><button className="primary" autoFocus onClick={() => setEngine((state) => resolveDanger(state, 'continue'))}>Continue from here</button></div>
        </section></div>
      )}
      {new URLSearchParams(window.location.search).get('debug') === '1' && <aside className="debug-panel" aria-label="Local debug information">engine 1.3 · content {newmarketCentre.contentVersion} · Three.js/{runtime.originMode}/{runtime.findingContext} · seed {engine.seed} · {engine.roadPosition.edgeId}/{engine.roadPosition.sectionId}/{engine.roadPosition.laneId}@{Math.round(engine.roadPosition.sMeters)}m · actions {engine.actions.length}{coach ? ` · coach ${coach.planId}:${coach.currentStepIndex}` : ''}</aside>}
    </main>
  )
}

function Report({ attempt, restart, history }: { attempt: AttemptRecordV2; restart: (type?: ScenarioType) => void; history: () => void }) {
  const dimensions = summarizeDimensions(attempt.findings)
  const issues = attempt.findings.filter((finding) => finding.severity !== 'good')
  const top = [...issues].sort((a, b) => (b.severity === 'dangerous' ? 2 : 1) - (a.severity === 'dangerous' ? 2 : 1)).slice(0, 3)
  const weak = top[0]?.scenarioType
  return (
    <main id="main-content" className="page-shell report-page">
      <p className="eyebrow">{attempt.mode === 'exam' ? 'Exam-mode review' : 'Guided Practice review'}</p><h1>{attempt.dangerousFindingIds.length ? 'Review the dangerous moments first.' : attempt.mode === 'practice' ? 'Guided Practice complete.' : 'Practice drive complete.'}</h1>
      <p className="page-intro">This is a learning report—not an official score, result, or pass prediction. The original event record stays unchanged if you continued as practice.</p>
      <section className="report-summary">
        <div><strong>{formatTime(attempt.durationSeconds)}</strong><span>driving time</span></div><div><strong>{attempt.scenarioIds.length}</strong><span>scenes attempted</span></div><div><strong>{issues.length}</strong><span>practice findings</span></div><div><strong>{attempt.dangerousFindingIds.length}</strong><span>dangerous moments</span></div>
      </section>
      <div className="report-grid">
        <section className="panel"><h2>Five practice dimensions</h2><div className="dimension-list">{Object.entries(dimensions).map(([label, value]) => <div key={label}><span>{label}</span><div><i style={{ width: `${value * 20}%` }} /></div><strong>{value}/5</strong></div>)}</div></section>
        <section className="panel"><h2>Focus next</h2>{top.length ? top.map((finding, index) => <article className="focus-item" key={finding.id}><span>{index + 1}</span><div><SeverityPill finding={finding} /><h3>{scenarioLabels[finding.scenarioType]}</h3><p>{finding.improvement}</p></div></article>) : <p>No missing routine was detected in this authored scenario set. Repeat with another seed to vary traffic conditions.</p>}</section>
      </div>
      <section className="timeline panel"><h2>Decision timeline</h2>{attempt.findings.map((finding) => <details key={finding.id}><summary><time>{formatTime(finding.atSeconds)}</time><SeverityPill finding={finding} /><strong>{finding.situation}</strong></summary><dl><div><dt>Action</dt><dd>{finding.action}</dd></div><div><dt>Impact</dt><dd>{finding.impact}</dd></div><div><dt>Improvement</dt><dd>{finding.improvement}</dd></div><div><dt>Evidence</dt><dd>{finding.evidence.level === 'authored' ? 'Authored teaching scenario; not an official route fact.' : finding.evidence.label}</dd></div></dl></details>)}</section>
      <div className="report-actions"><button className="secondary" onClick={() => exportAttempt(attempt)}>Export JSON</button><button className="secondary" onClick={history}>View history</button><button className="secondary" onClick={() => restart()}>New full drive</button>{weak && <button className="primary" onClick={() => restart(weak)}>Practise weakest scene</button>}</div>
    </main>
  )
}

function History({ attempts, practice, remove, clear }: { attempts: AttemptRecordV2[]; practice: (type: ScenarioType) => void; remove: (id: string) => void; clear: () => void }) {
  const suggestion = weakestScenarioSuggestion(attempts)
  const label = (attempt: AttemptRecordV2) => attempt.mode === 'exam'
    ? attempt.runStage === 'continued-practice' ? 'Exam + practice continuation' : 'Exam'
    : attempt.scope.kind === 'scenario'
      ? `Scenario practice · round ${attempt.scope.roundIndex}`
      : 'Guided full route'
  return <main id="main-content" className="page-shell"><p className="eyebrow">Stored only on this device</p><h1>Practice history</h1><p className="page-intro">Exam evidence is used first for suggestions. Practice evidence is used only when no exam finding exists, and its source is shown. You control deletion; nothing is uploaded.</p><div className="history-actions">{suggestion.scenarioType && <button className="primary" onClick={() => practice(suggestion.scenarioType!)}>Practise suggested weakness: {scenarioLabels[suggestion.scenarioType]} · based on {suggestion.source}</button>}{attempts.length > 0 && <button className="secondary" onClick={clear}>Clear all history</button>}</div><section className="history-list">{attempts.length ? attempts.map((attempt) => <article key={attempt.id} data-practice-session={attempt.scope.kind === 'scenario' ? attempt.scope.practiceSessionId : undefined}><div><strong>{new Date(attempt.startedAt).toLocaleString()}</strong><span>{label(attempt)} · {formatTime(attempt.durationSeconds)}</span>{attempt.scope.kind === 'scenario' && <small>{scenarioLabels[attempt.scope.scenarioType]} · session {attempt.scope.practiceSessionId.slice(-8)}</small>}</div><div><span>{attempt.findings.filter((item) => item.severity !== 'good').length} findings</span><span className={attempt.dangerousFindingIds.length ? 'danger-count' : ''}>{attempt.dangerousFindingIds.length} dangerous</span><button className="text-button" onClick={() => exportAttempt(attempt)}>Export JSON</button><button className="text-button danger-text" onClick={() => remove(attempt.id)}>Delete</button></div></article>) : <div className="empty-state"><h2>No attempts yet</h2><p>Complete a practice drive and its review will appear here.</p></div>}</section></main>
}

function Settings({ preferences, update }: { preferences: Preferences; update: (value: Preferences) => void }) {
  const [conflict, setConflict] = useState('')
  const set = (patch: Partial<Preferences>) => update({ ...preferences, ...patch })
  const remap = (index: number, event: React.KeyboardEvent<HTMLButtonElement>) => {
    event.preventDefault()
    if (preferences.keyBindings[index].action === 'pause') return
    const code = event.shiftKey ? `Shift+${event.code}` : event.code
    if (code === 'Escape' || preferences.keyBindings.some((binding, current) => current !== index && binding.code === code)) {
      setConflict('That key is already used or reserved for pause. Choose another key.')
      return
    }
    setConflict('')
    const bindings = preferences.keyBindings.map((binding, current) => current === index ? { ...binding, code, label: event.shiftKey ? `Shift+${event.key.toUpperCase()}` : event.key.length === 1 ? event.key.toUpperCase() : event.key } : binding)
    set({ keyBindings: bindings })
  }
  return <main id="main-content" className="page-shell settings-page"><p className="eyebrow">Accessibility & controls</p><h1>Settings</h1><section className="panel toggle-list"><label><span><strong>Spoken examiner instructions</strong><small>Uses the browser’s en-CA speech voice when available.</small></span><input type="checkbox" checked={preferences.speechEnabled} onChange={(event) => set({ speechEnabled: event.target.checked })} /></label><label><span><strong>Road ambience</strong><small>Plays subtle synthesized tyre, wind, and street noise only while the vehicle is moving.</small></span><input type="checkbox" checked={preferences.ambientSoundEnabled} onChange={(event) => set({ ambientSoundEnabled: event.target.checked })} /></label><label><span><strong>Chinese subtitles</strong><small>English examiner wording remains primary.</small></span><input type="checkbox" checked={preferences.subtitlesZh} onChange={(event) => set({ subtitlesZh: event.target.checked })} /></label><label><span><strong>Reduced road motion</strong><small>Stops moving lane markers and lead-vehicle drift.</small></span><input type="checkbox" checked={preferences.reducedMotion} onChange={(event) => set({ reducedMotion: event.target.checked })} /></label><label><span><strong>High contrast</strong><small>Strengthens borders and text contrast throughout the interface.</small></span><input type="checkbox" checked={preferences.highContrast} onChange={(event) => set({ highContrast: event.target.checked })} /></label></section><section className="panel key-settings"><div className="section-heading"><div><h2>Keyboard mapping</h2><p>Focus a key button and press the replacement key. Arrow keys are permanent driving aliases; comma and period remain signal aliases.</p>{conflict && <p className="form-error" role="alert">{conflict}</p>}</div><button className="secondary" onClick={() => { setConflict(''); set({ keyBindings: defaultPreferences.keyBindings }) }}>Reset</button></div>{preferences.keyBindings.map((binding, index) => <div key={binding.action}><span>{actionNames[binding.action]}</span><button disabled={binding.action === 'pause'} aria-label={`Remap ${actionNames[binding.action]}`} onKeyDown={(event) => remap(index, event)}>{binding.label}</button></div>)}</section></main>
}

export default function App() {
  const [view, setView] = useState<View>('home')
  const [preferences, setPreferences] = useState(loadPreferences)
  const [attempts, setAttempts] = useState<AttemptRecordV2[]>([])
  const [report, setReport] = useState<AttemptRecordV2>()
  const [roundSummary, setRoundSummary] = useState<AttemptRecordV2>()
  const [draftConfig, setDraftConfig] = useState<RunConfig>()
  const [activeConfig, setActiveConfig] = useState<ResolvedRunConfig>()
  const [checkpoint, setCheckpoint] = useState<AttemptCheckpointV3>()
  const [checkpointNotice, setCheckpointNotice] = useState<string>()
  const [playerKey, setPlayerKey] = useState(0)

  const refreshAttempts = useCallback(() => getAttempts().then(setAttempts).catch(() => setAttempts([])), [])
  useEffect(() => {
    void refreshAttempts()
    void getLatestCheckpoint<EngineState>().then((value) => {
      const normalized = value ? normalizeEngineCheckpoint(value) : undefined
      if (normalized && ['1.0.0', '1.1.0', newmarketCentre.contentVersion].includes(normalized.contentVersion)) setCheckpoint(normalized)
      else if (value) setCheckpointNotice('An older drive cannot be resumed safely with the new road layout. Your completed history is still available; start a new drive when ready.')
    }).catch(() => setCheckpoint(undefined))
  }, [refreshAttempts])
  useEffect(() => { document.documentElement.classList.toggle('high-contrast', preferences.highContrast) }, [preferences.highContrast])

  const updatePreferences = (value: Preferences) => { setPreferences(value); savePreferences(value) }
  const newSessionId = () => typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `practice-${Date.now()}`
  const clearCheckpoint = () => {
    if (checkpoint) void deleteCheckpoint(checkpoint.attemptId)
    setCheckpoint(undefined)
  }
  const openPractice = (type: ScenarioType) => {
    clearCheckpoint()
    setDraftConfig(createRunConfig({ centreId: 'newmarket', mode: 'practice', seed: seedFromUrl(), scope: { kind: 'scenario', scenarioType: type, practiceSessionId: newSessionId(), roundIndex: 1 } }))
    setView('briefing')
  }
  const startFull = () => {
    clearCheckpoint()
    setDraftConfig(undefined)
    setActiveConfig(undefined)
    setView('centre')
  }
  const finish = useCallback((attempt: AttemptRecordV2) => {
    setReport(attempt)
    if (attempt.mode === 'practice' && attempt.scope.kind === 'scenario') {
      setRoundSummary(attempt)
      setView('round-summary')
    } else {
      setView('report')
    }
    void saveAttempt(attempt).then(refreshAttempts)
  }, [refreshAttempts])
  const retryFromDanger = (config: ResolvedRunConfig, attempt: AttemptRecordV2) => {
    void saveAttempt(attempt).then(refreshAttempts)
    clearCheckpoint()
    setActiveConfig(config)
    setDraftConfig(config)
    setPlayerKey((value) => value + 1)
    setView('player')
  }
  const restart = (type?: ScenarioType) => {
    setReport(undefined)
    if (type) openPractice(type)
    else startFull()
  }
  const suggestion = useMemo(() => weakestScenarioSuggestion(attempts), [attempts])

  const startDraft = () => {
    if (!draftConfig) return
    clearCheckpoint()
    setActiveConfig(resolveRunConfig(draftConfig))
    setPlayerKey((value) => value + 1)
    setView('player')
  }

  const retryRound = (strategy: 'same' | 'next') => {
    if (!roundSummary || !activeConfig || activeConfig.mode !== 'practice' || activeConfig.scope.kind !== 'scenario') return
    const restarted = restartScenario({ source: createEngine(activeConfig), config: activeConfig, strategy })
    if (restarted.config.mode !== 'practice' || restarted.config.scope.kind !== 'scenario') return
    const config: ResolvedRunConfig = {
      ...restarted.config,
      scope: { ...restarted.config.scope, retryOfAttemptId: roundSummary.id },
    }
    setRoundSummary(undefined)
    setReport(undefined)
    setDraftConfig(config)
    setActiveConfig(config)
    setPlayerKey((value) => value + 1)
    setView('player')
  }

  return (
    <>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <Header view={view} navigate={setView} />
      {view === 'home' && <Home start={startFull} weakType={suggestion.scenarioType} practiceWeak={() => suggestion.scenarioType && openPractice(suggestion.scenarioType)} resume={checkpoint ? () => { setActiveConfig(checkpoint.config); setDraftConfig(checkpoint.config); setView('player') } : undefined} resumeNotice={checkpointNotice} />}
      {view === 'centre' && <CentrePicker onSelect={() => setView('mode-select')} />}
      {view === 'mode-select' && <ModeSelect practiceEnabled={PRACTICE_MODE_ENABLED} back={() => setView('centre')} exam={() => { setDraftConfig(createRunConfig({ centreId: 'newmarket', mode: 'exam', seed: seedFromUrl() })); setView('briefing') }} practice={() => setView('practice-select')} />}
      {view === 'practice-select' && <PracticeSelect back={() => setView('mode-select')} suggested={suggestion.scenarioType} source={suggestion.source} fullRoute={() => { setDraftConfig(createRunConfig({ centreId: 'newmarket', mode: 'practice', seed: seedFromUrl(), scope: { kind: 'full-route' } })); setView('briefing') }} scenario={openPractice} />}
      {view === 'briefing' && draftConfig && <Briefing preferences={preferences} config={draftConfig} back={() => setView(draftConfig.mode === 'practice' ? 'practice-select' : 'mode-select')} start={startDraft} />}
      {view === 'player' && activeConfig && <Player key={`${activeConfig.seed}-${activeConfig.scope.kind === 'scenario' ? activeConfig.scope.roundIndex : 0}-${playerKey}`} preferences={preferences} config={activeConfig} checkpoint={checkpoint} onFinish={(attempt) => { setCheckpoint(undefined); finish(attempt) }} onRetryScene={retryFromDanger} onExit={() => setView('home')} onLockConflict={() => { window.alert('Another tab is already running a practice drive.'); setView('home') }} />}
      {view === 'round-summary' && roundSummary && <PracticeRoundSummary attempt={roundSummary} retrySame={() => retryRound('same')} nextVariation={() => retryRound('next')} chooseAnother={() => { setRoundSummary(undefined); setView('practice-select') }} review={() => setView('report')} />}
      {view === 'report' && report && <Report attempt={report} restart={restart} history={() => setView('history')} />}
      {view === 'history' && <History attempts={attempts} practice={openPractice} remove={(id) => { if (window.confirm('Delete this local attempt?')) void deleteAttempt(id).then(refreshAttempts) }} clear={() => { if (window.confirm('Clear all local attempts and checkpoints?')) void clearAttempts().then(() => { setCheckpoint(undefined); refreshAttempts() }) }} />}
      {view === 'settings' && <Settings preferences={preferences} update={updatePreferences} />}
      {view !== 'player' && <footer><p>{newmarketCentre.disclaimer} Low-poly 3D teaching approximation; no Street View or official route data.</p><p>App v1.3.0 · Content v{newmarketCentre.contentVersion} · Road profile v{newmarketRoadProfile.version} · No official score or route claim.</p></footer>}
    </>
  )
}
