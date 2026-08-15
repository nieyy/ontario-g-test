import { newmarketCentre } from '../content/data'
import type {
  AttemptRecord,
  AttemptRecordV2,
  AttemptRuntimeContext,
  AttemptStatus,
  CoachState,
  Preferences,
  ResolvedRunConfig,
  RunStage,
  ScenarioType,
} from '../content/types'
import { createRunConfig, resolveRunConfig, type EngineState } from '../domain/engine'

const PREFERENCES_KEY = 'ontario-g-test.preferences.v1'
const FALLBACK_ATTEMPTS_KEY = 'ontario-g-test:attempts:v1'
const DB_NAME = 'ontario-g-test'
const ATTEMPT_STORE = 'attempts'
const CHECKPOINT_STORE = 'checkpoints'
const ACTIVE_ATTEMPT_KEY = 'ontario-g-test.active-attempt.v1'
const LOCK_OWNER_KEY = 'ontario-g-test.lock-owner.v1'

function lockOwner(): string {
  try {
    const existing = window.sessionStorage.getItem(LOCK_OWNER_KEY)
    if (existing) return existing
    const created = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
    window.sessionStorage.setItem(LOCK_OWNER_KEY, created)
    return created
  } catch {
    return 'memory-only-tab'
  }
}

export type AttemptCheckpoint<TState = unknown> = {
  attemptId: string
  contentVersion: string
  startedAt: string
  savedAt: string
  state: TState
}

type PersistedEngineStateV2 = EngineState & { stage: RunStage }

export type AttemptCheckpointV2 = AttemptCheckpoint<PersistedEngineStateV2> & {
  schemaVersion: 2
  config: ResolvedRunConfig
  runtime: AttemptRuntimeContext
  status: AttemptStatus
  coach?: CoachState
  guidancePlanVersion?: number
}

export const defaultPreferences: Preferences = {
  subtitlesZh: true,
  speechEnabled: true,
  ambientSoundEnabled: true,
  reducedMotion: false,
  highContrast: false,
  keyBindings: [
    { action: 'accelerate', code: 'KeyW', label: 'W / ↑' },
    { action: 'brake', code: 'KeyS', label: 'S / ↓' },
    { action: 'lane-left', code: 'KeyA', label: 'A / ←' },
    { action: 'lane-right', code: 'KeyD', label: 'D / →' },
    { action: 'signal-left', code: 'KeyZ', label: 'Z' },
    { action: 'signal-right', code: 'KeyC', label: 'C' },
    { action: 'mirror-left', code: 'KeyQ', label: 'Q' },
    { action: 'mirror-right', code: 'KeyE', label: 'E' },
    { action: 'shoulder-left', code: 'Shift+KeyQ', label: 'Shift+Q' },
    { action: 'shoulder-right', code: 'Shift+KeyE', label: 'Shift+E' },
    { action: 'pause', code: 'Escape', label: 'Esc' },
  ],
}

export function loadPreferences(): Preferences {
  try {
    const raw = window.localStorage.getItem(PREFERENCES_KEY)
    if (!raw) return defaultPreferences
    const stored = JSON.parse(raw) as Partial<Preferences>
    const keyBindings = stored.keyBindings?.map((binding) => {
      if (binding.action === 'lane-left' && binding.label === 'A') return { ...binding, label: 'A / ←' }
      if (binding.action === 'lane-right' && binding.label === 'D') return { ...binding, label: 'D / →' }
      if (binding.action === 'signal-left' && binding.code === 'Comma' && binding.label === ',') return { ...binding, code: 'KeyZ', label: 'Z' }
      if (binding.action === 'signal-right' && binding.code === 'Period' && binding.label === '.') return { ...binding, code: 'KeyC', label: 'C' }
      return binding
    })
    return { ...defaultPreferences, ...stored, keyBindings: keyBindings ?? defaultPreferences.keyBindings }
  } catch {
    return defaultPreferences
  }
}

