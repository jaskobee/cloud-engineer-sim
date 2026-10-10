import { useId, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { azure } from '../engine/index.ts'
import { formatBytes, formatSimTime, niceCeil } from './format.ts'
import { useGame } from './gameContext.ts'

/**
 * VM platform metrics (MON-6 names), sampled once a sim minute (RUN-5s). One chart per metric:
 * they have different units, so they never share an axis. Single series each: the title names it.
 */

const METRICS = [
  { name: 'Percentage CPU', unit: 'percent' as const },
  { name: 'Network In Total', unit: 'bytes' as const },
  { name: 'Network Out Total', unit: 'bytes' as const },
]
type Unit = (typeof METRICS)[number]['unit']
type Sample = readonly [number, number]

/** The last hour of one-minute samples. */
const WINDOW = 60

const formatValue = (unit: Unit, v: number) => (unit === 'percent' ? `${v % 1 === 0 ? v : v.toFixed(1)} %` : formatBytes(v))

export function MetricsPanel() {
  const resources = useGame(s => s.world.tenant.resources)
  const vms = Object.values(resources).filter(r => r.type.toLowerCase() === azure.VM_TYPE.toLowerCase()).sort((a, b) => a.name.localeCompare(b.name))
  const selectedId = useGame(s => s.session.ui.selectedId)
  const [chosen, setChosen] = useState('')
  // The VM picked here, else the VM selected in the workspace, else the first one.
  const vm = vms.find(v => v.id === chosen) ?? vms.find(v => selectedId !== null && azure.armKey(v.id) === azure.armKey(selectedId)) ?? vms[0]
  const fieldId = useId()

  if (!vm) return <p className="empty">Metrics show how busy a virtual machine is. Create a VM first.</p>
  return (
    <div className="metrics">
      <div className="metrics-filters">
        <div className="field nw-pick">
          <label htmlFor={fieldId}>Virtual machine</label>
          <select id={fieldId} className="input" value={vm.id} onChange={e => setChosen(e.target.value)}>
            {vms.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
        <p className="hint">Last hour, one sample per sim minute while the VM runs. The values are made up from its players.</p>
      </div>
      <div className="metrics-grid">
        {METRICS.map(m => <MetricChart key={m.name} vmId={vm.id} name={m.name} unit={m.unit} />)}
      </div>
    </div>
  )
}

// Chart geometry (SVG user units; the SVG scales to its container width).
const W = 420
const H = 160
const PAD = { left: 52, right: 64, top: 14, bottom: 26 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom

function MetricChart({ vmId, name, unit }: { vmId: string; name: string; unit: Unit }) {
  const series = useGame(s => s.world.telemetry.metrics[azure.armKey(vmId)]?.[name])
  const epochMs = useGame(s => s.world.clock.epochMs)
  const [hover, setHover] = useState<number | null>(null)
  const titleId = useId()
  const samples: Sample[] = (series?.items ?? []).slice(-WINDOW)

  if (samples.length === 0) {
    return (
      <figure className="metric">
        <figcaption id={titleId} className="metric-title">{name}</figcaption>
        <p className="empty">No samples yet. Metrics are recorded once a sim minute while the VM is running.</p>
      </figure>
    )
  }

  const max = unit === 'percent' ? Math.min(100, niceCeil(Math.max(...samples.map(s => s[1])), 10)) : niceCeil(Math.max(...samples.map(s => s[1])), 1000)
  const first = samples[0]![0]
  const last = samples.at(-1)![0]
  const span = Math.max(last - first, 60_000)
  const x = (t: number) => PAD.left + ((t - first) / span) * PLOT_W
  const y = (v: number) => PAD.top + PLOT_H - (Math.min(v, max) / max) * PLOT_H
  const path = samples.map((s, i) => `${i === 0 ? 'M' : 'L'}${x(s[0]).toFixed(1)},${y(s[1]).toFixed(1)}`).join(' ')
  const time = (t: number) => formatSimTime(epochMs, t).time.slice(0, 5)
  const latest = samples.at(-1)!
  const shown = hover === null ? null : samples[hover]

  // The crosshair snaps to the nearest sample: readers aim at a time, not at a 2px line.
  const onPointerMove = (e: PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const t = first + ((e.clientX - box.left) / box.width) * span
    let best = 0
    samples.forEach((s, i) => { if (Math.abs(s[0] - t) < Math.abs(samples[best]![0] - t)) best = i })
    setHover(best)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const from = hover ?? samples.length - 1
    setHover(Math.max(0, Math.min(samples.length - 1, from + (e.key === 'ArrowRight' ? 1 : -1))))
  }

  return (
    <figure className="metric">
      <figcaption id={titleId} className="metric-title">{name}</figcaption>
      <div
        className="metric-plot"
        tabIndex={0}
        role="img"
        aria-labelledby={titleId}
        aria-describedby={`${titleId}-desc`}
        onKeyDown={onKeyDown}
        onFocus={() => setHover(samples.length - 1)}
        onBlur={() => setHover(null)}
      >
        <span id={`${titleId}-desc`} className="visually-hidden">
          Latest {formatValue(unit, latest[1])} at {time(latest[0])}, {samples.length} samples. Use the left and right arrow keys to read values.
        </span>
        <svg viewBox={`0 0 ${W} ${H}`} className="metric-svg" aria-hidden="true">
          {[0, 0.5, 1].map(f => (
            <g key={f}>
              <line x1={PAD.left} x2={PAD.left + PLOT_W} y1={y(max * f)} y2={y(max * f)} className="metric-grid" />
              <text x={PAD.left - 6} y={y(max * f) + 4} className="metric-tick" textAnchor="end">{formatValue(unit, max * f)}</text>
            </g>
          ))}
          <text x={PAD.left} y={H - 6} className="metric-tick">{time(first)}</text>
          <text x={PAD.left + PLOT_W} y={H - 6} className="metric-tick" textAnchor="end">{time(last)}</text>
          <path d={path} className="metric-line" />
          {/* Direct label on the latest value only. */}
          <circle cx={x(latest[0])} cy={y(latest[1])} r={4} className="metric-dot" />
          <text x={x(latest[0]) + 8} y={y(latest[1]) + 4} className="metric-value">{formatValue(unit, latest[1])}</text>
          {shown && (
            <g>
              <line x1={x(shown[0])} x2={x(shown[0])} y1={PAD.top} y2={PAD.top + PLOT_H} className="metric-crosshair" />
              <circle cx={x(shown[0])} cy={y(shown[1])} r={4} className="metric-dot" />
            </g>
          )}
          <rect x={PAD.left} y={PAD.top} width={PLOT_W} height={PLOT_H} fill="transparent" onPointerMove={onPointerMove} onPointerLeave={() => setHover(null)} />
        </svg>
        {shown && (
          <div className="metric-tooltip" style={{ left: `${(x(shown[0]) / W) * 100}%` }}>
            <strong>{formatValue(unit, shown[1])}</strong>
            <span>{time(shown[0])}</span>
          </div>
        )}
      </div>
      <details className="metric-table">
        <summary>Show as table</summary>
        <table className="log">
          <thead><tr><th scope="col">Time</th><th scope="col">{name}</th></tr></thead>
          <tbody>
            {samples.slice(-10).reverse().map(s => (
              <tr key={s[0]}><td className="mono">{time(s[0])}</td><td className="mono">{formatValue(unit, s[1])}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}
