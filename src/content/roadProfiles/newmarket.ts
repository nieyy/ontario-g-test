import { newmarketRoadSources } from './sources'
import type {
  BoundarySegment,
  CentreRoadProfile,
  LaneDefinition,
  LaneOffsetPoint,
  LaneRole,
  Movement,
  RoadSectionDefinition,
  RouteEdge,
  RouteMovement,
  RouteNode,
} from './types'

const authored = ['newmarket-authored-road-grammar']
const contextual = ['drivetest-newmarket-centre', 'town-newmarket-road-context', ...authored]

function boundaries(fromM: number, toM: number, left: BoundarySegment['marking'], right: BoundarySegment['marking']) {
  return {
    leftBoundary: [{ fromM, toM, marking: left }],
    rightBoundary: [{ fromM, toM, marking: right }],
  }
}

function lane(input: {
  id: string
  role: LaneRole
  lengthM: number
  offsetM?: number
  offsetProfile?: LaneOffsetPoint[]
  startsAtM?: number
  endsAtM?: number
  direction?: LaneDefinition['direction']
  movements?: Movement[]
  left?: BoundarySegment['marking']
  right?: BoundarySegment['marking']
  arrows?: LaneDefinition['arrows']
}): LaneDefinition {
  const startsAtM = input.startsAtM ?? 0
  const endsAtM = input.endsAtM ?? input.lengthM
  return {
    id: input.id,
    direction: input.direction ?? 'forward',
    role: input.role,
    widthM: 3.6,
    offsetProfile: input.offsetProfile ?? [
      { sM: startsAtM, centerOffsetM: input.offsetM ?? 0 },
      { sM: endsAtM, centerOffsetM: input.offsetM ?? 0 },
    ],
    startsAtM,
    endsAtM,
    ...boundaries(startsAtM, endsAtM, input.left ?? 'dashed-white', input.right ?? 'dashed-white'),
    arrows: input.arrows ?? [],
    allowedMovements: input.movements ?? ['continue'],
  }
}

function straight(lengthM: number, endX = 0): RoadSectionDefinition['centerline'] {
  return [
    { sM: 0, xM: 0, zM: 0 },
    { sM: lengthM * 0.5, xM: endX * 0.3, zM: lengthM * 0.5 },
    { sM: lengthM, xM: endX, zM: lengthM },
  ]
}

