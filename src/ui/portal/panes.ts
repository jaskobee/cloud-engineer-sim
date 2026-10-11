import { kindLabel } from '../resourceKinds.ts'

/** Pane titles from the portal where Learn names them (PORTAL-11, PORTAL-12, PORTAL-12s, PORTAL-17). */
export function paneTitle(kind: string | null, preset?: Record<string, string>): string {
  const editing = preset?.mode === 'edit'
  switch (kind) {
    case 'subnet': return editing ? preset?.name ?? 'Subnet' : 'Add subnet'
    case 'securityRule': return editing ? preset?.name ?? 'Security rule' : preset?.direction === 'Outbound' ? 'Add outbound security rule' : 'Add inbound security rule'
    case 'webTest': return editing ? preset?.name ?? 'Availability test' : 'Add Standard test'
    // A subnet has zero or one network security group (NSG-12); + Associate opens Associate subnet (PORTAL-12).
    case 'associateSubnet': return 'Associate subnet'
    case 'networkInterface': return preset?.name ?? 'Network interface'
    case 'metricAlert': return editing ? preset?.name ?? 'Alert rule' : 'Create an availability alert rule'
    default: return kind ? kindLabel(kind) : ''
  }
}
