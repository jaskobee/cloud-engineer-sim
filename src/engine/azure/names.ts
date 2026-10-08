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
