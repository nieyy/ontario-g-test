import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { newmarketCentre } from '../content/data'
import { RouteMiniMap } from './RouteMiniMap'

describe('RouteMiniMap', () => {
  it('labels the map as an authored approximation', () => {
    const route = [newmarketCentre.variants['right-on-red'][0], newmarketCentre.variants['freeway-merge'][0]]
    render(<RouteMiniMap route={route} scenarioIndex={0} scenarioElapsed={40} />)
    expect(screen.getByRole('img', { name: /not an official test route/i })).toBeInTheDocument()
    expect(screen.getByText(/Teaching approximation/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Current scene: Right on red/i)).toBeInTheDocument()
  })
})
