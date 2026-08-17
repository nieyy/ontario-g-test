import { Canvas } from '@react-three/fiber'
import { useEffect, useMemo, useState } from 'react'
import type { ActionType, ScenarioVariant } from '../content/types'
import { buildRenderSnapshot } from '../domain/renderSnapshot'
import type { EngineState } from '../domain/engine'
import { activeForwardLanes, getRoadFacts, laneEffectiveWidth } from '../domain/roadModel'
import { DrivingWorld } from '../rendering/three/DrivingWorld'
import { resolveSceneQuality } from '../rendering/three/SceneQuality'

type Props = { engine: EngineState; scenario: ScenarioVariant; recentAction: ActionType | null; reducedMotion: boolean; onRendererBlocked?: () => void }

function webgl2Available() {
  try {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('webgl2')
    context?.getExtension('WEBGL_lose_context')?.loseContext()
    return Boolean(context)
  } catch {
    return false
  }
}

export function ThreeRoadScene({ engine, scenario, recentAction, reducedMotion, onRendererBlocked }: Props) {
  const [rendererKey, setRendererKey] = useState(0)
  const [available, setAvailable] = useState(() => webgl2Available())
  const [ready, setReady] = useState(false)
  const [contextLost, setContextLost] = useState(false)
  const [metrics, setMetrics] = useState({ calls: 0, triangles: 0 })
  const [lastMetricAt, setLastMetricAt] = useState(0)
  const snapshot = useMemo(() => buildRenderSnapshot({ engine, scenario, recentAction }), [engine, recentAction, scenario])
  const quality = useMemo(() => resolveSceneQuality({
    width: window.innerWidth,
    height: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
    hardwareConcurrency: navigator.hardwareConcurrency,
    reducedMotion,
  }), [reducedMotion])
  const facts = getRoadFacts(engine.roadPosition)
  const forwardLanes = activeForwardLanes(facts.section, engine.roadPosition.sMeters)
  const opposing = facts.section.lanes.filter((lane) => lane.direction === 'opposing' && laneEffectiveWidth(facts.section, lane, engine.roadPosition.sMeters) > 0.08).length
  const feedback = recentAction?.startsWith('mirror') ? `${recentAction.includes('left') ? 'Left' : 'Right'} mirror checked`
    : recentAction?.startsWith('shoulder') ? `${recentAction.includes('left') ? 'Left' : 'Right'} shoulder checked`
      : recentAction?.startsWith('signal') ? `${recentAction.includes('left') ? 'Left' : 'Right'} signal ${engine.signal ? 'on' : 'off'}`
        : recentAction === 'lane-left' ? `Changing one lane left — target ${facts.laneRole.replace('-', ' ')} lane`
          : recentAction === 'lane-right' ? `Changing one lane right — target ${facts.laneRole.replace('-', ' ')} lane`
            : recentAction === 'turn-left' ? 'Turning left through the intersection'
              : recentAction === 'turn-right' ? 'Turning right through the intersection' : null

  useEffect(() => {
    if (!available) onRendererBlocked?.()
  }, [available, onRendererBlocked])

  const retry = () => {
    const next = webgl2Available()
    setAvailable(next)
    setContextLost(false)
    setReady(false)
    if (next) setRendererKey((value) => value + 1)
  }

  if (!available) return <div className="road-frame renderer-blocked" data-testid="road-world" data-renderer="three" data-scene-ready="false" role="alert"><section><strong>3D driving view is unavailable</strong><p>This practice requires a browser and device with WebGL 2. Try current Chrome, Safari, or Edge with hardware acceleration enabled.</p><button className="primary" onClick={retry}>Retry 3D check</button></section></div>

  const laneLayout = opposing ? `Two-way · ${forwardLanes.length} your direction + ${opposing} opposing` : `${forwardLanes.length} ${forwardLanes.length === 1 ? 'lane' : 'lanes'} · one direction`
  const stageLabel = snapshot.intersectionPhase === 'none' ? null : snapshot.intersectionPhase === 'ahead' ? 'Intersection ahead' : snapshot.intersectionPhase === 'approaching' ? 'Intersection approaching' : snapshot.intersectionPhase === 'decision' ? 'Decision zone' : snapshot.intersectionPhase === 'crossing' ? 'Crossing intersection' : 'Intersection passed'
  const updateMetrics = (next: { calls: number; triangles: number }) => {
    const now = performance.now()
    if (now - lastMetricAt < 1000) return
    setLastMetricAt(now)
    setMetrics(next)
  }
  return <div className="road-frame three-road-frame" data-testid="road-world" data-renderer="three" data-scene-ready={String(ready)} data-quality={quality.level} data-road-section={engine.roadPosition.sectionId} data-lane-id={engine.roadPosition.laneId} data-lane-offset={engine.laneOffsetM.toFixed(2)} data-camera-x={snapshot.camera.x.toFixed(2)} data-camera-z={snapshot.camera.z.toFixed(2)} data-camera-heading={snapshot.camera.heading.toFixed(3)} data-road-ahead-m={snapshot.road.slices.at(-1)?.routeDistanceM.toFixed(1)} data-steering-angle={snapshot.steeringAngle.toFixed(1)} data-intersection-phase={snapshot.intersectionPhase} data-traffic-light-visible={String(snapshot.trafficLightVisible)} data-draw-calls={metrics.calls} data-triangles={metrics.triangles} data-mirror-draw-calls="0">
    <Canvas key={rendererKey} className="road-scene three-road-scene" data-testid="driving-webgl-container" role="img" aria-label={`Low-poly 3D ${scenario.environment} driving scene. ${snapshot.road.roadSummary} Current speed ${Math.round(engine.speedKph)} kilometres per hour.`} camera={{ fov: window.innerHeight < 500 ? 74 : 68, near: 0.18, far: 440 }} dpr={quality.dpr} shadows={quality.shadows} gl={{ antialias: quality.antialias, powerPreference: 'high-performance' }} onCreated={({ gl }) => {
      const canvas = gl.domElement
      canvas.dataset.testid = 'driving-webgl'
      canvas.setAttribute('role', 'img')
      canvas.setAttribute('aria-label', `Low-poly 3D ${scenario.environment} driving scene`)
      const lost = (event: Event) => { event.preventDefault(); setContextLost(true); setReady(false); onRendererBlocked?.() }
      const restored = () => { setContextLost(false); setReady(true) }
      canvas.addEventListener('webglcontextlost', lost)
      canvas.addEventListener('webglcontextrestored', restored)
      gl.setPixelRatio(quality.dpr)
      setReady(true)
    }}>
      <DrivingWorld snapshot={snapshot} quality={quality} onMetrics={updateMetrics} />
    </Canvas>
    {!ready && !contextLost && <div className="renderer-status" aria-live="polite">Preparing the 3D driving world…</div>}
    {contextLost && <div className="renderer-status renderer-error" role="alert"><strong>3D context paused</strong><span>Your drive is preserved. Restore graphics or retry.</span><button onClick={retry}>Retry renderer</button></div>}
    <div className={`mirror mirror-left ${recentAction === 'mirror-left' ? 'mirror-checked' : ''}`} aria-hidden="true"><b>LEFT MIRROR</b><span /></div>
    <div className={`mirror mirror-right ${recentAction === 'mirror-right' ? 'mirror-checked' : ''}`} aria-hidden="true"><b>RIGHT MIRROR</b><span /></div>
    <div className="lane-indicator" aria-label="Current lane" aria-live="polite"><small className="road-layout-label">{laneLayout}</small>{forwardLanes.map((lane) => <span key={lane.id} className={lane.id === engine.roadPosition.laneId ? 'current' : ''}><i aria-hidden="true">▲</i>{lane.role.replace('-', ' ')}</span>)}</div>
    {stageLabel && snapshot.intersectionPhase !== 'passed' && <div className={`scene-event ${snapshot.intersectionPhase === 'decision' || snapshot.intersectionPhase === 'crossing' ? 'decision' : ''}`} aria-live="polite"><strong>{stageLabel}</strong><span>{snapshot.intersectionPhase === 'crossing' ? 'The intersection is passing under the car' : snapshot.intersectionPhase === 'decision' ? 'Correct lane · slow down · turn' : 'Watch the signal and road markings'}</span></div>}
    {feedback && <div className="action-feedback" role="status">{feedback}</div>}
  </div>
}
