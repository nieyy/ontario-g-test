import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { RenderSnapshot, TrafficActor } from '../../domain/renderSnapshot'
import type { RenderRoadSlice } from '../../domain/roadFrame'
import type { SceneQualityConfig } from './SceneQuality'

const asphalt = new THREE.MeshStandardMaterial({ color: '#353a3e', roughness: 0.96, metalness: 0 })
const grass = new THREE.MeshStandardMaterial({ color: '#617d49', roughness: 1 })
const white = new THREE.MeshStandardMaterial({ color: '#f4f0dc', roughness: 0.72 })
const yellow = new THREE.MeshStandardMaterial({ color: '#f6c934', roughness: 0.7 })
const concrete = new THREE.MeshStandardMaterial({ color: '#a9aaa2', roughness: 1 })

function toThree(point: { x: number; z: number }, y = 0): [number, number, number] {
  return [point.x, y, -point.z]
}

function ribbonGeometry(slices: RenderRoadSlice[]) {
  const positions: number[] = []
  const indices: number[] = []
  for (const slice of slices) positions.push(...toThree(slice.leftEdge), ...toThree(slice.rightEdge))
  for (let index = 0; index < slices.length - 1; index += 1) {
    const offset = index * 2
    indices.push(offset, offset + 2, offset + 1, offset + 1, offset + 2, offset + 3)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function stripGeometry(points: Array<{ x: number; z: number }>, width: number, y = 0.025) {
  const positions: number[] = []
  const indices: number[] = []
  points.forEach((point, index) => {
    const previous = points[Math.max(0, index - 1)]
    const next = points[Math.min(points.length - 1, index + 1)]
    const dx = next.x - previous.x
    const dz = next.z - previous.z
    const length = Math.hypot(dx, dz) || 1
    const nx = dz / length
    const nz = -dx / length
    positions.push(...toThree({ x: point.x - nx * width / 2, z: point.z - nz * width / 2 }, y))
    positions.push(...toThree({ x: point.x + nx * width / 2, z: point.z + nz * width / 2 }, y))
  })
  for (let index = 0; index < points.length - 1; index += 1) {
    const offset = index * 2
    indices.push(offset, offset + 2, offset + 1, offset + 1, offset + 2, offset + 3)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function RoadSurface({ slices }: { slices: RenderRoadSlice[] }) {
  const geometry = useMemo(() => ribbonGeometry(slices), [slices])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <mesh geometry={geometry} material={asphalt} receiveShadow />
}

function RoadMarkings({ slices }: { slices: RenderRoadSlice[] }) {
  const descriptors = useMemo(() => {
    const results: Array<{ id: string; points: Array<{ x: number; z: number }>; marking: string; width: number }> = []
    const laneIds = new Set(slices.flatMap((slice) => slice.lanes.map((lane) => lane.laneId)))
    for (const laneId of laneIds) {
      for (const side of ['left', 'right'] as const) {
        const samples = slices.flatMap((slice, index) => {
          const lane = slice.lanes.find((candidate) => candidate.laneId === laneId)
          if (!lane) return []
          const marking = side === 'left' ? lane.leftMarking : lane.rightMarking
          if (marking === 'none') return []
          if (marking === 'dashed-white' && Math.floor(slice.routeDistanceM / 8) % 2) return []
          return [{ point: side === 'left' ? lane.leftEdge : lane.rightEdge, marking, index }]
        })
        for (const sample of samples) {
          const next = samples.find((candidate) => candidate.index > sample.index && candidate.marking === sample.marking)
          if (!next) continue
          results.push({ id: `${laneId}-${side}-${sample.index}`, points: [sample.point, next.point], marking: sample.marking, width: sample.marking === 'curb' ? 0.24 : 0.11 })
          if (sample.marking === 'double-yellow') {
            const shift = 0.22
            results.push({ id: `${laneId}-${side}-${sample.index}-double`, points: [
              { x: sample.point.x + shift, z: sample.point.z },
              { x: next.point.x + shift, z: next.point.z },
            ], marking: sample.marking, width: 0.1 })
          }
        }
      }
    }
    return results
  }, [slices])
  const yellowDescriptors = descriptors.filter((descriptor) => descriptor.marking.includes('yellow'))
  const curbDescriptors = descriptors.filter((descriptor) => descriptor.marking === 'curb')
  const whiteDescriptors = descriptors.filter((descriptor) => !descriptor.marking.includes('yellow') && descriptor.marking !== 'curb')
  return <>
    <MergedMarkings descriptors={yellowDescriptors} material={yellow} />
    <MergedMarkings descriptors={whiteDescriptors} material={white} />
    <MergedMarkings descriptors={curbDescriptors} material={concrete} />
  </>
}

function MergedMarkings({ descriptors, material }: { descriptors: Array<{ points: Array<{ x: number; z: number }>; width: number }>; material: THREE.Material }) {
  const geometry = useMemo(() => {
    const parts = descriptors.map((descriptor) => stripGeometry(descriptor.points, descriptor.width))
    const merged = parts.length ? mergeGeometries(parts, false) : new THREE.BufferGeometry()
    parts.forEach((part) => part.dispose())
    return merged
  }, [descriptors])
  useEffect(() => () => geometry.dispose(), [geometry])
  return geometry.getAttribute('position') ? <mesh geometry={geometry} material={material} /> : null
}

function CrossRoad({ snapshot }: { snapshot: RenderSnapshot }) {
  const intersection = snapshot.road.intersection
  if (!intersection) return null
  const rotation = -intersection.heading
  const position = toThree(intersection.centre, 0.005)
  const stop = toThree(intersection.stopLineCentre, 0.035)
  return <group>
    <mesh position={position} rotation={[0, rotation, 0]} receiveShadow>
      <boxGeometry args={[72, 0.05, intersection.crossRoadWidthM]} />
      <primitive object={asphalt} attach="material" />
    </mesh>
    <mesh position={stop} rotation={[0, rotation, 0]}>
      <boxGeometry args={[Math.max(9, intersection.crossRoadWidthM), 0.03, 0.45]} />
      <primitive object={white} attach="material" />
    </mesh>
    {intersection.control === 'traffic-signal' && <TrafficLight snapshot={snapshot} />}
  </group>
}

function TrafficLight({ snapshot }: { snapshot: RenderSnapshot }) {
  const anchor = snapshot.road.intersection!
  const lateral = 7.5
  const x = anchor.centre.x + Math.cos(anchor.heading) * lateral
  const z = anchor.centre.z - Math.sin(anchor.heading) * lateral
  const colour = snapshot.trafficLight
  return <group position={toThree({ x, z })} rotation={[0, -anchor.heading, 0]}>
    <mesh position={[0, 3.4, 0]} castShadow><cylinderGeometry args={[0.11, 0.14, 6.8, 10]} /><meshStandardMaterial color="#6e7477" roughness={0.8} /></mesh>
    <mesh position={[-3.5, 6.65, 0]} castShadow><boxGeometry args={[7, 0.16, 0.16]} /><meshStandardMaterial color="#6e7477" /></mesh>
    <group position={[-6.7, 6.05, 0]}>
      <mesh castShadow><boxGeometry args={[0.65, 1.65, 0.55]} /><meshStandardMaterial color="#d2a529" roughness={0.7} /></mesh>
      {(['red', 'yellow', 'green'] as const).map((light, index) => <mesh key={light} position={[0, 0.52 - index * 0.52, -0.3]}><circleGeometry args={[0.19, 20]} /><meshStandardMaterial color={colour === light ? { red: '#ff3b30', yellow: '#ffd035', green: '#31d061' }[light] : '#343a3d'} emissive={colour === light ? { red: '#b51d16', yellow: '#8e6e00', green: '#12652b' }[light] : '#000000'} /></mesh>)}
    </group>
  </group>
}

function LowPolyTree({ x, z, scale = 1 }: { x: number; z: number; scale?: number }) {
  return <group position={toThree({ x, z })} scale={scale}>
    <mesh position={[0, 1.4, 0]} castShadow><cylinderGeometry args={[0.22, 0.3, 2.8, 7]} /><meshStandardMaterial color="#5d4632" roughness={1} /></mesh>
    <mesh position={[-0.4, 3.25, 0]} castShadow><dodecahedronGeometry args={[1.25, 0]} /><meshStandardMaterial color="#3e7138" roughness={1} /></mesh>
    <mesh position={[0.55, 3.5, -0.2]} castShadow><dodecahedronGeometry args={[1.05, 0]} /><meshStandardMaterial color="#4b8142" roughness={1} /></mesh>
  </group>
}

function IndustrialBuilding({ x, z, colour }: { x: number; z: number; colour: string }) {
  return <group position={toThree({ x, z })}>
    <mesh position={[0, 2.5, 0]} castShadow receiveShadow><boxGeometry args={[12, 5, 8]} /><meshStandardMaterial color={colour} roughness={0.92} /></mesh>
    <mesh position={[0, 5.1, 0]} castShadow><boxGeometry args={[12.3, 0.3, 8.3]} /><meshStandardMaterial color="#4b5357" roughness={0.9} /></mesh>
    {[-3.7, 0, 3.7].map((offset) => <mesh key={offset} position={[offset, 1.65, -4.03]}><boxGeometry args={[2.2, 2.8, 0.08]} /><meshStandardMaterial color="#748c98" roughness={0.45} /></mesh>)}
  </group>
}

function Environment({ snapshot, quality }: { snapshot: RenderSnapshot; quality: SceneQualityConfig }) {
  const camera = snapshot.camera
  const decorations = useMemo(() => Array.from({ length: quality.level === 'low' ? 8 : 14 }, (_, index) => {
    const side = index % 2 ? 1 : -1
    return { id: index, x: camera.x + side * (18 + (index % 3) * 5), z: camera.z + 25 + index * 24, side }
  }), [camera.x, camera.z, quality.level])
  return <group>
    <mesh position={[camera.x, -0.12, -camera.z - 110]} receiveShadow><boxGeometry args={[240, 0.2, 480]} /><primitive object={grass} attach="material" /></mesh>
    {decorations.map((item) => item.id % 3 === 0
      ? <IndustrialBuilding key={item.id} x={item.x} z={item.z} colour={item.side > 0 ? '#b99b79' : '#a7aca8'} />
      : <LowPolyTree key={item.id} x={item.x} z={item.z} scale={0.8 + (item.id % 4) * 0.12} />)}
  </group>
}

function Car({ actor, snapshot }: { actor: TrafficActor; snapshot: RenderSnapshot }) {
  const heading = snapshot.camera.heading + actor.heading
  const x = snapshot.camera.x + Math.cos(snapshot.camera.heading) * actor.lateralM + Math.sin(snapshot.camera.heading) * actor.forwardM
  const z = snapshot.camera.z - Math.sin(snapshot.camera.heading) * actor.lateralM + Math.cos(snapshot.camera.heading) * actor.forwardM
  return <group position={toThree({ x, z }, 0.5)} rotation={[0, -heading, 0]}>
    <mesh castShadow><boxGeometry args={[1.75, 0.7, 3.9]} /><meshStandardMaterial color={actor.colour} roughness={0.55} metalness={0.1} /></mesh>
    <mesh position={[0, 0.55, -0.25]} castShadow><boxGeometry args={[1.5, 0.65, 1.9]} /><meshStandardMaterial color="#66818e" roughness={0.2} metalness={0.15} /></mesh>
    {[-0.9, 0.9].flatMap((zWheel) => [-0.78, 0.78].map((xWheel) => <mesh key={`${xWheel}-${zWheel}`} position={[xWheel, -0.28, zWheel]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.34, 0.34, 0.2, 12]} /><meshStandardMaterial color="#171a1c" /></mesh>))}
  </group>
}

function Cockpit({ snapshot }: { snapshot: RenderSnapshot }) {
  const group = useRef<THREE.Group>(null)
  useFrame(() => {
    if (!group.current) return
    group.current.position.set(snapshot.camera.x, 1.25, -snapshot.camera.z)
    group.current.rotation.y = -snapshot.camera.heading
  })
  return <group ref={group}>
    <mesh position={[0, -0.68, -0.95]} rotation={[-0.08, 0, 0]}><boxGeometry args={[4.8, 0.52, 1.7]} /><meshStandardMaterial color="#172128" roughness={0.85} /></mesh>
    <group position={[0, -0.42, -0.75]} rotation={[Math.PI / 2.1, 0, -THREE.MathUtils.degToRad(snapshot.steeringAngle)]}>
      <mesh><torusGeometry args={[0.43, 0.065, 10, 32]} /><meshStandardMaterial color="#15191c" roughness={0.75} /></mesh>
      <mesh><cylinderGeometry args={[0.12, 0.12, 0.08, 16]} /><meshStandardMaterial color="#35434c" /></mesh>
    </group>
  </group>
}

function DrivingCamera({ snapshot }: { snapshot: RenderSnapshot }) {
  const { camera } = useThree()
  const targetPosition = useMemo(() => new THREE.Vector3(snapshot.camera.x, 1.25, -snapshot.camera.z), [snapshot.camera.x, snapshot.camera.z])
  const targetQuaternion = useMemo(() => new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -snapshot.camera.heading, 0)), [snapshot.camera.heading])
  useFrame((_, delta) => {
    const amount = Math.min(1, delta * 8)
    camera.position.lerp(targetPosition, amount)
    camera.quaternion.slerp(targetQuaternion, amount)
  })
  return null
}

export function DrivingWorld({ snapshot, quality, onMetrics }: { snapshot: RenderSnapshot; quality: SceneQualityConfig; onMetrics: (metrics: { calls: number; triangles: number }) => void }) {
  const { gl } = useThree()
  useFrame(() => onMetrics({ calls: gl.info.render.calls, triangles: gl.info.render.triangles }))
  return <>
    <color attach="background" args={['#92c9ea']} />
    <fog attach="fog" args={['#b8d8e6', 145, quality.viewDistanceM]} />
    <ambientLight intensity={1.15} />
    <directionalLight position={[45, 70, 30]} intensity={2.2} castShadow={quality.shadows} shadow-mapSize-width={quality.shadows ? 512 : 0} shadow-mapSize-height={quality.shadows ? 512 : 0} />
    <hemisphereLight args={['#bfe4ff', '#647653', 0.7]} />
    <DrivingCamera snapshot={snapshot} />
    <Environment snapshot={snapshot} quality={quality} />
    <RoadSurface slices={snapshot.road.slices} />
    <RoadMarkings slices={snapshot.road.slices} />
    <CrossRoad snapshot={snapshot} />
    {snapshot.actors.filter((actor) => actor.role !== 'rear').map((actor) => <Car key={actor.id} actor={actor} snapshot={snapshot} />)}
    <Cockpit snapshot={snapshot} />
  </>
}
