import { beforeEach, describe, expect, it } from 'vitest'
import { defaultPreferences, loadPreferences, savePreferences, weakestScenario } from './storage'
import type { AttemptRecord } from '../content/types'

describe('local data services', () => {
  beforeEach(() => window.localStorage.clear())

  it('round-trips preferences', () => {
    savePreferences({ ...defaultPreferences, speechEnabled: false })
    expect(loadPreferences().speechEnabled).toBe(false)
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

  it('derives a weak scenario from the latest ten attempts', () => {
    const attempt = {
      startedAt: '2026-08-12T00:00:00.000Z',
      findings: [
        { scenarioType: 'freeway-merge', severity: 'dangerous' },
        { scenarioType: 'yellow-light', severity: 'improve' },
      ],
    } as AttemptRecord
    expect(weakestScenario([attempt])).toBe('freeway-merge')
  })
})
