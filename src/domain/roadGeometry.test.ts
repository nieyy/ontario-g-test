import { describe, expect, it } from 'vitest'
import {
  INTERSECTION_DISTANCE_METERS,
  intersectionPhase,
  laneCentre,
  vehiclePose,
  worldToScreen,
} from './roadGeometry'

describe('road world geometry', () => {
  it('moves the camera to the selected physical lane', () => {
    expect(laneCentre(-1)).toBe(-3.6)
    expect(laneCentre(0)).toBe(0)
    expect(laneCentre(1)).toBe(3.6)
  })

  it('moves an intersection from the horizon through and behind the car', () => {
    expect(intersectionPhase(0)).toBe('ahead')
    expect(intersectionPhase(150)).toBe('approaching')
    expect(intersectionPhase(210)).toBe('decision')
    expect(intersectionPhase(228)).toBe('crossing')
    expect(intersectionPhase(260)).toBe('passed')

    const far = worldToScreen({ x: 0, z: INTERSECTION_DISTANCE_METERS }, vehiclePose(0, 0, null, 0, null))
    const near = worldToScreen({ x: 0, z: INTERSECTION_DISTANCE_METERS }, vehiclePose(200, 0, null, 0, null))
    const passed = worldToScreen({ x: 0, z: INTERSECTION_DISTANCE_METERS }, vehiclePose(250, 0, null, 0, null))
    expect(near!.y).toBeGreaterThan(far!.y)
    expect(passed).toBeNull()
  })

  it('follows a quarter-circle into the outgoing road', () => {
    const start = vehiclePose(205, 1, 'right', 0, 205)
    const middle = vehiclePose(205, 1, 'right', 0.5, 205)
    const end = vehiclePose(205, 1, 'right', 1, 205)
    expect(start.heading).toBe(0)
    expect(middle.x).toBeGreaterThan(start.x)
    expect(middle.z).toBeGreaterThan(start.z)
    expect(end.z).toBeCloseTo(INTERSECTION_DISTANCE_METERS)
    expect(end.heading).toBeCloseTo(Math.PI / 2)
  })

  it('keeps a traffic light anchored to one world point as the camera advances', () => {
    const light = { x: 7.2, z: INTERSECTION_DISTANCE_METERS - 7 }
    const far = worldToScreen(light, vehiclePose(80, 0, null, 0, null))
    const near = worldToScreen(light, vehiclePose(200, 0, null, 0, null))
    expect(near!.y).toBeGreaterThan(far!.y)
    expect(near!.scale).toBeGreaterThan(far!.scale)
  })
})
