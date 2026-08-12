export type CentreSupportStatus = 'available' | 'planned' | 'retired'

export interface CentreProfile {
  id: string
  name: string
  address: string
  supportStatus: CentreSupportStatus
  checkedAt: string
  roadFeatures: readonly string[]
}

export const centres: readonly CentreProfile[] = [
  {
    id: 'newmarket',
    name: 'Newmarket',
    address: '320 Harry Walker Parkway S, Newmarket, ON L3Y 7B4',
    supportStatus: 'available',
    checkedAt: '2026-08-12',
    roadFeatures: [
      'Commercial and industrial roads',
      'Multi-lane intersections',
      'Highway 404 merging and exiting',
    ],
  },
]
