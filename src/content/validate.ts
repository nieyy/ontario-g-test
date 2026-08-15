import type { CentreProfile, GuidancePlan, ScenarioType } from './types'

const requiredTypes: ScenarioType[] = [
  'right-on-red',
  'yellow-light',
  'multilane-left',
  'freeway-merge',
  'slow-lead',
  'freeway-exit',
]

export function validateCentreContent(centre: CentreProfile): string[] {
  const errors: string[] = []

  if (!centre.id || !centre.contentVersion || !centre.disclaimer) {
    errors.push('centre identity, contentVersion and disclaimer are required')
  }

  if (!centre.evidence.length) errors.push('centre evidence is required')

  for (const type of requiredTypes) {
    const variants = centre.variants[type]
    if (!variants || variants.length < 3) {
      errors.push(`${type} requires at least three variants`)
      continue
    }

    for (const variant of variants) {
      if (variant.type !== type) errors.push(`${variant.id} has a mismatched type`)
      if (variant.durationSeconds <= 0) errors.push(`${variant.id} has an invalid duration`)
      if (!variant.examinerInstruction.trim()) errors.push(`${variant.id} is missing examiner wording`)
      if (!variant.evidence?.level) errors.push(`${variant.id} is missing evidence metadata`)
    }
  }

  return errors
}

export function validateGuidanceContent(centre: CentreProfile, plans: GuidancePlan[]): string[] {
  const errors: string[] = []
  const variants = Object.values(centre.variants).flat()
  const variantIds = new Set(variants.map((variant) => variant.id))
  const coverage = new Map<string, string[]>()

  for (const item of plans) {
    if (!item.id.trim()) errors.push('guidance plan id is required')
    if (!item.steps.length || !item.steps.some((step) => step.phase === 'act')) {
      errors.push(`${item.id} requires at least one act step`)
    }
    const stepIds = new Set<string>()
    for (const step of item.steps) {
      if (stepIds.has(step.id)) errors.push(`${item.id} has duplicate step ${step.id}`)
      stepIds.add(step.id)
      if (!step.titleEn.trim() || !step.instructionEn.trim()) errors.push(`${item.id}/${step.id} requires English copy`)
      if (step.highlightedAction && step.completeWhen.kind === 'action' && step.highlightedAction !== step.completeWhen.action) {
        errors.push(`${item.id}/${step.id} highlights a different action than it completes`)
      }
    }
    for (const variantId of item.variantIds) {
      if (!variantIds.has(variantId)) errors.push(`${item.id} references unknown variant ${variantId}`)
      coverage.set(variantId, [...(coverage.get(variantId) ?? []), item.id])
      const variant = variants.find((candidate) => candidate.id === variantId)
      if (variant && variant.type !== item.scenarioType) errors.push(`${item.id} mismatches ${variantId} scenario type`)
    }

    const stepActions = item.steps
      .map((step) => step.completeWhen.kind === 'action' ? step.completeWhen.action : undefined)
      .filter(Boolean)
    for (const direction of ['left', 'right'] as const) {
      const mirror = stepActions.indexOf(`mirror-${direction}`)
      const signal = stepActions.indexOf(`signal-${direction}`)
      const shoulder = stepActions.indexOf(`shoulder-${direction}`)
      if ((signal >= 0 || shoulder >= 0) && !(mirror >= 0 && signal > mirror && shoulder > signal)) {
        errors.push(`${item.id} must order ${direction} MSS as mirror -> signal -> shoulder`)
      }
    }
  }

  for (const variant of variants) {
    const matches = coverage.get(variant.id) ?? []
    if (matches.length !== 1) errors.push(`${variant.id} must resolve to exactly one guidance plan; found ${matches.length}`)
  }
  return errors
}
