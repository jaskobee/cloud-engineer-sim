import { useEffect, useId, useRef, useState } from 'react'
import { azure, type AvailabilityResult } from '../engine/index.ts'
import { formatSimTime } from './format.ts'
import { useGame } from './gameContext.ts'

/**
 * Availability (MON-21): one row per test location, one column per test round over the last hour,
 * then the newest results. The grid is a real table, so it reads the same without colour or sight.
 */

const HOUR = 3_600_000

export function AvailabilityPanel() {
  const resources = useGame(s => s.world.tenant.resources)
  const selectedId = useGame(s => s.session.ui.selectedId)
  const tests = Object.values(resources).filter(r => r.type.toLowerCase() === azure.WEBTEST_TYPE.toLowerCase()).sort((a, b) => a.name.localeCompare(b.name))
  const [chosen, setChosen] = useState('')
  const fieldId = useId()
  const test = tests.find(t => t.id === chosen) ?? tests.find(t => selectedId !== null && azure.armKey(t.id) === azure.armKey(selectedId)) ?? tests[0]

  if (!test) {
    return (
      <p className="empty">
        Availability tests send a request to your app from several Azure locations and record whether it answered. Create Application Insights and an availability test first.
      </p>
    )
  }
  return (
    <div className="availability">
      <div className="metrics-filters">
        <div className="field nw-pick">
          <label htmlFor={fieldId}>Availability test</label>
          <select id={fieldId} className="input" value={test.id} onChange={e => setChosen(e.target.value)}>
            {tests.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <TestSummary testId={test.id} />
      </div>
      <Results testId={test.id} />
    </div>
  )
}

function useResults(testId: string): AvailabilityResult[] {
  const buffer = useGame(s => s.world.telemetry.availability)
  return buffer.items.filter(r => azure.sameName(r.webTestId, testId))
}

function TestSummary({ testId }: { testId: string }) {
  const test = useGame(s => s.world.tenant.resources[azure.armKey(testId)])
  const now = useGame(s => s.world.clock.now)
  const results = useResults(testId).filter(r => r.TimeGenerated > now - HOUR)
  const percent = azure.availabilityPercent(results)
  const view = test ? azure.webTestView(test) : null
  return (
    <div className="availability-summary">
      <p className="availability-stat">
        <span className="availability-value">{percent === null ? 'No results' : `${percent.toFixed(percent % 1 === 0 ? 0 : 1)} %`}</span>
        <span className="availability-label">Availability, last hour ({results.length} runs)</span>
      </p>
      {view && <p className="hint mono">{view.enabled ? 'GET' : 'Disabled ·'} {view.url}</p>}
    </div>
  )
}

function Results({ testId }: { testId: string }) {
  const test = useGame(s => s.world.tenant.resources[azure.armKey(testId)])
  const now = useGame(s => s.world.clock.now)
  const epochMs = useGame(s => s.world.clock.epochMs)
  const results = useResults(testId)
  // Start scrolled to the newest round on narrow screens.
  const wrap = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (wrap.current) wrap.current.scrollLeft = wrap.current.scrollWidth
  }, [testId])
  if (!test) return null
  const view = azure.webTestView(test)
  const time = (t: number) => formatSimTime(epochMs, t).time.slice(0, 5)
  const recent = results.filter(r => r.TimeGenerated > now - HOUR)
  if (recent.length === 0) {
    return <p className="empty">No results yet. Each location runs the test every {view.frequencyMs / 60_000} minutes; the first results arrive within a few sim minutes.</p>
  }

  // One column per test round (Frequency) in the last hour, oldest first.
  const rounds = Math.max(1, Math.round(HOUR / view.frequencyMs))
  const roundOf = (t: number) => Math.floor(t / view.frequencyMs)
  const lastRound = roundOf(now)
  const columns = Array.from({ length: rounds }, (_, i) => lastRound - rounds + 1 + i)
  const names = view.locations.map(azure.testLocationName)
  const cell = (location: string, round: number) => recent.filter(r => r.Location === location && roundOf(r.TimeGenerated) === round).at(-1)

  return (
    <>
      <div className="availability-grid-wrap" ref={wrap}>
        <table className="availability-grid">
          <caption className="visually-hidden">Test results by location, one column per {view.frequencyMs / 60_000}-minute round</caption>
          <thead>
            <tr>
              <th scope="col">Location</th>
              {columns.map(c => <th key={c} scope="col" className="mono">{time(c * view.frequencyMs)}</th>)}
            </tr>
          </thead>
          <tbody>
            {names.map(name => (
              <tr key={name}>
                <th scope="row">{name}</th>
                {columns.map(c => {
                  const r = cell(name, c)
                  const label = r ? `${r.Success ? 'Passed' : 'Failed'} at ${time(r.TimeGenerated)}: ${r.Message}` : 'No run'
                  return (
                    <td key={c} className={`run ${r ? (r.Success ? 'run-pass' : 'run-fail') : 'run-none'}`} title={label}>
                      <span aria-hidden="true">{r ? (r.Success ? '✓' : '✕') : '·'}</span>
                      <span className="visually-hidden">{label}</span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3 className="rules-title">Newest results</h3>
      <table className="log">
        <thead>
          <tr><th scope="col">Time</th><th scope="col">Location</th><th scope="col">Result</th><th scope="col">Duration</th><th scope="col">Message</th></tr>
        </thead>
        <tbody>
          {recent.slice(-12).reverse().map(r => (
            <tr key={`${r.TimeGenerated}-${r.Location}`}>
              <td className="mono">{formatSimTime(epochMs, r.TimeGenerated).time}</td>
              <td>{r.Location}</td>
              <td><span className={`status status-${r.Success ? 'succeeded' : 'failed'}`}>{r.Success ? 'Passed' : 'Failed'}</span></td>
              <td className="mono">{r.DurationMs >= 1000 ? `${r.DurationMs / 1000} s` : `${r.DurationMs} ms`}</td>
              <td>{r.Message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
