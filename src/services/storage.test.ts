import { beforeEach, describe, expect, it } from 'vitest'
import { defaultPreferences, loadPreferences, savePreferences, weakestScenario } from './storage'
import type { AttemptRecord } from '../content/types'

describe('local data services', () => {
  beforeEach(() => window.localStorage.clear())

  it('round-trips preferences', () => {
    savePreferences({ ...defaultPreferences, speechEnabled: false })
    expect(loadPreferences().speechEnabled).toBe(false)
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
