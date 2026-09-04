/**
 * Tests for the useNowTick heartbeat hook
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { useNowTick } from '../useNowTick'

function Probe({ intervalMs }: { intervalMs?: number }) {
  const now = useNowTick(intervalMs)
  return <span data-testid="now">{now}</span>
}

describe('useNowTick', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 4, 12, 0, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the current timestamp on first render', () => {
    render(<Probe />)
    expect(screen.getByTestId('now').textContent).toBe(String(Date.now()))
  })

  it('re-renders with a fresh timestamp on each tick', () => {
    render(<Probe intervalMs={15_000} />)
    const initial = screen.getByTestId('now').textContent

    act(() => { vi.advanceTimersByTime(15_000) })
    expect(screen.getByTestId('now').textContent).not.toBe(initial)
    expect(screen.getByTestId('now').textContent).toBe(String(Date.now()))

    act(() => { vi.advanceTimersByTime(15_000) })
    expect(screen.getByTestId('now').textContent).toBe(String(Date.now()))
  })

  it('does not tick before the interval elapses', () => {
    render(<Probe intervalMs={15_000} />)
    const initial = screen.getByTestId('now').textContent

    act(() => { vi.advanceTimersByTime(14_999) })
    expect(screen.getByTestId('now').textContent).toBe(initial)
  })

  it('clears the timer on unmount', () => {
    const { unmount } = render(<Probe intervalMs={15_000} />)
    unmount()

    // Advancing timers after unmount must not throw (no stale setState)
    expect(() => {
      act(() => { vi.advanceTimersByTime(60_000) })
    }).not.toThrow()
  })
})
