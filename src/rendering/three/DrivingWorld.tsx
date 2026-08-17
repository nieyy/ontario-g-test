import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { RenderSnapshot, TrafficActor } from '../../domain/renderSnapshot'
import type { RenderRoadSlice } from '../../domain/roadFrame'
import { ribbonGeometry, stripGeometry } from './RoadGeometry'
import type { SceneQualityConfig } from './SceneQuality'

const asphalt = new THREE.MeshStandardMaterial({ color: '#353a3e', roughness: 0.96, metalness: 0 })
const grass = new THREE.MeshStandardMaterial({ color: '#617d49', roughness: 1 })
const white = new THREE.MeshStandardMaterial({ color: '#f4f0dc', roughness: 0.72 })
const yellow = new THREE.MeshStandardMaterial({ color: '#f6c934', roughness: 0.7 })
const concrete = new THREE.MeshStandardMaterial({ color: '#a9aaa2', roughness: 1 })

function toThree(point: { x: number; z: number }, y = 0): [number, number, number] {
  return [point.x, y, -point.z]
}

function RoadSurface({ slices }: { slices: RenderRoadSlice[] }) {
  const geometry = useMemo(() => ribbonGeometry(slices), [slices])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <mesh geometry={geometry} material={asphalt} receiveShadow />
}

function Roadside({ slices }: { slices: RenderRoadSlice[] }) {
  const geometries = useMemo(() => {
    const left = stripGeometry(slices.map((slice) => slice.leftEdge), 1.4, 0.018)
    const right = stripGeometry(slices.map((slice) => slice.rightEdge), 1.4, 0.018)
    return { left, right }
  }, [slices])
  useEffect(() => () => {
    geometries.left.dispose()
    geometries.right.dispose()
  }, [geometries])
  return <>
    <mesh geometry={geometries.left} material={concrete} receiveShadow />
    <mesh geometry={geometries.right} material={concrete} receiveShadow />
  </>
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
  const decorations = useMemo(() => {
    const buckets = new Map<number, RenderRoadSlice>()
    for (const slice of snapshot.road.slices) {
      const bucket = Math.floor(slice.routeDistanceM / 30)
      const current = buckets.get(bucket)
      const centreM = bucket * 30 + 15
      if (!current || Math.abs(slice.routeDistanceM - centreM) < Math.abs(current.routeDistanceM - centreM)) buckets.set(bucket, slice)
    }
    const limit = quality.level === 'low' ? 9 : 16
    return [...buckets.entries()].slice(0, limit).map(([bucket, slice]) => {
      const side = bucket % 2 ? 1 : -1
      const edge = side > 0 ? slice.rightEdge : slice.leftEdge
      const distance = bucket % 3 === 0 ? 14 : 9
      return { id: bucket, x: edge.x + Math.cos(slice.heading) * side * distance, z: edge.z - Math.sin(slice.heading) * side * distance, side }
    })
  }, [snapshot.road.slices, quality.level])
  return <group>
    <mesh position={[0, -0.12, 0]} receiveShadow><boxGeometry args={[4000, 0.2, 4000]} /><primitive object={grass} attach="material" /></mesh>
    {decorations.map((item) => item.id % 3 === 0
      ? <IndustrialBuilding key={item.id} x={item.x} z={item.z} colour={item.side > 0 ? '#b99b79' : '#a7aca8'} />
      : <LowPolyTree key={item.id} x={item.x} z={item.z} scale={0.8 + (item.id % 4) * 0.12} />)}
  </group>
}

