import { describe, expect, it } from 'vitest'
import { newmarketCentre } from '../content/data'
import { getGuidancePlan, guidancePlans } from '../content/guidance'
import { validateGuidanceContent } from '../content/validate'
import type { AttemptRuntimeContext, ResolvedRunConfig } from '../content/types'
import { defaultPreferences } from '../services/storage'
import { createEngine, createRunConfig, recordAction, resolveRunConfig, restartScenario, toAttemptRecord } from './engine'
import { createCoachState, reduceCoachState, toCoachFrame } from './guidance'

const rightConfig = (): ResolvedRunConfig => resolveRunConfig(createRunConfig({
  centreId: 'newmarket',
  mode: 'practice',
  seed: 17,
  scope: { kind: 'scenario', scenarioType: 'right-on-red', variantId: 'right-on-red-1', practiceSessionId: 'session-a', roundIndex: 1 },
}))

describe('guided practice contract', () => {
  it('covers every playable variant exactly once', () => {
    expect(validateGuidanceContent(newmarketCentre, guidancePlans)).toEqual([])
    expect(guidancePlans.flatMap((plan) => plan.variantIds)).toHaveLength(18)
  })

  it('rejects a plan that teaches Signal before Mirror', () => {
    const [right, ...rest] = guidancePlans
    const invalid = [{ ...right, steps: [right.steps[1], right.steps[0], ...right.steps.slice(2)] }, ...rest]
    expect(validateGuidanceContent(newmarketCentre, invalid)).toContain(
      'right-on-red-v1 must order right MSS as mirror -> signal -> shoulder',
    )
  })

  it('can progress every one of the 18 variant plans to completion', () => {
    for (const variant of Object.values(newmarketCentre.variants).flat()) {
      const plan = getGuidancePlan(variant.id)!
      const engine = { ...createEngine(resolveRunConfig(createRunConfig({
        centreId: 'newmarket',
        mode: 'practice',
        seed: 71,
        scope: { kind: 'scenario', scenarioType: variant.type, variantId: variant.id, practiceSessionId: 'coverage', roundIndex: 1 },
      }))), roadProfileEnabled: false }
      const actions = plan.steps.flatMap((step, index) => step.completeWhen.kind === 'action'
        ? [{ type: step.completeWhen.action, atSeconds: index + 1 }]
        : [])
      const coach = reduceCoachState({ coach: createCoachState(plan), plan, engineState: engine, scenarioActions: actions })
      expect(coach.completedStepIds, variant.id).toEqual(plan.steps.map((step) => step.id))
    }
  })

  it('progresses MSS in mirror, signal, shoulder order and ignores duplicate replay', () => {
    const config = rightConfig()
    let engine = createEngine(config)
    const plan = getGuidancePlan('right-on-red-1')!
    let coach = createCoachState(plan)

    engine = recordAction(engine, 'mirror-right')
    coach = reduceCoachState({ coach, plan, engineState: engine, scenarioActions: engine.scenarioActions })
    expect(coach.completedStepIds).toEqual(['right-mirror'])

    engine = recordAction(engine, 'signal-right')
    coach = reduceCoachState({ coach, plan, engineState: engine, scenarioActions: engine.scenarioActions })
    engine = recordAction(engine, 'shoulder-right')
    coach = reduceCoachState({ coach, plan, engineState: engine, scenarioActions: engine.scenarioActions })
    expect(coach.completedStepIds).toEqual(['right-mirror', 'right-signal', 'right-shoulder'])
    expect(reduceCoachState({ coach, plan, engineState: engine, scenarioActions: engine.scenarioActions })).toBe(coach)
  })

  it('gives one corrective feedback for the opposite action without undoing engine input', () => {
    const engine = recordAction(createEngine(rightConfig()), 'mirror-left')
    const plan = getGuidancePlan('right-on-red-1')!
    const coach = reduceCoachState({ coach: createCoachState(plan), plan, engineState: engine, scenarioActions: engine.scenarioActions })
    expect(coach.completedStepIds).toEqual([])
    expect(coach.feedback?.tone).toBe('corrective')
    expect(engine.scenarioActions.at(-1)?.type).toBe('mirror-left')
  })

  it('renders configured key labels without changing plan content', () => {
    const plan = getGuidancePlan('right-on-red-1')!
    const frame = toCoachFrame({ coach: createCoachState(plan), plan, keyBindings: defaultPreferences.keyBindings, subtitlesZh: true })
    expect(frame.visibleSteps[0].keyLabel).toBe('E')
    expect(frame.visibleSteps[0].title).toContain('右侧后视镜')
  })

  it('keeps full-route Exam and Practice routes identical for the same seed', () => {
    const exam = createEngine(resolveRunConfig(createRunConfig({ centreId: 'newmarket', mode: 'exam', seed: 41 })))
    const practice = createEngine(resolveRunConfig(createRunConfig({ centreId: 'newmarket', mode: 'practice', seed: 41, scope: { kind: 'full-route' } })))
    expect(practice.route).toEqual(exam.route)
  })

  it('retries the same variant exactly and rotates deterministically to the next', () => {
    const config = rightConfig()
    const source = createEngine(config)
    const same = restartScenario({ source, config, strategy: 'same' })
    const next = restartScenario({ source, config, strategy: 'next' })
    expect(same.config.seed).toBe(config.seed)
    expect(same.state.route[0].id).toBe('right-on-red-1')
    expect(next.state.route[0].id).toBe('right-on-red-2')
    expect(next.config.seed).not.toBe(config.seed)
  })

  it('preserves the first dangerous finding as exam evidence after continuing', () => {
    const config = resolveRunConfig(createRunConfig({ centreId: 'newmarket', mode: 'exam', seed: 51 }))
    const engine = createEngine(config)
    const runtime: AttemptRuntimeContext = { originMode: 'exam', guidanceMode: 'guided', findingContext: 'practice', continuedAfterDangerAtSeconds: 160 }
    const record = toAttemptRecord({ ...engine, elapsed: 170, findings: [{
      id: 'danger', scenarioId: engine.route[0].id, scenarioType: engine.route[0].type, dimension: 'observation', severity: 'dangerous', situation: 'test', action: 'missed', impact: 'risk', improvement: 'retry', evidence: engine.route[0].evidence, atSeconds: 160,
    }] }, '2026-08-15T00:00:00.000Z', config, runtime)
    expect(record.runStage).toBe('continued-practice')
    expect(record.findings[0].context).toBe('exam')
  })
})
