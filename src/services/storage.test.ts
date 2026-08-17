import { beforeEach, describe, expect, it } from 'vitest'
import { createEngine, createRunConfig, resolveRunConfig, type EngineState } from '../domain/engine'
import { defaultPreferences, loadPreferences, normalizeAttemptRecord, normalizeEngineCheckpoint, savePreferences, weakestScenario, weakestScenarioSuggestion } from './storage'
import type { AttemptRecord } from '../content/types'

describe('local data services', () => {
  beforeEach(() => window.localStorage.clear())

  it('round-trips preferences', () => {
    savePreferences({ ...defaultPreferences, speechEnabled: false })
    expect(loadPreferences().speechEnabled).toBe(false)
    expect(loadPreferences().ambientSoundEnabled).toBe(true)
  })

  it('adds road ambience when loading preferences saved by an older release', () => {
    const olderPreferences: Partial<typeof defaultPreferences> = { ...defaultPreferences }
    delete olderPreferences.ambientSoundEnabled
    window.localStorage.setItem('ontario-g-test.preferences.v1', JSON.stringify(olderPreferences))
    expect(loadPreferences().ambientSoundEnabled).toBe(true)
  })

  it('migrates lane labels saved by the separated-control release', () => {
    window.localStorage.setItem('ontario-g-test.preferences.v1', JSON.stringify({
      ...defaultPreferences,
      keyBindings: defaultPreferences.keyBindings.map((binding) => binding.action === 'lane-left'
        ? { ...binding, label: 'A' }
        : binding.action === 'lane-right'
          ? { ...binding, label: 'D' }
          : binding),
    }))

    const preferences = loadPreferences()
    expect(preferences.keyBindings.find((binding) => binding.action === 'lane-left')?.label).toBe('A / ←')
    expect(preferences.keyBindings.find((binding) => binding.action === 'lane-right')?.label).toBe('D / →')
  })

  it('migrates the old default signal keys without changing other bindings', () => {
    window.localStorage.setItem('ontario-g-test.preferences.v1', JSON.stringify({
      ...defaultPreferences,
      keyBindings: defaultPreferences.keyBindings.map((binding) => binding.action === 'signal-left'
        ? { ...binding, code: 'Comma', label: ',' }
        : binding.action === 'signal-right'
          ? { ...binding, code: 'Period', label: '.' }
          : binding),
    }))

    const preferences = loadPreferences()
    expect(preferences.keyBindings.find((binding) => binding.action === 'signal-left')).toMatchObject({ code: 'KeyZ', label: 'Z' })
    expect(preferences.keyBindings.find((binding) => binding.action === 'signal-right')).toMatchObject({ code: 'KeyC', label: 'C' })
  })

  it('derives a weak scenario from the latest ten attempts', () => {
    const attempt = {
      id: 'legacy-exam',
      centreId: 'newmarket',
      contentVersion: '1.0.0',
      seed: 1,
      startedAt: '2026-08-12T00:00:00.000Z',
      runStage: 'exam',
      durationSeconds: 10,
      scenarioIds: ['freeway-merge-1'],
      actions: [],
      findings: [
        { id: 'a', scenarioId: 'freeway-merge-1', scenarioType: 'freeway-merge', dimension: 'speed', severity: 'dangerous', situation: '', action: '', impact: '', improvement: '', evidence: { level: 'authored', label: '', checkedOn: '2026-08-12' }, atSeconds: 1 },
        { id: 'b', scenarioId: 'yellow-light-1', scenarioType: 'yellow-light', dimension: 'decision', severity: 'improve', situation: '', action: '', impact: '', improvement: '', evidence: { level: 'authored', label: '', checkedOn: '2026-08-12' }, atSeconds: 2 },
      ],
      dangerousFindingIds: ['a'],
      completed: true,
    } as AttemptRecord
    expect(weakestScenario([attempt])).toBe('freeway-merge')
    expect(weakestScenarioSuggestion([attempt]).source).toBe('exam')
  })

  it('normalizes legacy practice and continued-practice context conservatively', () => {
    const base: AttemptRecord = {
      id: 'legacy', centreId: 'newmarket', contentVersion: '1.0.0', seed: 2,
      startedAt: '2026-08-12T00:00:00.000Z', runStage: 'practice', durationSeconds: 10,
      scenarioIds: ['right-on-red-1'], actions: [], findings: [], dangerousFindingIds: [], completed: true,
    }
    const practice = normalizeAttemptRecord(base)
    expect(practice.scope).toMatchObject({ kind: 'scenario', variantId: 'right-on-red-1' })
    expect(practice.migrationSource).toBe('v1')

    const continued = normalizeAttemptRecord({ ...base, runStage: 'continued-practice', findings: [{
      id: 'legacy-danger', scenarioId: 'right-on-red-1', scenarioType: 'right-on-red', dimension: 'observation', severity: 'dangerous', situation: '', action: '', impact: '', improvement: '', evidence: { level: 'authored', label: '', checkedOn: '2026-08-12' }, atSeconds: 3,
    }] })
    expect(continued.findings[0].context).toBe('legacy-unknown')
    expect(weakestScenarioSuggestion([continued]).scenarioType).toBeUndefined()
  })

  it('keeps a partially written legacy record readable without inventing evidence', () => {
    const partial = normalizeAttemptRecord({
      id: 'partial', centreId: 'newmarket', contentVersion: '1.0.0', seed: 3,
      startedAt: '2026-08-12T00:00:00.000Z', runStage: 'continued-practice', durationSeconds: 2,
      completed: false,
    } as AttemptRecord)
    expect(partial.scenarioIds).toEqual([])
    expect(partial.actions).toEqual([])
    expect(partial.findings).toEqual([])
    expect(partial.dangerousFindingIds).toEqual([])
    expect(partial.scope).toEqual({ kind: 'full-route' })
  })

  it('normalizes a v1 checkpoint while preserving its legacy stage for rollback', () => {
    const state = createEngine(7, 'practice', 'right-on-red')
    const checkpoint = normalizeEngineCheckpoint({ attemptId: 'legacy-checkpoint', contentVersion: '1.0.0', startedAt: '2026-08-12T00:00:00.000Z', savedAt: '2026-08-12T00:00:01.000Z', state })
    expect(checkpoint?.schemaVersion).toBe(3)
    expect(checkpoint?.state.stage).toBe('practice')
    expect(checkpoint?.config.mode).toBe('practice')
    expect(checkpoint?.config.scope).toMatchObject({ kind: 'scenario', variantId: state.route[0].id })
    expect(checkpoint?.state.roadPosition.laneId).toBe('parking-access')
  })

  it('migrates an unambiguous v2 checkpoint to schema v3 and preserves rollback fields', () => {
    const config = resolveRunConfig(createRunConfig({ centreId: 'newmarket', mode: 'practice', seed: 9, scope: { kind: 'scenario', scenarioType: 'right-on-red', practiceSessionId: 'v2', roundIndex: 1 } }))
    const state = structuredClone(createEngine(config)) as Partial<EngineState>
    delete state.roadPosition
    delete state.laneOffsetM
    delete state.laneChangeFromOffsetM
    delete state.roadProfileEnabled
    const migrated = normalizeEngineCheckpoint({
      attemptId: 'v2', contentVersion: '1.1.0', startedAt: '2026-08-16T00:00:00.000Z', savedAt: '2026-08-16T00:00:02.000Z',
      schemaVersion: 2, config, runtime: { originMode: 'practice', guidanceMode: 'guided', findingContext: 'practice' }, status: 'running', state: state as EngineState,
    })
    expect(migrated).toMatchObject({ schemaVersion: 3, roadProfileId: 'newmarket-road-profile-v1', roadProfileVersion: '1.0.0' })
    expect(migrated?.state.route).toHaveLength(1)
    expect(migrated?.state.lane).toBe(0)
  })

  it('refuses an ambiguous two-lane v2 checkpoint without deleting history', () => {
    const config = resolveRunConfig(createRunConfig({ centreId: 'newmarket', mode: 'practice', seed: 10, scope: { kind: 'scenario', scenarioType: 'yellow-light', practiceSessionId: 'ambiguous', roundIndex: 1 } }))
    const state = structuredClone(createEngine(config)) as Partial<EngineState>
    // The right-turn lane tapers in after the section starts. Place the legacy
    // checkpoint beyond that taper so lane index 0 is genuinely ambiguous.
    state.scenarioDistanceMeters = 100
    delete state.roadPosition
    delete state.laneOffsetM
    delete state.laneChangeFromOffsetM
    delete state.roadProfileEnabled
    const migrated = normalizeEngineCheckpoint({
      attemptId: 'ambiguous', contentVersion: '1.1.0', startedAt: '2026-08-16T00:00:00.000Z', savedAt: '2026-08-16T00:00:02.000Z',
      schemaVersion: 2, config, runtime: { originMode: 'practice', guidanceMode: 'guided', findingContext: 'practice' }, status: 'running', state: state as EngineState,
    })
    expect(migrated).toBeUndefined()
  })

  it('reads a valid v3 checkpoint and rejects a mismatched profile', () => {
    const config = resolveRunConfig(createRunConfig({ centreId: 'newmarket', mode: 'exam', seed: 11 }))
    const state = createEngine(config)
    const base = {
      attemptId: 'v3', contentVersion: '1.2.0', startedAt: '2026-08-16T00:00:00.000Z', savedAt: '2026-08-16T00:00:02.000Z',
      schemaVersion: 3 as const, config, runtime: { originMode: 'exam' as const, guidanceMode: 'off' as const, findingContext: 'exam' as const }, status: 'running' as const,
      state, roadProfileId: 'newmarket-road-profile-v1', roadProfileVersion: '1.0.0', routeSeed: 11,
    }
    expect(normalizeEngineCheckpoint(base)?.schemaVersion).toBe(3)
    expect(normalizeEngineCheckpoint({ ...base, roadProfileId: 'unknown' })).toBeUndefined()
  })
})
