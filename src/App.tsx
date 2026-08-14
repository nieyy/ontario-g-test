import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './styles.css'
import { RoadScene } from './components/RoadScene'
import { newmarketCentre, scenarioLabels } from './content/data'
import type {
  ActionType,
  AttemptRecord,
  Finding,
  Preferences,
  ScenarioType,
} from './content/types'
import {
  advanceEngine,
  canStartTurn,
  createEngine,
  currentScenario,
  INTERSECTION_DECISION_DISTANCE_METERS,
  recordAction,
  resolveDanger,
  summarizeDimensions,
  TICK_SECONDS,
  toAttemptRecord,
  type EngineState,
} from './domain/engine'
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
  refreshAttemptLock,
  releaseAttemptLock,
  saveAttempt,
  saveCheckpoint,
  savePreferences,
  weakestScenario,
  type AttemptCheckpoint,
} from './services/storage'
import { speakInstruction } from './services/speech'

type View = 'home' | 'centre' | 'briefing' | 'player' | 'report' | 'history' | 'settings'

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

function Home({ start, practiceWeak, weakType, resume }: { start: () => void; practiceWeak: () => void; weakType?: ScenarioType; resume?: () => void }) {
  return (
    <main id="main-content">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Independent, local-first practice</p>
          <h1>Make the G-test routine visible before test day.</h1>
          <p className="lede">A 16-minute interactive Newmarket practice drive: listen to common English examiner instructions, operate the car, and review each decision on a timeline.</p>
          <div className="hero-actions">
            <button className="primary large" onClick={start}>Choose a test centre</button>
            {resume && <button className="secondary large" onClick={resume}>Resume interrupted drive</button>}
            {weakType && <button className="secondary large" onClick={practiceWeak}>Practise: {scenarioLabels[weakType]}</button>}
          </div>
          <p className="privacy-note">No account, analytics, ads, map API, or data upload. Attempts stay in this browser.</p>
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
        <article><span>02</span><h2>Make the decision</h2><p>Mouse, touch, or racing-game-inspired keyboard controls on a 2.5D road.</p></article>
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
          <ul><li>Urban intersections</li><li>Multi-lane turns</li><li>Freeway merge and exit</li></ul>
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
        <a href={newmarketCentre.evidence[0].sourceUrl} target="_blank" rel="noreferrer">View official centre listing</a>
      </aside>
    </main>
  )
}

function Briefing({ preferences, start, back, practiceType }: { preferences: Preferences; start: () => void; back: () => void; practiceType?: ScenarioType }) {
  return (
    <main id="main-content" className="page-shell briefing">
      <p className="eyebrow">Step 2 of 2</p>
      <h1>{practiceType ? `Focused practice: ${scenarioLabels[practiceType]}` : 'Newmarket practice drive'}</h1>
      <div className="briefing-grid">
        <section className="panel">
          <h2>Before you drive</h2>
          <ol className="brief-list">
            <li><strong>Listen first.</strong><span>The examiner gives a destination, never the exact driving technique.</span></li>
            <li><strong>Make checks visible.</strong><span>Mirror and blind-spot actions must be explicit in this simulation.</span></li>
            <li><strong>Danger pauses the exam.</strong><span>You may end or continue as practice; the original finding remains.</span></li>
          </ol>
        </section>
        <section className="panel controls-cheat">
          <h2>Keyboard</h2>
          <div><kbd>W</kbd><kbd>↑</kbd><span>Accelerate; release to hold speed</span></div>
          <div><kbd>S</kbd><kbd>↓</kbd><span>Brake; release to hold the new speed</span></div>
          <div><kbd>A / ←</kbd><kbd>D / →</kbd><span>Steer: change lane; repeat at the edge to turn when prompted</span></div>
          <div><kbd>,</kbd><kbd>.</kbd><span>Left / right signal</span></div>
          <div><kbd>Q</kbd><kbd>E</kbd><span>Left / right mirror</span></div>
          <div><kbd>⇧Q</kbd><kbd>⇧E</kbd><span>Left / right shoulder</span></div>
        </section>
      </div>
      <div className="briefing-footer">
        <p>{practiceType ? 'About 2–3 minutes' : 'About 16 minutes'} · Speech {preferences.speechEnabled ? 'on' : 'off'} · Chinese subtitles {preferences.subtitlesZh ? 'on' : 'off'}</p>
        <div><button className="secondary" onClick={back}>Back</button><button className="primary large" onClick={start}>Start when ready</button></div>
      </div>
    </main>
  )
}

