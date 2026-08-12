import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import App from './App'

afterEach(cleanup)

describe('App', () => {
  it('shows Newmarket as the first supported centre', () => {
    render(<App />)

    expect(
      screen.getByRole('heading', { name: 'Newmarket' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/320 Harry Walker Parkway S/)).toBeInTheDocument()
  })

  it('does not present the unfinished practice as playable', () => {
    render(<App />)

    expect(screen.getByRole('button', { name: 'Start practice' })).toBeDisabled()
  })
})
