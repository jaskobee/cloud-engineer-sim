import { useContext, useMemo, useRef, useState } from 'react'
import { Button, MessageBar, MessageBarBody, MessageBarTitle, Tab, TabList } from '@fluentui/react-components'
import { GameStoreContext, useGame } from '../../gameContext.ts'
import { RefusalNotice } from '../../RefusalNotice.tsx'
import { routeForResource } from '../route.ts'
import { buildCommands, canCreate, reviewKey, targetIdOf, type Review, type Values } from './commands.ts'
import { SimNote } from './fields.tsx'
import { WIZARDS } from './wizards.tsx'

const REVIEW = { id: 'review', label: 'Review + create', rule: 'PORTAL-6' }

/**
 * A create wizard (PORTAL-6): tabs starting with Basics, then Review + create, which validates the exact
 * commands (the same dry run as the engine) and shows "Validation passed" or the refusal. Create sends them;
 * a deployment opens its page (the wizard is replaced, not kept in the back stack).
 */
export function Wizard({ kind, preset }: { kind: string; preset: Record<string, string> }) {
  const store = useContext(GameStoreContext)
  const world = useGame(s => s.world)
  const checkAll = useGame(s => s.checkAll)
  const dispatch = useGame(s => s.dispatch)
  const navigate = useGame(s => s.navigate)
  const def = WIZARDS[kind]
  const [values, setValues] = useState<Values>(() => (def ? def.initial(world, preset) : {}))
  const [tab, setTab] = useState('basics')
  /** A review the player asked for (single-screen pages) or a refusal Create ran into. */
  const [explicit, setReview] = useState<Review | null>(null)
  const [busy, setBusy] = useState(false)
  const top = useRef<HTMLDivElement>(null)

  const commands = buildCommands(kind, values)
  const key = reviewKey(commands)
  const reviewing = tab === REVIEW.id

  // On the Review + create tab, validate whatever the form says now (editing a field reviews again).
  // checkAll is a dry run: it changes nothing, so it can run while rendering.
  const auto = useMemo(() => (reviewing ? { key, refusal: checkAll(commands) } : null), [reviewing, key]) // eslint-disable-line react-hooks/exhaustive-deps
  const review = explicit?.key === key ? explicit : auto

  if (!def) return <p className="empty">The simulator can't create this resource type.</p>

  const tabs = def.singleScreen ? [] : [...def.tabs, REVIEW]
  const index = tabs.findIndex(t => t.id === tab)
  const go = (id: string) => {
    setTab(id)
    // Back to the top of the working pane (not scrollIntoView: that would scroll the whole document too).
    top.current?.closest('.portal-work')?.scrollTo({ top: 0 })
  }
  const set = (k: string, v: string) => setValues(prev => ({ ...prev, [k]: v }))
  const startReview = () => (def.singleScreen ? setReview({ key, refusal: checkAll(commands) }) : go(REVIEW.id))

  const create = () => {
    if (!canCreate(review, commands) || !store) return
    setBusy(true)
    let last: ReturnType<typeof dispatch> | null = null
    for (const command of commands) {
      last = dispatch(command)
      if (last.status === 'refused') {
        setReview({ key, refusal: last.refusal })
        setBusy(false)
        return
      }
    }
    const after = store.getState().world
    const operationId = last?.operationId
    if (operationId && after.deployments[operationId]) navigate({ page: 'deployment', id: operationId }, { replace: true })
    else {
      const target = targetIdOf(kind, values)
      navigate(target ? routeForResource(target, after) : { page: 'home' }, { replace: true })
    }
  }

  const passed = review !== null && review.key === key && review.refusal === null
  const showReview = reviewing || (def.singleScreen && review?.key === key)

  return (
    <div className="wizard" ref={top}>
      {tabs.length > 0 && (
        <TabList selectedValue={tab} onTabSelect={(_, d) => go(String(d.value))} className="wizard-tabs" aria-label="Create steps">
          {tabs.map(t => <Tab key={t.id} value={t.id} data-guide={`tab:${t.id}`}>{t.label}</Tab>)}
        </TabList>
      )}
      <div className="wizard-body">
        {!reviewing && def.render(tab, { values, set, world })}
        {showReview && review?.key === key && (
          <div className="wizard-review" role="status">
            {review.refusal ? <RefusalNotice refusal={review.refusal} /> : (
              <MessageBar intent="success" className="validation-passed">
                <MessageBarBody><MessageBarTitle>Validation passed</MessageBarTitle></MessageBarBody>
              </MessageBar>
            )}
            {reviewing && (
              <dl className="review-summary">
                {def.summary(values, world).map(([label, value]) => (
                  <div key={label} className="essentials-row"><dt>{label}</dt><dd>{value}</dd></div>
                ))}
              </dl>
            )}
          </div>
        )}
        {!def.singleScreen && def.tabs.length > 0 && !reviewing && index === def.tabs.length - 1 && (
          <SimNote>Tabs for settings the simulator doesn't model are left out.</SimNote>
        )}
      </div>
      <div className="wizard-footer">
        {reviewing || (def.singleScreen && passed) ? (
          <Button appearance="primary" disabled={!passed || busy} onClick={create} data-guide="wizard:create">Create</Button>
        ) : (
          <Button appearance="primary" onClick={startReview} data-guide="wizard:review">Review + create</Button>
        )}
        {tabs.length > 0 && (
          <>
            <Button disabled={index <= 0} onClick={() => go(tabs[index - 1]?.id ?? 'basics')}>&lt; Previous</Button>
            {index < tabs.length - 1 && <Button onClick={() => go(tabs[index + 1]?.id ?? REVIEW.id)}>Next: {tabs[index + 1]?.label} &gt;</Button>}
          </>
        )}
      </div>
    </div>
  )
}