type PlayerProps = {
  preferences: Preferences
  practiceType?: ScenarioType
  onFinish: (attempt: AttemptRecord) => void
  onExit: () => void
  checkpoint?: AttemptCheckpoint<EngineState>
  onLockConflict: () => void
}

function Player({ preferences, practiceType, onFinish, onExit, checkpoint, onLockConflict }: PlayerProps) {
  const [engine, setEngine] = useState<EngineState>(() => checkpoint
    ? {
        ...checkpoint.state,
        scenarioDistanceMeters: checkpoint.state.scenarioDistanceMeters ?? 0,
        turnDirection: checkpoint.state.turnDirection ?? null,
        turnProgress: checkpoint.state.turnProgress ?? 0,
      }
    : createEngine(seedFromUrl(), practiceType ? 'practice' : 'exam', practiceType))
  const [manualPaused, setManualPaused] = useState(false)
  const [recentAction, setRecentAction] = useState<ActionType | null>(null)
  const controls = useRef(new Set<ActionType>())
  const feedbackTimer = useRef<number | undefined>(undefined)
  const [startedAt] = useState(checkpoint?.startedAt ?? new Date().toISOString())
  const [attemptId] = useState(checkpoint?.attemptId ?? `${engine.seed}-${startedAt}`)
  const engineRef = useRef(engine)
  const lastCheckpointBucket = useRef(Math.floor(engine.elapsed / 10))
  const finished = useRef(false)
  const scenario = currentScenario(engine)
  const timeScale = new URLSearchParams(window.location.search).get('debug') === '1' ? 80 : 1

  const perform = useCallback((action: ActionType) => {
    if (action === 'pause') {
      setManualPaused((value) => !value)
      return
    }
    if (engineRef.current.turnDirection && (action.startsWith('lane-') || action.startsWith('turn-'))) return
    if ((action === 'turn-left' || action === 'turn-right') && !canStartTurn(engineRef.current, action)) return
    window.clearTimeout(feedbackTimer.current)
    setRecentAction(action)
    feedbackTimer.current = window.setTimeout(() => setRecentAction(null), 900)
    setEngine((state) => recordAction(state, action))
  }, [])

  useEffect(() => () => window.clearTimeout(feedbackTimer.current), [])

  useEffect(() => { engineRef.current = engine }, [engine])

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
      if (action === 'accelerate' || action === 'brake') controls.current.add(action)
      if (!event.repeat) perform(action)
    }
    const keyUp = (event: KeyboardEvent) => {
      const action = actionForKey(event, preferences)
      if (action === 'accelerate' || action === 'brake') controls.current.delete(action)
    }
    const hidden = () => {
      if (document.hidden) {
        setManualPaused(true)
        void saveCheckpoint({ attemptId, contentVersion: newmarketCentre.contentVersion, startedAt, savedAt: new Date().toISOString(), state: engineRef.current })
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
  }, [attemptId, perform, preferences, startedAt])

  useEffect(() => {
    const bucket = Math.floor(engine.elapsed / 10)
    if (engine.completed || bucket <= lastCheckpointBucket.current) return
    lastCheckpointBucket.current = bucket
    const checkpointValue = { attemptId, contentVersion: newmarketCentre.contentVersion, startedAt, savedAt: new Date().toISOString(), state: engine }
    void saveCheckpoint(checkpointValue)
  }, [attemptId, engine, startedAt])

  useEffect(() => {
    if (engine.completed && !finished.current) {
      finished.current = true
      void deleteCheckpoint(attemptId)
      onFinish(toAttemptRecord(engine, startedAt))
    }
  }, [attemptId, engine, onFinish, startedAt])

  const beginControl = useCallback((action: 'accelerate' | 'brake') => {
    controls.current.add(action)
    perform(action)
  }, [perform])
  const endControl = useCallback((action: 'accelerate' | 'brake') => {
    controls.current.delete(action)
  }, [])

  const totalDuration = engine.route.reduce((sum, item) => sum + item.durationSeconds, 0)
  const remaining = totalDuration - engine.elapsed
  const checklist = new Set(engine.scenarioActions.map((action) => action.type))
  const leftLaneTarget = engine.lane === 1 ? 'Centre' : 'Left'
  const rightLaneTarget = engine.lane === -1 ? 'Centre' : 'Right'
  const inTurnZone = engine.scenarioDistanceMeters >= INTERSECTION_DECISION_DISTANCE_METERS
  const canTurnLeft = inTurnZone && scenario.type === 'multilane-left' && engine.lane === -1
  const canTurnRight = inTurnZone && scenario.type === 'right-on-red' && engine.lane === 1
  const keyLabel = (action: ActionType) => preferences.keyBindings.find((binding) => binding.action === action)?.label ?? '—'
  const controlClass = (action: ActionType, active = false) => [
    'control-tile',
    checklist.has(action) ? 'used' : '',
    recentAction === action ? 'recent-control' : '',
    active ? 'active-control' : '',
  ].filter(Boolean).join(' ')

  return (
    <main id="main-content" className="player-shell">
      <header className="player-header">
        <div><span className="brand-mark small">G</span><strong>G TEST PRACTICE</strong></div>
        <div className="player-status"><span className="mode-badge">{practiceType ? 'PRACTICE MODE' : 'EXAM MODE'}</span><span>Scene {engine.scenarioIndex + 1}/{engine.route.length}</span><button onClick={() => setManualPaused(true)}>Pause <kbd>Esc</kbd></button></div>
      </header>
      <div className="progress-track"><span style={{ width: `${Math.min(100, (engine.elapsed / totalDuration) * 100)}%` }} /></div>
      <section className="drive-layout">
        <div className="scene-column">
          <RoadScene scenario={scenario} speedKph={engine.speedKph} lane={engine.lane} signal={engine.signal} recentAction={recentAction} scenarioElapsed={engine.scenarioElapsed} scenarioDistanceMeters={engine.scenarioDistanceMeters} turnDirection={engine.turnDirection} turnProgress={engine.turnProgress} reducedMotion={preferences.reducedMotion} />
          <button className="lane-target lane-target-left" disabled={engine.turnDirection !== null || engine.lane === -1} onClick={() => perform('lane-left')} aria-label={`Move one lane left to ${leftLaneTarget} lane`}><span>← MOVE 1 LANE</span><small>to {leftLaneTarget}</small><kbd>{keyLabel('lane-left')}</kbd></button>
          <button className="lane-target lane-target-right" disabled={engine.turnDirection !== null || engine.lane === 1} onClick={() => perform('lane-right')} aria-label={`Move one lane right to ${rightLaneTarget} lane`}><span>MOVE 1 LANE →</span><small>to {rightLaneTarget}</small><kbd>{keyLabel('lane-right')}</kbd></button>
          {inTurnZone && scenario.type === 'multilane-left' && <button className="turn-command turn-command-left" disabled={!canTurnLeft || engine.turnDirection !== null} onClick={() => perform('turn-left')} aria-label="Turn left at the intersection"><span>↰ TURN LEFT</span><small>{canTurnLeft ? 'turn now' : 'move to left lane first'}</small><kbd>←</kbd></button>}
          {inTurnZone && scenario.type === 'right-on-red' && <button className="turn-command turn-command-right" disabled={!canTurnRight || engine.turnDirection !== null} onClick={() => perform('turn-right')} aria-label="Turn right at the intersection"><span>TURN RIGHT ↱</span><small>{canTurnRight ? 'turn now' : 'move to right lane first'}</small><kbd>→</kbd></button>}
          <div className="examiner-card" aria-live="polite">
            <span className="examiner-avatar" aria-hidden="true">EX</span>
            <div><small>EXAMINER</small><p>“{scenario.examinerInstruction}”</p>{preferences.subtitlesZh && <span>{scenario.subtitleZh}</span>}</div>
            <button onClick={() => speakInstruction(scenario.examinerInstruction, true)} aria-label="Repeat examiner instruction">↻</button>
          </div>
          <div className="route-progress-card" aria-label={`Route progress: scene ${engine.scenarioIndex + 1} of ${engine.route.length}`}>
            <div><small>ROUTE PROGRESS</small><strong>{formatTime(remaining)}</strong></div>
            <div className="route-dots">{engine.route.map((item, index) => <i key={`${item.id}-${index}`} className={index < engine.scenarioIndex ? 'done' : index === engine.scenarioIndex ? 'current' : ''} />)}</div>
          </div>
        </div>
        <aside className="control-deck" aria-label="Driving controls">
          <div className="instrument-panel">
            <div className="speed-readout"><span>SPEED</span><strong>{Math.round(engine.speedKph)}</strong><small><b className="hold-badge">HOLD</b> km/h</small></div>
            <div className="limit-readout"><span>LIMIT</span><strong>{scenario.speedLimitKph}</strong></div>
            <div className="time-readout"><span>TIME LEFT</span><strong>{formatTime(remaining)}</strong></div>
          </div>
          <div className="control-grid">
            <button aria-label="Left signal" aria-pressed={engine.signal === 'left'} className={controlClass('signal-left', engine.signal === 'left')} onClick={() => perform('signal-left')}><span className="control-icon signal-icon">←</span><strong>LEFT SIGNAL</strong><kbd>{keyLabel('signal-left')}</kbd></button>
            <button aria-label="Right signal" aria-pressed={engine.signal === 'right'} className={controlClass('signal-right', engine.signal === 'right')} onClick={() => perform('signal-right')}><span className="control-icon signal-icon">→</span><strong>RIGHT SIGNAL</strong><kbd>{keyLabel('signal-right')}</kbd></button>
            <button aria-label="Left mirror" className={controlClass('mirror-left')} onClick={() => perform('mirror-left')}><span className="control-icon mirror-icon">▱</span><strong>LEFT MIRROR</strong><kbd>{keyLabel('mirror-left')}</kbd></button>
            <button aria-label="Right mirror" className={controlClass('mirror-right')} onClick={() => perform('mirror-right')}><span className="control-icon mirror-icon">▰</span><strong>RIGHT MIRROR</strong><kbd>{keyLabel('mirror-right')}</kbd></button>
            <button aria-label="Left shoulder check" className={controlClass('shoulder-left')} onClick={() => perform('shoulder-left')}><span className="control-icon shoulder-icon">◉←</span><strong>LEFT SHOULDER</strong><kbd>{keyLabel('shoulder-left')}</kbd></button>
            <button aria-label="Right shoulder check" className={controlClass('shoulder-right')} onClick={() => perform('shoulder-right')}><span className="control-icon shoulder-icon">→◉</span><strong>RIGHT SHOULDER</strong><kbd>{keyLabel('shoulder-right')}</kbd></button>
          </div>
          <div className="pedals">
            <button aria-label="Brake" className="brake" onPointerDown={() => beginControl('brake')} onPointerUp={() => endControl('brake')} onPointerCancel={() => endControl('brake')} onPointerLeave={() => endControl('brake')}><span>!</span><strong>BRAKE</strong><kbd>{keyLabel('brake')}</kbd></button>
            <button aria-label="Accelerate" className="accelerate" onPointerDown={() => beginControl('accelerate')} onPointerUp={() => endControl('accelerate')} onPointerCancel={() => endControl('accelerate')} onPointerLeave={() => endControl('accelerate')}><span>↑</span><strong>ACCELERATE</strong><kbd>{keyLabel('accelerate')}</kbd></button>
          </div>
          {engine.stage !== 'exam' && <div className="practice-hint"><strong>Practice checklist</strong><span>{scenario.requiredActions.filter((action) => checklist.has(action)).length}/{scenario.requiredActions.length} expected actions observed</span></div>}
        </aside>
      </section>

      {manualPaused && (
        <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="pause-title"><p className="eyebrow">Drive paused</p><h2 id="pause-title">Take a moment.</h2><p>The simulation clock and vehicle controls are stopped.</p><div className="modal-actions"><button className="secondary" onClick={onExit}>Exit drive</button><button className="primary" autoFocus onClick={() => setManualPaused(false)}>Resume</button></div></section></div>
      )}
      {engine.dangerPending && (
        <div className="modal-backdrop"><section className="modal danger-modal" role="alertdialog" aria-modal="true" aria-labelledby="danger-title">
          <span className="danger-icon">!</span><p className="eyebrow">Dangerous moment detected</p><h2 id="danger-title">The exam portion stops here.</h2>
          <p>{engine.findings.at(-1)?.impact}</p><p>You can end and review now, or continue the remaining route as practice. This finding will remain in the report.</p>
          <div className="modal-actions"><button className="secondary" onClick={() => setEngine((state) => resolveDanger(state, 'end'))}>End & review</button><button className="primary" autoFocus onClick={() => setEngine((state) => resolveDanger(state, 'continue'))}>Continue as practice</button></div>
        </section></div>
      )}
      {new URLSearchParams(window.location.search).get('debug') === '1' && <aside className="debug-panel" aria-label="Local debug information">engine 1.0 · content {newmarketCentre.contentVersion} · seed {engine.seed} · segment {engine.scenarioIndex + 1} · {Math.round(engine.elapsed * 1000)}ms · actions {engine.actions.length}</aside>}
    </main>
  )
}

