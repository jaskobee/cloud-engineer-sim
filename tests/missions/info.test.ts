import { describe, expect, it } from 'vitest'
import { azure } from '../../src/engine/index.ts'
import { infoTopic, infoTopicForType, INFO_TOPICS, MISSIONS } from '../../src/missions/index.ts'

describe('INFO topics (MVP §10)', () => {
  it('cover the slice\'s concepts (BOOTSTRAP_REPORT §G), each paragraph citing rules', () => {
    for (const id of ['resource-group', 'region', 'virtual-network', 'subnet', 'nsg', 'nsg-placement', 'public-ip', 'network-interface',
      'virtual-machine', 'availability-test', 'alerts', 'activity-log', 'ip-flow-verify', 'effective-security-rules']) {
      expect(infoTopic(id), id).toBeDefined()
    }
    for (const t of INFO_TOPICS) {
      expect(t.sections.length, t.id).toBeGreaterThan(0)
      for (const s of t.sections) expect(s.rules.length, `${t.id}: ${s.heading}`).toBeGreaterThan(0)
    }
  })

  it('every link points at a topic that exists', () => {
    const ids = new Set(INFO_TOPICS.map(t => t.id))
    expect(ids.size).toBe(INFO_TOPICS.length)
    for (const t of INFO_TOPICS) for (const r of t.related) expect(ids.has(r), `${t.id} → ${r}`).toBe(true)
    for (const m of Object.values(MISSIONS)) {
      for (const o of m.objectives) {
        expect(o.info.length, o.id).toBeGreaterThan(0)
        for (const i of o.info) expect(ids.has(i), `${o.id} → ${i}`).toBe(true)
      }
    }
    for (const type of [azure.VNET_TYPE, azure.SUBNET_TYPE, azure.NSG_TYPE, azure.PUBLIC_IP_TYPE, azure.NIC_TYPE, azure.VM_TYPE, azure.WEBTEST_TYPE]) {
      expect(ids.has(infoTopicForType(type) ?? ''), type).toBe(true)
    }
  })
})
