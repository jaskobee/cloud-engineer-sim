import { azure } from '../../../engine/index.ts'
import { Essentials } from './common.tsx'
import { NIC_SECTIONS, NSG_SECTIONS, VNET_SECTIONS } from './networkSections.tsx'
import { ACTIVITY_LOG, ALERT_RULE_SECTIONS, COMPONENT_SECTIONS, GROUP_SECTIONS, VM_SECTIONS, WEBTEST_SECTIONS } from './otherSections.tsx'
import type { SectionDef } from './types.ts'

const BASE: Record<string, SectionDef> = { overview: { Body: Essentials }, activityLog: ACTIVITY_LOG }

const BY_TYPE: Record<string, Record<string, SectionDef>> = {
  resourcegroup: GROUP_SECTIONS,
  [azure.VNET_TYPE.toLowerCase()]: VNET_SECTIONS,
  [azure.NSG_TYPE.toLowerCase()]: NSG_SECTIONS,
  [azure.NIC_TYPE.toLowerCase()]: NIC_SECTIONS,
  [azure.VM_TYPE.toLowerCase()]: VM_SECTIONS,
  [azure.COMPONENT_TYPE.toLowerCase()]: COMPONENT_SECTIONS,
  [azure.WEBTEST_TYPE.toLowerCase()]: WEBTEST_SECTIONS,
  [azure.METRIC_ALERT_TYPE.toLowerCase()]: ALERT_RULE_SECTIONS,
}

/** The sections a resource page can show for a type (or `resourcegroup`); menus.ts decides which are listed. */
export function sectionsFor(type: string): Record<string, SectionDef> {
  return { ...BASE, ...BY_TYPE[type.toLowerCase()] }
}