function Report({ attempt, restart, history }: { attempt: AttemptRecord; restart: (type?: ScenarioType) => void; history: () => void }) {
  const dimensions = summarizeDimensions(attempt.findings)
  const issues = attempt.findings.filter((finding) => finding.severity !== 'good')
  const top = [...issues].sort((a, b) => (b.severity === 'dangerous' ? 2 : 1) - (a.severity === 'dangerous' ? 2 : 1)).slice(0, 3)
  const weak = top[0]?.scenarioType
  return (
    <main id="main-content" className="page-shell report-page">
      <p className="eyebrow">Drive review</p><h1>{attempt.dangerousFindingIds.length ? 'Review the dangerous moments first.' : 'Practice drive complete.'}</h1>
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

function History({ attempts, practice, remove, clear }: { attempts: AttemptRecord[]; practice: (type: ScenarioType) => void; remove: (id: string) => void; clear: () => void }) {
  const weak = weakestScenario(attempts)
  return <main id="main-content" className="page-shell"><p className="eyebrow">Stored only on this device</p><h1>Practice history</h1><p className="page-intro">The most recent ten attempts inform the suggested weak area. You control deletion; the app never uploads or automatically removes attempts.</p><div className="history-actions">{weak && <button className="primary" onClick={() => practice(weak)}>Practise suggested weakness: {scenarioLabels[weak]}</button>}{attempts.length > 0 && <button className="secondary" onClick={clear}>Clear all history</button>}</div><section className="history-list">{attempts.length ? attempts.map((attempt) => <article key={attempt.id}><div><strong>{new Date(attempt.startedAt).toLocaleString()}</strong><span>{attempt.runStage} · {formatTime(attempt.durationSeconds)}</span></div><div><span>{attempt.findings.filter((item) => item.severity !== 'good').length} findings</span><span className={attempt.dangerousFindingIds.length ? 'danger-count' : ''}>{attempt.dangerousFindingIds.length} dangerous</span><button className="text-button" onClick={() => exportAttempt(attempt)}>Export JSON</button><button className="text-button danger-text" onClick={() => remove(attempt.id)}>Delete</button></div></article>) : <div className="empty-state"><h2>No attempts yet</h2><p>Complete a practice drive and its review will appear here.</p></div>}</section></main>
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
  return <main id="main-content" className="page-shell settings-page"><p className="eyebrow">Accessibility & controls</p><h1>Settings</h1><section className="panel toggle-list"><label><span><strong>Spoken examiner instructions</strong><small>Uses the browser’s en-CA speech voice when available.</small></span><input type="checkbox" checked={preferences.speechEnabled} onChange={(event) => set({ speechEnabled: event.target.checked })} /></label><label><span><strong>Chinese subtitles</strong><small>English examiner wording remains primary.</small></span><input type="checkbox" checked={preferences.subtitlesZh} onChange={(event) => set({ subtitlesZh: event.target.checked })} /></label><label><span><strong>Reduced road motion</strong><small>Stops moving lane markers and lead-vehicle drift.</small></span><input type="checkbox" checked={preferences.reducedMotion} onChange={(event) => set({ reducedMotion: event.target.checked })} /></label><label><span><strong>High contrast</strong><small>Strengthens borders and text contrast throughout the interface.</small></span><input type="checkbox" checked={preferences.highContrast} onChange={(event) => set({ highContrast: event.target.checked })} /></label></section><section className="panel key-settings"><div className="section-heading"><div><h2>Keyboard mapping</h2><p>Focus a key button and press the replacement key. Left/right arrows are permanent steering aliases for lane changes and prompted turns.</p>{conflict && <p className="form-error" role="alert">{conflict}</p>}</div><button className="secondary" onClick={() => { setConflict(''); set({ keyBindings: defaultPreferences.keyBindings }) }}>Reset</button></div>{preferences.keyBindings.map((binding, index) => <div key={binding.action}><span>{actionNames[binding.action]}</span><button disabled={binding.action === 'pause'} aria-label={`Remap ${actionNames[binding.action]}`} onKeyDown={(event) => remap(index, event)}>{binding.label}</button></div>)}</section></main>
}

export default function App() {
  const [view, setView] = useState<View>('home')
  const [preferences, setPreferences] = useState(loadPreferences)
  const [attempts, setAttempts] = useState<AttemptRecord[]>([])
  const [report, setReport] = useState<AttemptRecord>()
  const [practiceType, setPracticeType] = useState<ScenarioType>()
  const [checkpoint, setCheckpoint] = useState<AttemptCheckpoint<EngineState>>()

  const refreshAttempts = useCallback(() => getAttempts().then(setAttempts).catch(() => setAttempts([])), [])
  useEffect(() => {
    void refreshAttempts()
    void getLatestCheckpoint<EngineState>().then((value) => {
      if (value?.contentVersion === newmarketCentre.contentVersion) setCheckpoint(value)
    }).catch(() => setCheckpoint(undefined))
  }, [refreshAttempts])
  useEffect(() => { document.documentElement.classList.toggle('high-contrast', preferences.highContrast) }, [preferences.highContrast])

  const updatePreferences = (value: Preferences) => { setPreferences(value); savePreferences(value) }
  const openPractice = (type: ScenarioType) => {
    if (checkpoint) void deleteCheckpoint(checkpoint.attemptId)
    setCheckpoint(undefined)
    setPracticeType(type)
    setView('briefing')
  }
  const startFull = () => {
    if (checkpoint) void deleteCheckpoint(checkpoint.attemptId)
    setCheckpoint(undefined)
    setPracticeType(undefined)
    setView('centre')
  }
  const finish = useCallback((attempt: AttemptRecord) => {
    setReport(attempt)
    setView('report')
    void saveAttempt(attempt).then(refreshAttempts)
  }, [refreshAttempts])
  const restart = (type?: ScenarioType) => { setPracticeType(type); setReport(undefined); setView(type ? 'briefing' : 'centre') }
  const weak = useMemo(() => weakestScenario(attempts), [attempts])

  return (
    <>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <Header view={view} navigate={setView} />
      {view === 'home' && <Home start={startFull} weakType={weak} practiceWeak={() => weak && openPractice(weak)} resume={checkpoint ? () => { setPracticeType(checkpoint.state.route.length === 1 ? checkpoint.state.route[0].type : undefined); setView('player') } : undefined} />}
      {view === 'centre' && <CentrePicker onSelect={() => setView('briefing')} />}
      {view === 'briefing' && <Briefing preferences={preferences} practiceType={practiceType} back={() => setView(practiceType ? 'home' : 'centre')} start={() => setView('player')} />}
      {view === 'player' && <Player preferences={preferences} practiceType={practiceType} checkpoint={checkpoint} onFinish={(attempt) => { setCheckpoint(undefined); finish(attempt) }} onExit={() => setView('home')} onLockConflict={() => { window.alert('Another tab is already running a practice drive.'); setView('home') }} />}
      {view === 'report' && report && <Report attempt={report} restart={restart} history={() => setView('history')} />}
      {view === 'history' && <History attempts={attempts} practice={openPractice} remove={(id) => { if (window.confirm('Delete this local attempt?')) void deleteAttempt(id).then(refreshAttempts) }} clear={() => { if (window.confirm('Clear all local attempts and checkpoints?')) void clearAttempts().then(() => { setCheckpoint(undefined); refreshAttempts() }) }} />}
      {view === 'settings' && <Settings preferences={preferences} update={updatePreferences} />}
      {view !== 'player' && <footer><p>{newmarketCentre.disclaimer}</p><p>Content v{newmarketCentre.contentVersion} · No official score or route claim.</p></footer>}
    </>
  )
}
