import type { CentreProfile, ScenarioType } from './types'

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
