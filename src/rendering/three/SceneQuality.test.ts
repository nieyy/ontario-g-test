import { describe, expect, it } from 'vitest'
import { resolveSceneQuality } from './SceneQuality'

describe('3D scene quality', () => {
  it('uses conservative mobile and reduced-motion settings', () => {
    expect(resolveSceneQuality({ width: 844, height: 390, devicePixelRatio: 3 }).level).toBe('low')
    expect(resolveSceneQuality({ width: 1440, height: 900, reducedMotion: true }).shadows).toBe(false)
  })

  it('caps desktop DPR and enables the medium budget', () => {
    const quality = resolveSceneQuality({ width: 1440, height: 900, devicePixelRatio: 2, deviceMemory: 8, hardwareConcurrency: 8 })
    expect(quality).toMatchObject({ level: 'medium', dpr: 1, mirrorFps: 10 })
  })
})
