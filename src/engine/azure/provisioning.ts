import type { CommandHandler } from '../commands.ts'

/**
 * How long each write takes to provision, in sim ms. **Made up and game-paced** (ARM-13s): Learn
 * doesn't publish provisioning times, and real ones vary. Resource group writes aren't listed: they
 * complete at once (ARM-6). Shown in-game as made up.
 */
export const PROVISIONING_MS: Readonly<Record<string, number>> = {
  'arm/virtualNetworks/write': 8_000,
  'arm/subnets/write': 5_000,
  'arm/networkSecurityGroups/write': 5_000,
  'arm/securityRules/write': 4_000,
  'arm/securityRules/delete': 4_000,
  'arm/publicIPAddresses/write': 6_000,
  'arm/networkInterfaces/write': 6_000,
  'arm/virtualMachines/write': 90_000,
  // Monitoring (MON-29s)
  'arm/workspaces/write': 20_000,
  'arm/components/write': 10_000,
  'arm/webtests/write': 6_000,
  'arm/metricAlerts/write': 6_000,
}

/** The handler, running as a deployment of its PROVISIONING_MS duration (ARM-12s) when it has one. */
export function withProvisioning(handler: CommandHandler): CommandHandler {
  const ms = PROVISIONING_MS[handler.type]
  return ms ? { ...handler, durationMs: () => ms } : handler
}
