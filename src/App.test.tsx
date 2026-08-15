import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import App from './App'

afterEach(cleanup)

describe('App', () => {
  it('presents the independent training purpose and centre choice', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: /Make the G-test routine visible/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Choose a test centre' }))
    expect(screen.getByRole('heading', { name: 'Newmarket DriveTest Centre' })).toBeInTheDocument()
    expect(screen.getByText(/320 Harry Walker Parkway S/)).toBeInTheDocument()
    expect(screen.getByText(/not an official, recorded, or predicted test route/i)).toBeInTheDocument()
  })

  it('offers keyboard and safety rules before starting', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Choose a test centre' }))
    fireEvent.click(screen.getByRole('button', { name: 'Select Newmarket' }))
    expect(screen.getByRole('heading', { name: 'Choose how you want to train' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Choose Exam mode' }))
    expect(screen.getByRole('heading', { name: 'Before you drive' })).toBeInTheDocument()
    expect(screen.getByText(/Exam mode can end or continue as practice/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start when ready' })).toBeEnabled()
    expect(screen.getByText(/Road ambience on/i)).toBeInTheDocument()
  })

  it('offers full-route and all six typical Guided Practice scenarios', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Choose a test centre' }))
    fireEvent.click(screen.getByRole('button', { name: 'Select Newmarket' }))
    fireEvent.click(screen.getByRole('button', { name: 'Choose Guided Practice' }))
    expect(screen.getByRole('heading', { name: 'Choose a Guided Practice session' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Start full route/i })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Practice this scene' })).toHaveLength(6)
  })

  it('offers an independent road ambience preference', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(screen.getByRole('checkbox', { name: /Road ambience/i })).toBeChecked()
  })
})