const sections: RoadSectionDefinition[] = [
  {
    id: 'newmarket-parking-exit',
    template: 'parking-exit',
    displayName: 'Newmarket DriveTest departure',
    trainingLabel: 'Authored parking-area departure',
    lengthM: 180,
    speedLimitKph: 20,
    centerline: straight(180, 5),
    lanes: [lane({ id: 'parking-access', role: 'parking-access', lengthM: 180, left: 'curb', right: 'curb' })],
    transitions: [],
    intersection: { atM: 150, control: 'stop-sign', crossRoadWidthM: 8, stopLineBeforeM: 5 },
    sourceRefs: contextual,
    fidelity: 'authored-approximation',
  },
  {
    id: 'harry-walker-local',
    template: 'two-way-local',
    displayName: 'Harry Walker–inspired local road',
    trainingLabel: 'Authored two-way industrial road',
    lengthM: 440,
    speedLimitKph: 50,
    centerline: straight(440, -8),
    lanes: [
      lane({ id: 'local-forward', role: 'through', lengthM: 440, offsetM: 1.8, left: 'single-yellow', right: 'curb' }),
      lane({ id: 'local-opposing', role: 'through', lengthM: 440, offsetM: -1.8, direction: 'opposing', left: 'curb', right: 'single-yellow' }),
    ],
    transitions: [],
    sourceRefs: contextual,
    fidelity: 'authored-approximation',
  },
  {
    id: 'urban-signal-junction',
    template: 'urban-arterial',
    displayName: 'Newmarket urban signal practice',
    trainingLabel: 'Authored signalized junction with a right-turn lane',
    lengthM: 330,
    speedLimitKph: 50,
    centerline: straight(330),
    lanes: [
      lane({ id: 'signal-through', role: 'through', lengthM: 330, offsetM: 1.8, left: 'single-yellow', right: 'dashed-white' }),
      lane({ id: 'signal-right-turn', role: 'right-turn', lengthM: 330, offsetProfile: [{ sM: 0, centerOffsetM: 3.6 }, { sM: 60, centerOffsetM: 5.4 }, { sM: 330, centerOffsetM: 5.4 }], left: 'dashed-white', right: 'curb', movements: ['right'], arrows: [{ atM: 185, movement: 'right' }, { atM: 220, movement: 'right' }] }),
      lane({ id: 'signal-opposing', role: 'through', lengthM: 330, offsetM: -1.8, direction: 'opposing', left: 'curb', right: 'single-yellow' }),
    ],
    transitions: [{ id: 'signal-right-turn-split', atM: 0, taperLengthM: 60, kind: 'split', fromLaneIds: ['signal-through'], toLaneIds: ['signal-through', 'signal-right-turn'] }],
    intersection: { atM: 250, control: 'traffic-signal', crossRoadWidthM: 15, stopLineBeforeM: 7 },
    sourceRefs: authored,
    fidelity: 'authored-approximation',
  },
  {
    id: 'left-turn-pocket',
    template: 'turn-pocket-intersection',
    displayName: 'Newmarket arterial left-turn practice',
    trainingLabel: 'Authored left-turn pocket and signalized junction',
    lengthM: 430,
    speedLimitKph: 50,
    centerline: straight(430, 4),
    lanes: [
      lane({ id: 'pocket-through', role: 'through', lengthM: 430, offsetM: 1.8, left: 'dashed-white', right: 'curb' }),
      lane({
        id: 'pocket-left-turn', role: 'left-turn', lengthM: 430, startsAtM: 110,
        offsetProfile: [{ sM: 110, centerOffsetM: 1.8 }, { sM: 200, centerOffsetM: -1.8 }, { sM: 430, centerOffsetM: -1.8 }],
        left: 'solid-white', right: 'dashed-white', movements: ['left'],
        arrows: [{ atM: 260, movement: 'left' }, { atM: 330, movement: 'left' }],
      }),
      lane({ id: 'pocket-opposing', role: 'through', lengthM: 430, offsetM: -5.4, direction: 'opposing', left: 'curb', right: 'double-yellow' }),
    ],
    transitions: [{ id: 'left-pocket-split', atM: 110, taperLengthM: 90, kind: 'split', fromLaneIds: ['pocket-through'], toLaneIds: ['pocket-through', 'pocket-left-turn'] }],
    intersection: { atM: 380, control: 'traffic-signal', crossRoadWidthM: 18, stopLineBeforeM: 8 },
    sourceRefs: authored,
    fidelity: 'authored-approximation',
  },
  {
    id: 'davis-leslie-arterial',
    template: 'urban-arterial',
    displayName: 'Davis / Leslie–inspired arterial',
    trainingLabel: 'Authored two-lane urban arterial',
    lengthM: 650,
    speedLimitKph: 60,
    centerline: straight(650, -12),
    lanes: [
      lane({ id: 'arterial-left', role: 'through', lengthM: 650, offsetM: 1.8, left: 'double-yellow', right: 'dashed-white' }),
      lane({ id: 'arterial-right', role: 'through', lengthM: 650, offsetM: 5.4, left: 'dashed-white', right: 'curb' }),
      lane({ id: 'arterial-opposing', role: 'through', lengthM: 650, offsetM: -1.8, direction: 'opposing', left: 'curb', right: 'double-yellow' }),
    ],
    transitions: [],
    sourceRefs: contextual,
    fidelity: 'authored-approximation',
  },
  {
    id: 'highway-404-on-ramp',
    template: 'freeway-on-ramp',
    displayName: 'Highway 404–inspired on-ramp',
    trainingLabel: 'Authored curved ramp and acceleration lane',
    lengthM: 560,
    speedLimitKph: 100,
    centerline: [
      { sM: 0, xM: 0, zM: 0 },
      { sM: 180, xM: 28, zM: 170 },
      { sM: 360, xM: 38, zM: 350 },
      { sM: 560, xM: 40, zM: 550 },
    ],
    lanes: [
      lane({ id: 'ramp-mainline', role: 'through', lengthM: 560, offsetM: -1.8, left: 'solid-white', right: 'dashed-white' }),
      lane({ id: 'ramp-merge', role: 'merge', lengthM: 560, endsAtM: 480, offsetProfile: [{ sM: 0, centerOffsetM: 1.8 }, { sM: 380, centerOffsetM: 1.8 }, { sM: 480, centerOffsetM: -1.8 }], left: 'dashed-white', right: 'curb', movements: ['merge'] }),
    ],
    transitions: [{ id: 'ramp-merge-transition', atM: 380, taperLengthM: 100, kind: 'merge', fromLaneIds: ['ramp-merge'], toLaneIds: ['ramp-mainline'] }],
    sourceRefs: authored,
    fidelity: 'authored-approximation',
  },
  {
    id: 'highway-404-mainline',
    template: 'freeway-mainline',
    displayName: 'Highway 404–inspired mainline',
    trainingLabel: 'Authored three-lane divided freeway',
    lengthM: 1100,
    speedLimitKph: 100,
    centerline: straight(1100, 10),
    lanes: [
      lane({ id: 'mainline-left', role: 'through', lengthM: 1100, offsetM: -3.6, left: 'solid-white', right: 'dashed-white' }),
      lane({ id: 'mainline-centre', role: 'through', lengthM: 1100, offsetM: 0, left: 'dashed-white', right: 'dashed-white' }),
      lane({ id: 'mainline-right', role: 'through', lengthM: 1100, offsetM: 3.6, left: 'dashed-white', right: 'solid-white' }),
    ],
    transitions: [],
    sourceRefs: contextual,
    fidelity: 'authored-approximation',
  },
  {
    id: 'highway-404-off-ramp',
    template: 'freeway-off-ramp',
    displayName: 'Highway 404–inspired exit and return',
    trainingLabel: 'Authored exit lane, deceleration ramp and urban return',
    lengthM: 760,
    speedLimitKph: 80,
    centerline: [
      { sM: 0, xM: 0, zM: 0 },
      { sM: 300, xM: 0, zM: 300 },
      { sM: 520, xM: 35, zM: 510 },
      { sM: 760, xM: 70, zM: 745 },
    ],
    lanes: [
      lane({ id: 'exit-left', role: 'through', lengthM: 760, offsetM: -3.6, left: 'solid-white', right: 'dashed-white' }),
      lane({ id: 'exit-centre', role: 'through', lengthM: 760, offsetM: 0, left: 'dashed-white', right: 'dashed-white' }),
      lane({ id: 'exit-right', role: 'through', lengthM: 760, offsetM: 3.6, left: 'dashed-white', right: 'solid-white' }),
      lane({ id: 'exit-ramp', role: 'exit', lengthM: 760, startsAtM: 210, offsetProfile: [{ sM: 210, centerOffsetM: 3.6 }, { sM: 320, centerOffsetM: 7.2 }, { sM: 760, centerOffsetM: 7.2 }], left: 'dashed-white', right: 'curb', movements: ['exit'] }),
    ],
    transitions: [{ id: 'exit-lane-split', atM: 210, taperLengthM: 110, kind: 'split', fromLaneIds: ['exit-right'], toLaneIds: ['exit-right', 'exit-ramp'] }],
    sourceRefs: authored,
    fidelity: 'authored-approximation',
  },
]

