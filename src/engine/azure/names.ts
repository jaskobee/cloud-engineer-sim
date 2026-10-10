import type { Refusal } from '../commands.ts'
import { rule } from './common.ts'

/** Naming rules (L-NAMES). Names are compared case-insensitively everywhere (NAME-6). */

/** Alphanumerics, underscores, periods, hyphens; starts alphanumeric; ends alphanumeric or underscore. */
const NETWORK_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9_.-]*[A-Za-z0-9_])?$/

function networkName(ruleId: string, what: string, min: number, max: number) {
  return (name: string): Refusal | null => {
    if (name.length < min || name.length > max || !NETWORK_NAME.test(name)) {
      return rule(ruleId, `${what} names are ${min}–${max} characters: letters, numbers, underscores, periods and hyphens. `
        + 'They start with a letter or number and end with a letter, number or underscore.')
    }
    return null
  }
}

export const checkVirtualNetworkName = networkName('VNET-5', 'Virtual network', 2, 64)
export const checkSubnetName = networkName('SUB-6', 'Subnet', 1, 80)
export const checkNsgName = networkName('NSG-9', 'Network security group', 1, 80)
export const checkSecurityRuleName = networkName('NSG-6', 'Security rule', 1, 80)
export const checkPublicIpName = networkName('PIP-3', 'Public IP address', 1, 80)
export const checkNicName = networkName('NIC-6', 'Network interface', 1, 80)

/** Letters and digits in the Unicode categories NAME-1 lists, plus `-`, `_`, `.`, `(`, `)` (NAME-8). */
const RESOURCE_GROUP_NAME = /^[-\p{Lu}\p{Ll}\p{Lt}\p{Lm}\p{Lo}\p{Nd}_.()]+$/u

export function checkResourceGroupName(name: string): Refusal | null {
  if ([...name].length < 1 || [...name].length > 90 || !RESOURCE_GROUP_NAME.test(name) || name.endsWith('.')) {
    return rule('NAME-1', 'Resource group names are 1–90 characters: letters, digits, underscores, hyphens, periods and '
      + 'parentheses, and they can\'t end with a period.')
  }
  return null
}

/** Log Analytics workspace (NAME-2): 4–63 alphanumerics and hyphens, starting and ending alphanumeric. */
export function checkWorkspaceName(name: string): Refusal | null {
  return /^[A-Za-z0-9][A-Za-z0-9-]{2,61}[A-Za-z0-9]$/.test(name)
    ? null
    : rule('NAME-2', 'Log Analytics workspace names are 4–63 letters, numbers and hyphens, and start and end with a letter or number.')
}

/** 1–260 characters, none of `forbidden` or control characters, not ending with a space or period. */
function insightsName(ruleId: string, what: string, forbidden: string) {
  return (name: string): Refusal | null => {
    // eslint-disable-next-line no-control-regex
    const bad = [...name].some(c => forbidden.includes(c) || /[\u0000-\u001f\u007f]/.test(c))
    if (name.length < 1 || name.length > 260 || bad || /[ .]$/.test(name)) {
      return rule(ruleId, `${what} names are 1–260 characters without ${forbidden.split('').join(' ')} or control characters, and can't end with a space or period.`)
    }
    return null
  }
}

export const checkComponentName = insightsName('NAME-3', 'Application Insights', '%&\\?/')
export const checkMetricAlertName = insightsName('NAME-4', 'Alert rule', '*#&+:<>?@%{}\\/|')

/** Availability tests: Learn lists no rule (NAME-5u), so the sim only accepts a safe subset (NAME-5s). */
export function checkWebTestName(name: string): Refusal | null {
  return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?$/.test(name)
    ? null
    : { kind: 'not-modelled', ruleId: 'NAME-5s', message: "Learn doesn't list the naming rule for availability tests, so the simulator only accepts 1–64 letters, numbers and hyphens, starting and ending with a letter or number." }
}
