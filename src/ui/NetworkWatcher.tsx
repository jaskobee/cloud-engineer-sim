import { useContext, useId, useState, type ReactNode } from 'react'
import { azure, type ArmId, type Resource, type World } from '../engine/index.ts'
import { GameStoreContext, useGame } from './gameContext.ts'
import { RefusalNotice } from './RefusalNotice.tsx'

/**
 * Network Watcher diagnostics, both answered by the same flow evaluator as everything else
 * (CLAUDE.md rule 5): IP flow verify (NW-1) and effective security rules (NW-4).
 */

/** The current world, read when the tenant or runtime state changes (not on every clock tick). */
function useNetworkWorld(): World {
  useGame(s => s.world.tenant)
  useGame(s => s.world.runtime)
  const store = useContext(GameStoreContext)
  if (!store) throw new Error('No game store')
  return store.getState().world
}

const vmsOf = (world: World) => azure.resourcesOfType(world, azure.VM_TYPE)

function privateIpsOf(world: World, vm: Resource): string[] {
  return azure.networkInterfacesOf(vm)
    .map(r => azure.getResource(world, r.id))
    .flatMap(nic => (nic ? azure.ipConfigurationsOf(nic).map(c => c.properties.privateIPAddress) : []))
}

function Field({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId()
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(id)}
    </div>
  )
}