const nodes: RouteNode[] = [
  { id: 'start', kind: 'start', label: 'Newmarket DriveTest' },
  { id: 'local', kind: 'junction', label: 'Harry Walker context' },
  { id: 'signal', kind: 'junction', label: 'Urban signal practice' },
  { id: 'pocket', kind: 'junction', label: 'Left-turn pocket' },
  { id: 'arterial', kind: 'junction', label: 'Davis / Leslie context' },
  { id: 'ramp', kind: 'junction', label: 'Highway entrance' },
  { id: 'mainline', kind: 'junction', label: 'Highway mainline' },
  { id: 'exit', kind: 'junction', label: 'Highway exit' },
  { id: 'end', kind: 'end', label: 'Return toward Newmarket' },
]

const edges: RouteEdge[] = [
  { id: 'edge-parking', fromNodeId: 'start', toNodeId: 'local', sectionId: 'newmarket-parking-exit', miniMapPath: [{ x: 12, y: 74 }, { x: 25, y: 70 }] },
  { id: 'edge-local', fromNodeId: 'local', toNodeId: 'signal', sectionId: 'harry-walker-local', miniMapPath: [{ x: 25, y: 70 }, { x: 42, y: 58 }] },
  { id: 'edge-signal', fromNodeId: 'signal', toNodeId: 'pocket', sectionId: 'urban-signal-junction', miniMapPath: [{ x: 42, y: 58 }, { x: 54, y: 45 }] },
  { id: 'edge-pocket', fromNodeId: 'pocket', toNodeId: 'arterial', sectionId: 'left-turn-pocket', miniMapPath: [{ x: 54, y: 45 }, { x: 42, y: 31 }] },
  { id: 'edge-arterial', fromNodeId: 'arterial', toNodeId: 'ramp', sectionId: 'davis-leslie-arterial', miniMapPath: [{ x: 42, y: 31 }, { x: 62, y: 22 }] },
  { id: 'edge-ramp', fromNodeId: 'ramp', toNodeId: 'mainline', sectionId: 'highway-404-on-ramp', miniMapPath: [{ x: 62, y: 22 }, { x: 80, y: 28 }] },
  { id: 'edge-mainline', fromNodeId: 'mainline', toNodeId: 'exit', sectionId: 'highway-404-mainline', miniMapPath: [{ x: 80, y: 28 }, { x: 105, y: 48 }] },
  { id: 'edge-exit', fromNodeId: 'exit', toNodeId: 'end', sectionId: 'highway-404-off-ramp', miniMapPath: [{ x: 105, y: 48 }, { x: 112, y: 70 }] },
]

