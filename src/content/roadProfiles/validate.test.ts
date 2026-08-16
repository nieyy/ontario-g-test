import { describe, expect, it } from 'vitest'
import { newmarketRoadProfile } from './newmarket'
import type { CentreRoadProfile } from './types'
import { validateRoadProfile } from './validate'

const copy = () => structuredClone(newmarketRoadProfile) as CentreRoadProfile
const has = (profile: CentreRoadProfile, code: string) => validateRoadProfile(profile).some((error) => error.includes(code))

describe('Newmarket road profile validator', () => {
  it('accepts the locked authored profile', () => {
    expect(validateRoadProfile(newmarketRoadProfile)).toEqual([])
  })

  it.each([
    ['duplicate IDs', (profile: CentreRoadProfile) => { profile.sections[1].id = profile.sections[0].id }, 'duplicate-section'],
    ['disconnected traversal', (profile: CentreRoadProfile) => { profile.routes[0].edges[1].fromNodeId = 'signal' }, 'traversal-connectivity'],
    ['broken minimap', (profile: CentreRoadProfile) => { profile.routes[0].edges[1].miniMapPath[0].x += 4 }, 'minimap-connectivity'],
    ['bad centerline', (profile: CentreRoadProfile) => { profile.sections[0].centerline[1].sM = 0 }, 'centerline-order'],
    ['overlapping lanes', (profile: CentreRoadProfile) => { profile.sections[1].lanes[1].offsetProfile.forEach((point) => { point.centerOffsetM = 1.8 }) }, 'lane-overlap'],
    ['boundary gap', (profile: CentreRoadProfile) => { profile.sections[0].lanes[0].leftBoundary[0].fromM = 4 }, 'boundary-coverage'],
    ['opposing transition', (profile: CentreRoadProfile) => { profile.sections[3].transitions[0].toLaneIds.push('pocket-opposing') }, 'transition-direction'],
    ['bad taper', (profile: CentreRoadProfile) => { profile.sections[3].transitions[0].taperLengthM = 999 }, 'transition-range'],
    ['missing movement lane', (profile: CentreRoadProfile) => { profile.routes[0].movements[0].toLaneId = 'missing' }, 'movement-reference'],
    ['missing intersection', (profile: CentreRoadProfile) => { delete profile.sections[3].intersection }, 'movement-intersection'],
    ['wrong arrow', (profile: CentreRoadProfile) => { profile.sections[3].lanes[1].arrows[0].movement = 'right' }, 'arrow-movement'],
    ['missing source', (profile: CentreRoadProfile) => { profile.sections[0].sourceRefs = ['missing'] }, 'source-reference'],
    ['verified geometry', (profile: CentreRoadProfile) => { profile.sections[0].fidelity = 'verified-context' as never }, 'fidelity'],
  ])('rejects %s', (_label, mutate, code) => {
    const profile = copy()
    mutate(profile)
    expect(has(profile, code)).toBe(true)
  })
})
