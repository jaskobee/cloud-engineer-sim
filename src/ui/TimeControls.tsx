import { useContext, useEffect } from 'react'
import { CLOCK_SPEEDS, type ClockSpeed } from '../engine/index.ts'
import { formatSimTime } from './format.ts'
import { GameStoreContext, useGame } from './gameContext.ts'

/** The sim clock and its controls. Space toggles pause when you aren't typing. */
export function TimeControls() {
  const now = useGame(s => s.world.clock.now)
  const epochMs = useGame(s => s.world.clock.epochMs)
  const speed = useGame(s => s.world.clock.speed)
  const paused = useGame(s => s.world.clock.paused)
  const dispatch = useGame(s => s.dispatch)
  const store = useContext(GameStoreContext)
  const { day, time } = formatSimTime(epochMs, now)

  const setPaused = (value: boolean) => dispatch({ type: 'sim/setPaused', payload: { paused: value } })
  const choose = (value: ClockSpeed) => {
    dispatch({ type: 'sim/setSpeed', payload: { speed: value } })
    if (paused) setPaused(false)
  }

  useEffect(() => {
    if (!store) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return
      const target = e.target instanceof Element ? e.target : null
      if (target?.closest('input, textarea, select, button, [contenteditable="true"]')) return
      e.preventDefault()
      const { world, dispatch: send } = store.getState()
      send({ type: 'sim/setPaused', payload: { paused: !world.clock.paused } })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [store])

  return (
    <div className="time">
      <div className={`clock ${paused ? 'is-paused' : 'is-running'}`} role="timer" aria-label={`Sim time ${day} ${time}, ${paused ? 'paused' : 'running'}`}>
        <span className="clock-led" aria-hidden="true" />
        <span className="clock-day">{day}</span>
        <span className="clock-time">{time}</span>
      </div>
      <div className="speed" role="group" aria-label="Simulation speed">
        <button type="button" className="speed-btn" aria-pressed={paused} onClick={() => setPaused(!paused)} title="Pause (Space)">
          {paused ? 'Resume' : 'Pause'}
        </button>
        {CLOCK_SPEEDS.map(s => (
          <button key={s} type="button" className="speed-btn" aria-pressed={!paused && speed === s} onClick={() => choose(s)}>
            {s}×
          </button>
        ))}
      </div>
    </div>
  )
}
