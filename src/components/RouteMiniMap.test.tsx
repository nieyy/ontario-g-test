import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { newmarketCentre } from '../content/data'
import { RouteMiniMap } from './RouteMiniMap'

describe('RouteMiniMap', () => {
  it('labels the map as an authored approximation', () => {
    const route = [newmarketCentre.variants['right-on-red'][0], newmarketCentre.variants['freeway-merge'][0]]
    render(<RouteMiniMap route={route} scenarioIndex={0} scenarioElapsed={40} />)
    expect(screen.getAllByRole('img', { name: /not an official test route/i }).at(-1)).toBeInTheDocument()
    expect(screen.getByText(/Teaching approximation/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Current scene: Right on red/i)).toBeInTheDocument()
  })

  it('renders the RoadProfile route and current section when enabled', () => {
    const route = [newmarketCentre.variants['slow-lead'][0]]
    const { rerender } = render(<RouteMiniMap route={route} scenarioIndex={0} scenarioElapsed={20} roadPosition={{ routeId: 'newmarket-teaching-loop-v1', edgeId: 'edge-mainline', sectionId: 'highway-404-mainline', sMeters: 0, laneId: 'mainline-centre' }} />)
    expect(screen.getByLabelText(/Newmarket-inspired teaching route/i)).toHaveTextContent('Authored three-lane divided freeway')
    expect(screen.getAllByRole('img', { name: /not an official test route/i }).at(-1)).toBeInTheDocument()
    const startX = screen.getByTestId('route-mini-map').getAttribute('data-map-vehicle-x')
    rerender(<RouteMiniMap route={route} scenarioIndex={0} scenarioElapsed={20} roadPosition={{ routeId: 'newmarket-teaching-loop-v1', edgeId: 'edge-mainline', sectionId: 'highway-404-mainline', sMeters: 900, laneId: 'mainline-centre' }} />)
    expect(screen.getByTestId('route-mini-map')).toHaveAttribute('data-map-scope', 'edge-mainline')
    expect(screen.getByTestId('route-mini-map').getAttribute('data-map-vehicle-x')).not.toBe(startX)
  })
})
