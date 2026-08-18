import { describe, expect, it } from 'vitest'
import { buildRoadFrame, type RenderRoadSlice } from '../../domain/roadFrame'
import { buildEnvironmentDecorations } from './EnvironmentDecorations'
import { buildFreewayFurnitureAnchors, buildGuardRailPosts, buildOverheadGantryLayout } from './FreewayFurnitureModel'
import { laneRibbonGeometry, ribbonGeometry, stripGeometry } from './RoadGeometry'

const slice = (z: number): RenderRoadSlice => ({
  edgeId: 'test-edge',
  sM: z,
  routeDistanceM: z,
  centre: { x: 0, z },
  heading: 0,
  lanes: [],
  leftEdge: { x: -3, z },
  rightEdge: { x: 3, z },
})

describe('Three.js road geometry', () => {
  it('faces road and roadside triangles upward for the driver camera', () => {
    const road = ribbonGeometry([slice(0), slice(10)])
    const roadside = stripGeometry([{ x: -4, z: 0 }, { x: -4, z: 10 }], 1.4)
    const roadNormal = road.getAttribute('normal')
    const roadsideNormal = roadside.getAttribute('normal')

    expect(roadNormal.getY(0)).toBeGreaterThan(0)
    expect(roadsideNormal.getY(0)).toBeGreaterThan(0)
    road.dispose()
    roadside.dispose()
  })

  it('keeps separated ramp and freeway surfaces as independent asphalt ribbons', () => {
    const withLanes = (z: number): RenderRoadSlice => ({
      ...slice(z),
      lanes: [
        { laneId: 'mainline', role: 'through', direction: 'forward', centre: { x: 0, z }, leftEdge: { x: -1.8, z }, rightEdge: { x: 1.8, z }, widthM: 3.6, leftMarking: 'solid-white', rightMarking: 'solid-white' },
        { laneId: 'ramp', role: 'merge', direction: 'forward', centre: { x: 9, z }, leftEdge: { x: 7.2, z }, rightEdge: { x: 10.8, z }, widthM: 3.6, leftMarking: 'solid-white', rightMarking: 'solid-white' },
      ],
    })
    const road = laneRibbonGeometry([withLanes(0), withLanes(10)])
    const index = road.getIndex()!

    expect(index.count).toBe(12)
    for (let triangle = 0; triangle < index.count; triangle += 3) {
      const laneVertices = [index.getX(triangle), index.getX(triangle + 1), index.getX(triangle + 2)]
      expect(laneVertices.every((vertex) => vertex < 4) || laneVertices.every((vertex) => vertex >= 4)).toBe(true)
    }
    road.dispose()
  })

  it('keeps roadside objects anchored to the road section instead of recycling them relative to the car', () => {
    const position = { routeId: 'newmarket-teaching-loop-v1', edgeId: 'edge-local', sectionId: 'harry-walker-local', laneId: 'local-forward' }
    const first = buildEnvironmentDecorations(buildRoadFrame({ position: { ...position, sMeters: 80 } }).slices, 'medium')
    const advanced = buildEnvironmentDecorations(buildRoadFrame({ position: { ...position, sMeters: 88 } }).slices, 'medium')
    const sharedIds = first.map((item) => item.id).filter((id) => advanced.some((item) => item.id === id))

    expect(sharedIds.length).toBeGreaterThan(0)
    for (const id of sharedIds) {
      const before = first.find((item) => item.id === id)!
      const after = advanced.find((item) => item.id === id)!
      expect(after.x).toBe(before.x)
      expect(after.z).toBe(before.z)
      expect(after.kind).toBe(before.kind)
    }
  })

  it('keeps freeway signs and rail posts at fixed edge coordinates', () => {
    const position = { routeId: 'newmarket-teaching-loop-v1', edgeId: 'edge-exit', sectionId: 'highway-404-off-ramp', laneId: 'exit-ramp' }
    const first = buildRoadFrame({ position: { ...position, sMeters: 0 }, edgeIds: ['edge-exit'], viewDistanceM: 360 }).slices
    const advanced = buildRoadFrame({ position: { ...position, sMeters: 40 }, edgeIds: ['edge-exit'], viewDistanceM: 360 }).slices
    const firstAnchors = buildFreewayFurnitureAnchors(first)
    const advancedAnchors = buildFreewayFurnitureAnchors(advanced)

    expect(firstAnchors.map((anchor) => anchor.id)).toEqual(expect.arrayContaining(['edge-exit-warning-115', 'edge-exit-overhead-180']))
    expect(advancedAnchors.map((anchor) => anchor.id)).toEqual(expect.arrayContaining(['edge-exit-warning-115', 'edge-exit-overhead-180']))
    expect(advancedAnchors.find((anchor) => anchor.id === 'edge-exit-overhead-180')!.slice.sM)
      .toBe(firstAnchors.find((anchor) => anchor.id === 'edge-exit-overhead-180')!.slice.sM)
    expect(buildGuardRailPosts(first).every((roadSlice) => Math.abs(roadSlice.sM / 32 - Math.round(roadSlice.sM / 32)) < 0.08)).toBe(true)
  })

  it('places overhead gantry supports beyond the road edges with safe clearance', () => {
    const roadSlice = { ...slice(180), leftEdge: { x: -7.2, z: 180 }, rightEdge: { x: 7.2, z: 180 } }
    const gantry = buildOverheadGantryLayout(roadSlice)

    expect(gantry.supportOffsetM).toBeGreaterThan(gantry.roadWidthM / 2 + 2)
    expect(gantry.spanM).toBeGreaterThan(gantry.roadWidthM)
    expect(gantry.panelCentreYM - gantry.panelHeightM / 2).toBeGreaterThanOrEqual(5.5)
    expect(gantry.centre).toEqual({ x: 0, z: 180 })
  })
})
