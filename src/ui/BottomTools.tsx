import type { KeyboardEvent } from 'react'
import type { BottomTab } from '../store/gameStore.ts'
import { ActivityLogPanel } from './ActivityLogPanel.tsx'
import { DeploymentsPanel } from './DeploymentsPanel.tsx'
import { MetricsPanel } from './MetricsPanel.tsx'
import { useGame } from './gameContext.ts'
import { EffectiveRulesPanel, IpFlowVerifyPanel } from './NetworkWatcher.tsx'

const TABS: { id: BottomTab; label: string }[] = [
  { id: 'activity-log', label: 'Activity log' },
  { id: 'deployments', label: 'Deployments' },
  { id: 'metrics', label: 'Metrics' },
  { id: 'ip-flow-verify', label: 'IP flow verify' },
  { id: 'effective-rules', label: 'Effective security rules' },
]

/** The tools under the architecture: logs, deployments and Network Watcher diagnostics. Only tools that work are listed. */
export function BottomTools() {
  const tab = useGame(s => s.session.ui.bottomTab)
  const selectTab = useGame(s => s.selectTab)

  // Arrow keys move between tabs (ARIA tabs pattern).
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    const i = TABS.findIndex(t => t.id === tab)
    const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]
    if (next) {
      selectTab(next.id)
      document.getElementById(`tab-${next.id}`)?.focus()
    }
  }

  return (
    <>
      <div className="tabs" role="tablist" aria-label="Tools" onKeyDown={onKeyDown}>
        {TABS.map(t => (
          <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1} className="tab" onClick={() => selectTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="tab-panel">
        {tab === 'activity-log' && <ActivityLogPanel />}
        {tab === 'deployments' && <DeploymentsPanel />}
        {tab === 'metrics' && <MetricsPanel />}
        {tab === 'ip-flow-verify' && <IpFlowVerifyPanel />}
        {tab === 'effective-rules' && <EffectiveRulesPanel />}
      </div>
    </>
  )
}
