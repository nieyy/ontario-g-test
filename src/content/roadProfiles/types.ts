export type SourceKind = 'verified-context' | 'authored-approximation'

export type RoadSectionTemplate =
  | 'parking-exit'
  | 'two-way-local'
  | 'urban-arterial'
  | 'turn-pocket-intersection'
  | 'freeway-on-ramp'
  | 'freeway-mainline'
  | 'freeway-off-ramp'

export type LaneRole = 'through' | 'left-turn' | 'right-turn' | 'merge' | 'exit' | 'parking-access'
export type Movement = 'continue' | 'left' | 'right' | 'merge' | 'exit'
export type LaneBoundaryMarking = 'none' | 'dashed-white' | 'solid-white' | 'single-yellow' | 'double-yellow' | 'curb'

export type BoundarySegment = { fromM: number; toM: number; marking: LaneBoundaryMarking }
export type LaneArrow = { atM: number; movement: 'straight' | 'left' | 'right' }
export type CenterlinePoint = { sM: number; xM: number; zM: number }
export type LaneOffsetPoint = { sM: number; centerOffsetM: number }

export type LaneDefinition = {
  id: string
  direction: 'forward' | 'opposing'
  role: LaneRole
  widthM: number
  offsetProfile: LaneOffsetPoint[]
  startsAtM: number
  endsAtM: number
  leftBoundary: BoundarySegment[]
  rightBoundary: BoundarySegment[]
  arrows: LaneArrow[]
  allowedMovements: Movement[]
}

export type LaneTransition = {
  id: string
  atM: number
  taperLengthM: number
  kind: 'split' | 'merge'
  fromLaneIds: string[]
  toLaneIds: string[]
}

export type IntersectionDefinition = {
  atM: number
  control: 'traffic-signal' | 'stop-sign' | 'uncontrolled'
  crossRoadWidthM: number
  stopLineBeforeM: number
}

export type RoadSourceRecord = {
  id: string
  kind: SourceKind
  sourceUrl?: string
  observedAt: string
  supports: string[]
  notes: string
}

export type RoadSectionDefinition = {
  id: string
  template: RoadSectionTemplate
  displayName: string
  trainingLabel: string
  lengthM: number
  speedLimitKph: number
  centerline: CenterlinePoint[]
  lanes: LaneDefinition[]
  transitions: LaneTransition[]
  intersection?: IntersectionDefinition
  sourceRefs: string[]
  fidelity: 'authored-approximation'
}

export type RouteNode = { id: string; kind: 'start' | 'junction' | 'end'; label: string }
export type RouteEdge = {
  id: string
  fromNodeId: string
  toNodeId: string
  sectionId: string
  miniMapPath: Array<{ x: number; y: number }>
}

export type RouteMovement = {
  id: string
  fromEdgeId: string
  fromLaneId: string
  movement: Movement
  toEdgeId: string
  toLaneId: string
  headingDeltaDeg: number
  connectorLengthM: number
}

export type RouteGraph = {
  id: string
  startNodeId: string
  endNodeId: string
  nodes: RouteNode[]
  edges: RouteEdge[]
  movements: RouteMovement[]
  traversalEdgeIds: string[]
}

export type CentreRoadProfile = {
  id: string
  centreId: 'newmarket'
  version: '1.0.0'
  displayName: string
  disclaimer: string
  sourceNotices: string[]
  sources: RoadSourceRecord[]
  sections: RoadSectionDefinition[]
  routes: RouteGraph[]
  contentHash: string
}

export type RoadPosition = {
  routeId: string
  edgeId: string
  sectionId: string
  sMeters: number
  laneId: string
}

export type RouteBinding = {
  routeId: string
  edgeIds: readonly string[]
  decisionEdgeId?: string
}
