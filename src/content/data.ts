import type {
  ActionType,
  CentreProfile,
  Evidence,
  ScenarioType,
  ScenarioVariant,
} from './types'

const checkedOn = '2026-08-12'

const officialCentreEvidence: Evidence = {
  level: 'verified',
  label: 'DriveTest official centre listing',
  sourceUrl: 'https://drivetest.ca/find-a-drivetest-centre/alphabetical_list/',
  checkedOn,
}

const authoredEvidence: Evidence = {
  level: 'authored',
  label: 'Authored teaching scenario informed by Ontario G-test skills; not an official route',
  checkedOn,
}

const variants = (
  type: ScenarioType,
  title: string,
  instruction: string,
  subtitleZh: string,
  environment: 'urban' | 'freeway',
  speedLimitKph: number,
  targetSpeedKph: number,
  requiredActions: ActionType[],
  dangerousWhenMissing: ActionType[],
  extras: Array<Partial<ScenarioVariant>> = [],
): ScenarioVariant[] =>
  [0, 1, 2].map((index) => ({
    id: `${type}-${index + 1}`,
    type,
    title,
    examinerInstruction: instruction,
    subtitleZh,
    environment,
    durationSeconds: 160,
    speedLimitKph,
    targetSpeedKph: Math.max(0, targetSpeedKph + (index - 1) * 4),
    requiredActions,
    dangerousWhenMissing,
    evidence: authoredEvidence,
    ...extras[index],
  }))

export const newmarketCentre: CentreProfile = {
  id: 'newmarket',
  name: 'Newmarket DriveTest Centre',
  address: '320 Harry Walker Parkway S, Newmarket, L3Y 7B4',
  region: 'Central Ontario',
  services: ['G2', 'G'],
  routeStatus: 'playable',
  contentVersion: '1.1.0',
  disclaimer:
    'This independent training tool is not affiliated with DriveTest or the Government of Ontario. Road scenes are authored approximations, not official or predicted test routes.',
  evidence: [officialCentreEvidence, authoredEvidence],
  variants: {
    'right-on-red': variants(
      'right-on-red',
      'Right turn on red',
      'At the intersection, turn right when it is safe.',
      '在路口确认安全后右转。',
      'urban',
      50,
      28,
      ['signal-right', 'mirror-right', 'shoulder-right', 'brake', 'lane-right', 'turn-right'],
      ['brake', 'shoulder-right'],
      [
        { trafficLight: 'red' },
        { trafficLight: 'red', targetSpeedKph: 24 },
        { trafficLight: 'red', targetSpeedKph: 32 },
      ],
    ),
    'yellow-light': variants(
      'yellow-light',
      'Yellow-light decision',
      'Continue straight through the intersection.',
      '直行通过路口。',
      'urban',
      50,
      46,
      ['mirror-right'],
      [],
      [
        { trafficLight: 'yellow', safeStop: true, requiredActions: ['mirror-right', 'brake'] },
        { trafficLight: 'yellow', safeStop: false },
        { trafficLight: 'yellow', safeStop: true, requiredActions: ['mirror-right', 'brake'] },
      ],
    ),
    'multilane-left': variants(
      'multilane-left',
      'Multi-lane left turn',
      'At the traffic lights, turn left.',
      '在信号灯处左转。',
      'urban',
      50,
      36,
      ['signal-left', 'mirror-left', 'shoulder-left', 'lane-left', 'turn-left'],
      ['shoulder-left'],
    ),
    'freeway-merge': variants(
      'freeway-merge',
      'Freeway merge',
      'Enter the freeway and merge when it is safe.',
      '驶入高速公路并在安全时汇入车流。',
      'freeway',
      100,
      94,
      ['signal-left', 'mirror-left', 'shoulder-left', 'accelerate', 'lane-left'],
      ['shoulder-left', 'accelerate'],
      [{ targetSpeedKph: 88 }, { targetSpeedKph: 96 }, { targetSpeedKph: 100 }],
    ),
    'slow-lead': variants(
      'slow-lead',
      'Slow lead vehicle',
      'Continue driving and follow the road.',
      '继续行驶并沿道路前进。',
      'freeway',
      100,
      82,
      ['mirror-left'],
      [],
      [
        { requiredActions: ['mirror-left'] },
        {
          requiredActions: ['signal-left', 'mirror-left', 'shoulder-left', 'lane-left'],
          dangerousWhenMissing: ['shoulder-left'],
        },
        { requiredActions: ['mirror-left'] },
      ],
    ),
    'freeway-exit': variants(
      'freeway-exit',
      'Freeway exit',
      'Take the next exit on the right.',
      '从下一个右侧出口驶出。',
      'freeway',
      100,
      78,
      ['signal-right', 'mirror-right', 'shoulder-right', 'lane-right', 'brake'],
      ['shoulder-right'],
    ),
  },
}

export const centres: CentreProfile[] = [newmarketCentre]

export const scenarioOrder: ScenarioType[] = [
  'right-on-red',
  'yellow-light',
  'multilane-left',
  'freeway-merge',
  'slow-lead',
  'freeway-exit',
]

export const scenarioLabels: Record<ScenarioType, string> = {
  'right-on-red': 'Right on red',
  'yellow-light': 'Yellow-light decision',
  'multilane-left': 'Multi-lane left turn',
  'freeway-merge': 'Freeway merge',
  'slow-lead': 'Slow lead vehicle',
  'freeway-exit': 'Freeway exit',
}