export function savePreferences(preferences: Preferences): void {
  window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences))
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(ATTEMPT_STORE)) request.result.createObjectStore(ATTEMPT_STORE, { keyPath: 'id' })
      if (!request.result.objectStoreNames.contains(CHECKPOINT_STORE)) request.result.createObjectStore(CHECKPOINT_STORE, { keyPath: 'attemptId' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function fallbackAttempts(): AttemptRecord[] {
  try {
    return JSON.parse(window.localStorage.getItem(FALLBACK_ATTEMPTS_KEY) ?? '[]')
  } catch {
    return []
  }
}

export function normalizeAttemptRecord(stored: AttemptRecord | AttemptRecordV2): AttemptRecordV2 {
  if ('schemaVersion' in stored && stored.schemaVersion === 2) {
    return {
      ...stored,
      scenarioIds: stored.scenarioIds ?? [],
      actions: stored.actions ?? [],
      findings: (stored.findings ?? []).map((finding) => ({ ...finding, context: finding.context ?? (stored.mode === 'exam' ? 'exam' : 'practice') })),
      dangerousFindingIds: stored.dangerousFindingIds ?? [],
      migrationSource: 'v2',
    }
  }
  const scenarioIds = stored.scenarioIds ?? []
  const findings = stored.findings ?? []
  const variantId = scenarioIds.length === 1 ? scenarioIds[0] : undefined
  const variant = variantId
    ? Object.values(newmarketCentre.variants).flat().find((candidate) => candidate.id === variantId)
    : undefined
  const mode = stored.runStage === 'exam' ? 'exam' as const : 'practice' as const
  const context = stored.runStage === 'exam'
    ? 'exam' as const
    : stored.runStage === 'practice'
      ? 'practice' as const
      : 'legacy-unknown' as const
  return {
    ...stored,
    schemaVersion: 2,
    mode,
    scope: mode === 'practice' && variant
      ? {
          kind: 'scenario',
          scenarioType: variant.type,
          variantId: variant.id,
          practiceSessionId: `legacy-${stored.id}`,
          roundIndex: 1,
        }
      : { kind: 'full-route' },
    scenarioIds,
    actions: stored.actions ?? [],
    findings: findings.map((finding) => ({ ...finding, context })),
    dangerousFindingIds: stored.dangerousFindingIds ?? findings.filter((finding) => finding.severity === 'dangerous').map((finding) => finding.id),
    guidanceSummary: [],
    migrationSource: 'v1',
  }
}

export function normalizeEngineCheckpoint(stored: AttemptCheckpoint<EngineState> | AttemptCheckpointV2): AttemptCheckpointV2 | undefined {
  const state = stored.state
  if (!state?.route?.length) return undefined
  if ('schemaVersion' in stored && stored.schemaVersion === 2) return stored
  const stage = state.stage ?? 'exam'
  const only = state.route.length === 1 ? state.route[0] : undefined
  const config = resolveRunConfig(createRunConfig({
    centreId: 'newmarket',
    mode: stage === 'exam' ? 'exam' : 'practice',
    seed: state.seed,
    scope: only && stage !== 'exam'
      ? { kind: 'scenario', scenarioType: only.type, variantId: only.id, practiceSessionId: `legacy-${stored.attemptId}`, roundIndex: 1 }
      : { kind: 'full-route' },
  }))
  return {
    ...stored,
    schemaVersion: 2,
    state: { ...state, stage },
    config,
    runtime: {
      originMode: config.mode,
      guidanceMode: config.mode === 'practice' ? 'guided' : stage === 'continued-practice' ? 'guided' : 'off',
      findingContext: stage === 'exam' ? 'exam' : 'practice',
      continuedAfterDangerAtSeconds: stage === 'continued-practice' ? state.elapsed : undefined,
    },
    status: state.dangerPending ? 'danger-review' : state.paused ? 'paused' : state.completed ? 'completed' : 'running',
  }
}

export async function saveAttempt(attempt: AttemptRecord | AttemptRecordV2): Promise<void> {
  const normalized = normalizeAttemptRecord(attempt)
  if (typeof indexedDB === 'undefined') {
    window.localStorage.setItem(FALLBACK_ATTEMPTS_KEY, JSON.stringify([normalized, ...fallbackAttempts()].slice(0, 50)))
    return
  }
  const db = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(ATTEMPT_STORE, 'readwrite')
    transaction.objectStore(ATTEMPT_STORE).put(normalized)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
  db.close()
}

export async function getAttempts(): Promise<AttemptRecordV2[]> {
  if (typeof indexedDB === 'undefined') return fallbackAttempts().map(normalizeAttemptRecord)
  const db = await openDatabase()
  const attempts = await new Promise<AttemptRecord[]>((resolve, reject) => {
    const request = db.transaction(ATTEMPT_STORE).objectStore(ATTEMPT_STORE).getAll()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  db.close()
  return attempts.map(normalizeAttemptRecord).sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

export function weakestScenarioSuggestion(attempts: Array<AttemptRecord | AttemptRecordV2>): { scenarioType?: ScenarioType; source?: 'exam' | 'practice' } {
  const normalized = attempts.map(normalizeAttemptRecord).slice(0, 10)
  const hasExam = normalized.some((attempt) => attempt.findings.some((finding) => finding.context === 'exam' && finding.severity !== 'good'))
  const source = hasExam ? 'exam' as const : 'practice' as const
  const totals = new Map<ScenarioType, number>()
  for (const attempt of normalized) {
    for (const finding of attempt.findings) {
      if (finding.severity === 'good' || finding.context !== source) continue
      totals.set(finding.scenarioType, (totals.get(finding.scenarioType) ?? 0) + (finding.severity === 'dangerous' ? 2 : 1))
    }
  }
  return { scenarioType: [...totals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0], source }
}

export function weakestScenario(attempts: Array<AttemptRecord | AttemptRecordV2>): ScenarioType | undefined {
  return weakestScenarioSuggestion(attempts).scenarioType
}

export async function saveCheckpoint<TState>(checkpoint: AttemptCheckpoint<TState>): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  const db = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(CHECKPOINT_STORE, 'readwrite')
    transaction.objectStore(CHECKPOINT_STORE).put(checkpoint)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
  db.close()
}

export async function getLatestCheckpoint<TState>(): Promise<AttemptCheckpoint<TState> | undefined> {
  if (typeof indexedDB === 'undefined') return undefined
  const db = await openDatabase()
  const checkpoints = await new Promise<AttemptCheckpoint<TState>[]>((resolve, reject) => {
    const request = db.transaction(CHECKPOINT_STORE).objectStore(CHECKPOINT_STORE).getAll()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  db.close()
  return checkpoints.sort((a, b) => b.savedAt.localeCompare(a.savedAt))[0]
}

export async function deleteCheckpoint(attemptId: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  const db = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(CHECKPOINT_STORE, 'readwrite')
    transaction.objectStore(CHECKPOINT_STORE).delete(attemptId)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
  db.close()
}

export async function deleteAttempt(id: string): Promise<void> {
  const db = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(ATTEMPT_STORE, 'readwrite')
    transaction.objectStore(ATTEMPT_STORE).delete(id)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
  db.close()
}

export async function clearAttempts(): Promise<void> {
  const db = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction([ATTEMPT_STORE, CHECKPOINT_STORE], 'readwrite')
    transaction.objectStore(ATTEMPT_STORE).clear()
    transaction.objectStore(CHECKPOINT_STORE).clear()
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
  db.close()
}

export function exportAttempt(attempt: AttemptRecord): void {
  const blob = new Blob([JSON.stringify(attempt, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `ontario-g-test-attempt-${attempt.id.replaceAll(':', '-')}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

export function acquireAttemptLock(attemptId: string): boolean {
  const now = Date.now()
  const owner = lockOwner()
  try {
    const active = JSON.parse(window.localStorage.getItem(ACTIVE_ATTEMPT_KEY) ?? 'null') as { id: string; owner: string; at: number } | null
    if (active && active.owner !== owner && now - active.at < 15_000) return false
    window.localStorage.setItem(ACTIVE_ATTEMPT_KEY, JSON.stringify({ id: attemptId, owner, at: now }))
    return true
  } catch {
    return true
  }
}

export function refreshAttemptLock(attemptId: string): void {
  try { window.localStorage.setItem(ACTIVE_ATTEMPT_KEY, JSON.stringify({ id: attemptId, owner: lockOwner(), at: Date.now() })) } catch { /* memory-only fallback */ }
}

export function releaseAttemptLock(attemptId: string): void {
  try {
    const active = JSON.parse(window.localStorage.getItem(ACTIVE_ATTEMPT_KEY) ?? 'null') as { id: string; owner: string } | null
    if (active?.id === attemptId && active.owner === lockOwner()) window.localStorage.removeItem(ACTIVE_ATTEMPT_KEY)
  } catch { /* memory-only fallback */ }
}
