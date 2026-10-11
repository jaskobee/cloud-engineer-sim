import { Button, MessageBar, MessageBarBody, MessageBarTitle, Spinner } from '@fluentui/react-components'
import { azure, mainOperation, type DeploymentOperation } from '../../engine/index.ts'
import { formatDuration, formatSimTime } from '../format.ts'
import { useGame } from '../gameContext.ts'
import { useStableWorld } from './useStableWorld.ts'
import { typeLabel } from '../resourceKinds.ts'
import { PageFrame } from './PageFrame.tsx'
import { routeForResource } from './route.ts'
import { ResourceLink } from './sections/common.tsx'

/**
 * One deployment (PORTAL-8, PORTAL-9): status, its summary with the correlation ID, the operation details, and
 * Go to resource once it has finished. Durations are made up and game-paced (ARM-13s).
 */
export function DeploymentPage({ id }: { id: string }) {
  const deployment = useGame(s => s.world.deployments[id])
  const now = useGame(s => s.world.clock.now)
  const epochMs = useGame(s => s.world.clock.epochMs)
  const subscriptions = useGame(s => s.world.tenant.subscriptions)
  const world = useStableWorld()
  const navigate = useGame(s => s.navigate)
  if (!deployment) {
    return <PageFrame title="Deployment"><p className="empty">This deployment is no longer in the history (ARM-10 keeps the newest 800 per resource group).</p></PageFrame>
  }
  const target = mainOperation(deployment).targetResourceId
  const start = formatSimTime(epochMs, deployment.startedAt)
  const elapsed = (deployment.completedAt ?? now) - deployment.startedAt
  const running = deployment.provisioningState === 'Running'
  return (
    <PageFrame title={deployment.name} subtitle="Deployment">
      {running && (
        <MessageBar intent="info" icon={<Spinner size="extra-tiny" />}>
          <MessageBarBody><MessageBarTitle>Deployment in progress</MessageBarTitle>{formatDuration(elapsed)} so far.</MessageBarBody>
        </MessageBar>
      )}
      {deployment.provisioningState === 'Succeeded' && (
        <MessageBar intent="success">
          <MessageBarBody><MessageBarTitle>Deployment succeeded</MessageBarTitle>It took {formatDuration(elapsed)}.</MessageBarBody>
        </MessageBar>
      )}
      {deployment.provisioningState === 'Failed' && (
        <MessageBar intent="error"><MessageBarBody><MessageBarTitle>Deployment failed</MessageBarTitle></MessageBarBody></MessageBar>
      )}
      <dl className="essentials-grid deployment-summary">
        <div className="essentials-row"><dt>Deployment name</dt><dd className="mono">{deployment.name}</dd></div>
        <div className="essentials-row"><dt>Subscription</dt><dd>{subscriptions[deployment.subscriptionId]?.displayName ?? deployment.subscriptionId}</dd></div>
        <div className="essentials-row"><dt>Resource group</dt><dd>
          {deployment.resourceGroupName ? <ResourceLink id={azure.resourceGroupId(deployment.subscriptionId, deployment.resourceGroupName)} /> : '—'}
        </dd></div>
        <div className="essentials-row"><dt>Start time</dt><dd>{start.day} {start.time}</dd></div>
        <div className="essentials-row"><dt>Correlation ID</dt><dd className="mono">{deployment.correlationId}</dd></div>
      </dl>
      <h2 className="section-title">Operation details</h2>
      <div className="grid-scroll">
        <table className="grid">
          <thead><tr><th scope="col">Resource</th><th scope="col">Type</th><th scope="col">Status</th><th scope="col">Operation</th></tr></thead>
          <tbody>
            {deployment.operations.flatMap(op => operationRows(op, now))}
          </tbody>
        </table>
      </div>
      <p className="form-section-hint"><span className="sim-label">Simulator</span> Provisioning times are made up and shortened. Real ones vary. Operations run one after another here, and every resource shows Creating from the start (ARM-15s).</p>
      <div className="wizard-footer is-inline">
        <Button appearance="primary" disabled={running || !world.tenant.resources[azure.armKey(target)]} onClick={() => navigate(routeForResource(target, world))} data-guide="deployment:goToResource">
          Go to resource
        </Button>
      </div>
    </PageFrame>
  )
}

/** One row per resource an operation touches (Operation details, PORTAL-9), in the order the operations run (ARM-15s). */
function operationRows(op: DeploymentOperation, now: number) {
  const status = op.completedAt !== undefined ? 'Succeeded' : op.startsAt <= now ? 'Running' : 'Waiting'
  const label = status === 'Running' ? 'In progress' : status === 'Waiting' ? 'Waiting (simulator)' : status
  const rows: [string, string][] = [
    ...op.created.map(r => [r, 'Create'] as [string, string]), ...op.updated.map(r => [r, 'Update'] as [string, string]), ...op.deleted.map(r => [r, 'Delete'] as [string, string]),
  ]
  if (rows.length === 0) rows.push([op.targetResourceId, op.operationName])
  return rows.map(([r, kind]) => (
    <tr key={`${op.operationId}:${kind}:${r}`}>
      <td><ResourceLink id={r} /></td>
      <td>{typeLabel(azure.parseArmId(r)?.type ?? '')}</td>
      <td><span className={`status status-${status.toLowerCase()}`}>{label}</span></td>
      <td>{kind}</td>
    </tr>
  ))
}
