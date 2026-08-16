export type FeatureFlagEnvironment = {
  VITE_NEWMARKET_ROAD_PROFILE_ENABLED?: string
}

export function readNewmarketRoadProfileFlag(environment: FeatureFlagEnvironment): boolean {
  return environment.VITE_NEWMARKET_ROAD_PROFILE_ENABLED === 'true'
}

export const NEWMARKET_ROAD_PROFILE_ENABLED = readNewmarketRoadProfileFlag({
  VITE_NEWMARKET_ROAD_PROFILE_ENABLED: import.meta.env.VITE_NEWMARKET_ROAD_PROFILE_ENABLED,
})
