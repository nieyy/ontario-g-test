import { scenarioLabels } from '../content/data'
import type { ScenarioVariant } from '../content/types'

type Props = {
  route: ScenarioVariant[]
  scenarioIndex: number
  scenarioElapsed: number
}

const schematicPoints = [
  { x: 14, y: 72 },
  { x: 42, y: 72 },
  { x: 42, y: 46 },
  { x: 76, y: 46 },
  { x: 76, y: 20 },
  { x: 112, y: 20 },
]

export function RouteMiniMap({ route, scenarioIndex, scenarioElapsed }: Props) {
  const points = schematicPoints.slice(0, Math.max(1, Math.min(route.length, schematicPoints.length)))
  const currentIndex = Math.min(scenarioIndex, points.length - 1)
  const from = points[currentIndex]
  const to = points[Math.min(currentIndex + 1, points.length - 1)]
  const duration = route[currentIndex]?.durationSeconds ?? 1
  const progress = Math.min(1, Math.max(0, scenarioElapsed / duration))
  const vehicle = {
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress,
  }

  return (
    <div className="route-mini-map" aria-label={`Authored Newmarket practice route. Current scene: ${scenarioLabels[route[currentIndex]?.type] ?? 'practice route'}.`}>
      <div><small>AUTHORED PRACTICE ROUTE</small><span aria-hidden="true">N ↑</span></div>
      <svg viewBox="0 0 126 88" role="img" aria-label="Schematic route map; not an official test route">
        <path className="map-street map-street-a" d="M 4 72 H 122 M 42 84 V 8 M 4 46 H 122 M 76 84 V 8 M 4 20 H 122" />
        <polyline className="map-route" points={points.map((point) => `${point.x},${point.y}`).join(' ')} />
        {points.map((point, index) => <circle key={`${point.x}-${point.y}`} className={index < currentIndex ? 'map-node done' : index === currentIndex ? 'map-node current' : 'map-node'} cx={point.x} cy={point.y} r="3.2" />)}
        <g className="map-vehicle" transform={`translate(${vehicle.x} ${vehicle.y})`}>
          <circle r="5.5" />
          <path d="M 0 -3 L 2.5 2.5 L 0 1.5 L -2.5 2.5 Z" />
        </g>
      </svg>
      <strong>{scenarioLabels[route[currentIndex]?.type] ?? 'Practice route'}</strong>
      <small>Teaching approximation · not an official route</small>
    </div>
  )
}