export function IpFlowVerifyPanel() {
  const world = useNetworkWorld()
  const select = useGame(s => s.select)
  const vms = vmsOf(world)
  const [vmId, setVmId] = useState<ArmId>(vms[0]?.id ?? '')
  const vm = vms.find(v => v.id === vmId) ?? vms[0]
  const ips = vm ? privateIpsOf(world, vm) : []
  const [direction, setDirection] = useState<'Inbound' | 'Outbound'>('Inbound')
  const [protocol, setProtocol] = useState<azure.FlowProtocol>('Tcp')
  const [localPort, setLocalPort] = useState('443')
  const [remoteIp, setRemoteIp] = useState('')
  const [remotePort, setRemotePort] = useState('50000')
  const [result, setResult] = useState<azure.IpFlowVerifyResult | null>(null)

  if (!vm) {
    return <p className="empty">IP flow verify tests traffic to and from a virtual machine. Create a VM first, then check whether a connection would be allowed.</p>
  }

  const check = () => setResult(azure.ipFlowVerify(world, {
    vmId: vm.id, direction, protocol, localIp: ips[0] ?? '', localPort: Number(localPort), remoteIp: remoteIp.trim(), remotePort: Number(remotePort),
  }))

  return (
    <div className="nw">
      <form className="nw-form" onSubmit={e => { e.preventDefault(); check() }}>
        <Field label="Virtual machine">
          {id => (
            <select id={id} className="input" value={vm.id} onChange={e => { setVmId(e.target.value); setResult(null) }}>
              {vms.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          )}
        </Field>
        <Field label="Direction">
          {id => (
            <select id={id} className="input" value={direction} onChange={e => setDirection(e.target.value as 'Inbound' | 'Outbound')}>
              <option value="Inbound">Inbound</option>
              <option value="Outbound">Outbound</option>
            </select>
          )}
        </Field>
        <Field label="Protocol">
          {id => (
            <select id={id} className="input" value={protocol} onChange={e => setProtocol(e.target.value as azure.FlowProtocol)}>
              <option value="Tcp">TCP</option>
              <option value="Udp">UDP</option>
            </select>
          )}
        </Field>
        <Field label="Local IP address">{id => <input id={id} className="input mono" value={ips[0] ?? ''} readOnly />}</Field>
        <Field label="Local port">{id => <input id={id} className="input mono" value={localPort} inputMode="numeric" onChange={e => setLocalPort(e.target.value)} />}</Field>
        <Field label="Remote IP address">{id => <input id={id} className="input mono" value={remoteIp} placeholder="198.51.100.77" onChange={e => setRemoteIp(e.target.value)} />}</Field>
        <Field label="Remote port">{id => <input id={id} className="input mono" value={remotePort} inputMode="numeric" onChange={e => setRemotePort(e.target.value)} />}</Field>
        <div className="nw-submit">
          <button type="submit" className="button button-primary">Check</button>
        </div>
      </form>

      {result && !result.ok && <RefusalNotice refusal={result.refusal} />}
      {result?.ok && (
        <div className={`nw-result ${result.access === 'Access allowed' ? 'nw-allowed' : 'nw-denied'}`} role="status">
          <p className="nw-access">{result.access}</p>
          <dl className="facts">
            <div><dt>Security rule</dt><dd>{result.ruleName ?? 'None'}</dd></div>
            <div>
              <dt>Network security group</dt>
              <dd>
                {(() => {
                  const nsgId = result.nsgId
                  // Learn: the result links to the NSG, except when a default rule decided (NW-1).
                  return nsgId && !result.isDefaultRule
                    ? <button type="button" className="link-button" onClick={() => select(nsgId)}>{result.nsgName}</button>
                    : result.nsgName ?? 'None'
                })()}
              </dd>
            </div>
          </dl>
          {result.verdict.kind === 'decided' && result.verdict.stages.length > 0 && (
            <p className="nw-path">
              Checked in order: {result.verdict.stages.map(s => `${s.association === 'Subnet' ? 'subnet' : 'network interface'} NSG ${s.nsgName} (${s.ruleName}, ${s.access.toLowerCase()})`).join(', then ')}.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

const PROTOCOL_LABEL: Record<string, string> = { '*': 'Any', Tcp: 'TCP', Udp: 'UDP', Icmp: 'ICMP', Esp: 'ESP', Ah: 'AH' }

export function EffectiveRulesPanel() {
  const world = useNetworkWorld()
  const selectedId = useGame(s => s.session.ui.selectedId)
  const nics = azure.resourcesOfType(world, azure.NIC_TYPE)
  // Follow the selection: a selected NIC, or the NIC of a selected VM.
  const fromSelection = (() => {
    const selected = selectedId ? azure.getResource(world, selectedId) : undefined
    if (!selected) return undefined
    if (selected.type.toLowerCase() === azure.NIC_TYPE.toLowerCase()) return selected.id
    if (selected.type.toLowerCase() === azure.VM_TYPE.toLowerCase()) return azure.networkInterfacesOf(selected)[0]?.id
    return undefined
  })()
  const [chosen, setChosen] = useState<ArmId>('')
  const nicId = fromSelection ?? (nics.some(n => n.id === chosen) ? chosen : nics[0]?.id)
  const fieldId = useId()

  if (!nicId) return <p className="empty">Effective security rules show every rule that applies to a network interface. Create a VM first.</p>
  const result = azure.effectiveSecurityRules(world, nicId)

  return (
    <div className="nw">
      <div className="field nw-pick">
        <label htmlFor={fieldId}>Network interface</label>
        <select id={fieldId} className="input" value={nicId} onChange={e => setChosen(e.target.value)} disabled={fromSelection !== undefined}>
          {nics.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
        </select>
      </div>
      {!result.ok && <RefusalNotice refusal={result.refusal} />}
      {result.ok && result.nsgs.map(nsg => (
        <section key={nsg.nsgId} className="nw-nsg" aria-label={`${nsg.nsgName} (${nsg.association})`}>
          <h3 className="rules-title">{nsg.nsgName} <span className="nw-assoc">associated with the {nsg.association === 'Subnet' ? 'subnet' : 'network interface'}</span></h3>
          <div className="table-scroll">
            <table className="log">
              <thead>
                <tr>
                  <th scope="col">Name</th><th scope="col">Priority</th><th scope="col">Direction</th><th scope="col">Access</th>
                  <th scope="col">Protocol</th><th scope="col">Source</th><th scope="col">Source ports</th>
                  <th scope="col">Destination</th><th scope="col">Destination ports</th>
                </tr>
              </thead>
              <tbody>
                {nsg.rules.map(r => (
                  <tr key={r.name} className={r.name.startsWith('default') ? 'rule-default' : ''}>
                    <td className="mono">{r.name}</td><td className="mono">{r.priority}</td><td>{r.direction}</td>
                    <td><span className={`access access-${r.access.toLowerCase()}`}>{r.access}</span></td>
                    <td>{PROTOCOL_LABEL[r.protocol] ?? r.protocol}</td><td className="mono">{r.sourceAddressPrefix}</td>
                    <td className="mono">{r.sourcePortRange}</td><td className="mono">{r.destinationAddressPrefix}</td><td className="mono">{r.destinationPortRange}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  )
}
