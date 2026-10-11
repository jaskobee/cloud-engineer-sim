import { Button, DrawerBody, DrawerHeader, DrawerHeaderTitle, OverlayDrawer } from '@fluentui/react-components'
import { Dismiss20Regular } from '@fluentui/react-icons'
import { CreatePanel } from '../CreatePanel.tsx'
import { FlowInspector } from '../canvas/FlowInspector.tsx'
import { useGame } from '../gameContext.ts'
import { paneTitle } from './panes.ts'

/** The side pane over the page (spec §4): child resource forms and watched flows. */
export function ContextPaneHost() {
  const pane = useGame(s => s.session.ui.nav.contextPane)
  const close = useGame(s => s.closeContextPane)
  const title = !pane ? '' : pane.kind === 'flow' ? 'Watched connection' : paneTitle(pane.request.kind, pane.request.preset)
  return (
    <OverlayDrawer open={pane !== null} onOpenChange={(_, d) => { if (!d.open) close() }} position="end" size="medium" className="context-pane">
      <DrawerHeader>
        <DrawerHeaderTitle action={<Button appearance="subtle" aria-label="Close" icon={<Dismiss20Regular />} onClick={close} />}>{title}</DrawerHeaderTitle>
      </DrawerHeader>
      <DrawerBody>
        {pane?.kind === 'flow' && <FlowInspector flowId={pane.flowId} />}
        {pane?.kind === 'create' && <CreatePanel key={JSON.stringify(pane.request)} request={pane.request} />}
      </DrawerBody>
    </OverlayDrawer>
  )
}
