export type SceneQuality = 'low' | 'medium' | 'high'
export type SceneQualityConfig = { level: SceneQuality; dpr: number; shadows: boolean; sceneryDensity: number; mirrorFps: number; viewDistanceM: number; antialias: boolean }
export type CapabilitySample = { width: number; height: number; devicePixelRatio?: number; deviceMemory?: number; hardwareConcurrency?: number; reducedMotion?: boolean }

export function resolveSceneQuality(sample: CapabilitySample): SceneQualityConfig {
  const mobile = sample.height < 500 || sample.width < 900
  const constrained = (sample.deviceMemory !== undefined && sample.deviceMemory <= 4) || (sample.hardwareConcurrency !== undefined && sample.hardwareConcurrency <= 4)
  if (mobile || constrained || sample.reducedMotion) return { level: 'low', dpr: Math.min(1, sample.devicePixelRatio ?? 1), shadows: false, sceneryDensity: 0.4, mirrorFps: 0, viewDistanceM: 260, antialias: false }
  return { level: 'medium', dpr: 1, shadows: true, sceneryDensity: 0.7, mirrorFps: 10, viewDistanceM: 360, antialias: true }
}