function Car({ actor, snapshot }: { actor: TrafficActor; snapshot: RenderSnapshot }) {
  const group = useRef<THREE.Group>(null)
  const heading = snapshot.camera.heading + actor.heading
  const x = snapshot.camera.x + Math.cos(snapshot.camera.heading) * actor.lateralM + Math.sin(snapshot.camera.heading) * actor.forwardM
  const z = snapshot.camera.z - Math.sin(snapshot.camera.heading) * actor.lateralM + Math.cos(snapshot.camera.heading) * actor.forwardM
  const targetPosition = useMemo(() => new THREE.Vector3(...toThree({ x, z }, 0.5)), [x, z])
  const targetQuaternion = useMemo(() => new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -heading, 0)), [heading])
  useFrame((_, delta) => {
    if (!group.current) return
    const amount = 1 - Math.exp(-delta * 7)
    group.current.position.lerp(targetPosition, amount)
    group.current.quaternion.slerp(targetQuaternion, amount)
  })
  return <group ref={group} position={targetPosition} quaternion={targetQuaternion}>
    <mesh castShadow><boxGeometry args={[1.75, 0.7, 3.9]} /><meshStandardMaterial color={actor.colour} roughness={0.55} metalness={0.1} /></mesh>
    <mesh position={[0, 0.55, -0.25]} castShadow><boxGeometry args={[1.5, 0.65, 1.9]} /><meshStandardMaterial color="#66818e" roughness={0.2} metalness={0.15} /></mesh>
    {[-0.9, 0.9].flatMap((zWheel) => [-0.78, 0.78].map((xWheel) => <mesh key={`${xWheel}-${zWheel}`} position={[xWheel, -0.28, zWheel]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.34, 0.34, 0.2, 12]} /><meshStandardMaterial color="#171a1c" /></mesh>))}
  </group>
}

function Cockpit({ snapshot }: { snapshot: RenderSnapshot }) {
  const group = useRef<THREE.Group>(null)
  const wheel = useRef<THREE.Group>(null)
  const { camera } = useThree()
  useFrame((_, delta) => {
    if (!group.current) return
    group.current.position.copy(camera.position)
    group.current.quaternion.copy(camera.quaternion)
    if (wheel.current) wheel.current.rotation.z = THREE.MathUtils.damp(wheel.current.rotation.z, -THREE.MathUtils.degToRad(snapshot.steeringAngle), 10, delta)
  })
  return <group ref={group}>
    <mesh position={[0, -0.86, -1.18]} rotation={[-0.08, 0, 0]}><boxGeometry args={[4.8, 0.42, 1.5]} /><meshStandardMaterial color="#172128" roughness={0.85} /></mesh>
    <group ref={wheel} position={[0, -0.34, -1.08]} rotation={[-0.18, 0, 0]}>
      <mesh><torusGeometry args={[0.31, 0.047, 10, 32]} /><meshStandardMaterial color="#15191c" roughness={0.75} /></mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.09, 0.09, 0.06, 16]} /><meshStandardMaterial color="#35434c" /></mesh>
      <mesh position={[0, 0.14, 0]}><boxGeometry args={[0.045, 0.27, 0.045]} /><meshStandardMaterial color="#2c3941" roughness={0.78} /></mesh>
      <mesh position={[-0.11, -0.09, 0]} rotation={[0, 0, -0.88]}><boxGeometry args={[0.045, 0.28, 0.045]} /><meshStandardMaterial color="#2c3941" roughness={0.78} /></mesh>
      <mesh position={[0.11, -0.09, 0]} rotation={[0, 0, 0.88]}><boxGeometry args={[0.045, 0.28, 0.045]} /><meshStandardMaterial color="#2c3941" roughness={0.78} /></mesh>
    </group>
  </group>
}

function DrivingCamera({ snapshot }: { snapshot: RenderSnapshot }) {
  const { camera } = useThree()
  const targetPosition = useMemo(() => new THREE.Vector3(snapshot.camera.x, 1.62, -snapshot.camera.z), [snapshot.camera.x, snapshot.camera.z])
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
    <Roadside slices={snapshot.road.slices} />
    <RoadSurface slices={snapshot.road.slices} />
    <RoadMarkings slices={snapshot.road.slices} />
    <CrossRoad snapshot={snapshot} />
    {snapshot.actors.filter((actor) => actor.role !== 'rear').map((actor) => <Car key={actor.id} actor={actor} snapshot={snapshot} />)}
    <Cockpit snapshot={snapshot} />
  </>
}