function movement(id: string, fromEdgeId: string, fromLaneId: string, toEdgeId: string, toLaneId: string, kind: RouteMovement['movement'] = 'continue', headingDeltaDeg = 0): RouteMovement {
  return { id, fromEdgeId, fromLaneId, toEdgeId, toLaneId, movement: kind, headingDeltaDeg, connectorLengthM: 18 }
}

const movements: RouteMovement[] = [
  movement('parking-to-local', 'edge-parking', 'parking-access', 'edge-local', 'local-forward'),
  movement('local-to-signal', 'edge-local', 'local-forward', 'edge-signal', 'signal-through'),
  movement('signal-to-pocket', 'edge-signal', 'signal-through', 'edge-pocket', 'pocket-through'),
  movement('pocket-left-to-arterial', 'edge-pocket', 'pocket-left-turn', 'edge-arterial', 'arterial-left', 'left', -90),
  movement('pocket-through-to-arterial', 'edge-pocket', 'pocket-through', 'edge-arterial', 'arterial-left'),
  movement('arterial-to-ramp', 'edge-arterial', 'arterial-right', 'edge-ramp', 'ramp-merge'),
  movement('ramp-to-mainline', 'edge-ramp', 'ramp-mainline', 'edge-mainline', 'mainline-right'),
  movement('mainline-to-exit', 'edge-mainline', 'mainline-right', 'edge-exit', 'exit-right'),
]

export const newmarketRoadProfile: CentreRoadProfile = {
  id: 'newmarket-road-profile-v1',
  centreId: 'newmarket',
  version: '1.0.0',
  displayName: 'Newmarket-inspired teaching corridor',
  disclaimer: 'Teaching approximation · not an official, recorded, guaranteed or predicted DriveTest route.',
  sourceNotices: [
    'DriveTest and Town of Newmarket sources support public centre and road-name context only.',
    'All route order, lane layouts, signals, ramps, exits, speeds and geometry are hand-authored teaching approximations.',
  ],
  sources: newmarketRoadSources,
  sections,
  routes: [{
    id: 'newmarket-teaching-loop-v1',
    startNodeId: 'start',
    endNodeId: 'end',
    nodes,
    edges,
    movements,
    traversalEdgeIds: edges.map((edge) => edge.id),
  }],
  contentHash: 'newmarket-road-profile-v1-authored-20260816',
}

export const newmarketRouteBindings = {
  'right-on-red': { routeId: 'newmarket-teaching-loop-v1', edgeIds: ['edge-parking', 'edge-local', 'edge-signal'], decisionEdgeId: 'edge-signal' },
  'yellow-light': { routeId: 'newmarket-teaching-loop-v1', edgeIds: ['edge-signal'], decisionEdgeId: 'edge-signal' },
  'multilane-left': { routeId: 'newmarket-teaching-loop-v1', edgeIds: ['edge-pocket'], decisionEdgeId: 'edge-pocket' },
  'freeway-merge': { routeId: 'newmarket-teaching-loop-v1', edgeIds: ['edge-arterial', 'edge-ramp'], decisionEdgeId: 'edge-ramp' },
  'slow-lead': { routeId: 'newmarket-teaching-loop-v1', edgeIds: ['edge-mainline'] },
  'freeway-exit': { routeId: 'newmarket-teaching-loop-v1', edgeIds: ['edge-exit'], decisionEdgeId: 'edge-exit' },
} as const
