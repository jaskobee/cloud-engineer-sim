import type { CommandHandler, Registry } from './commands.ts'
import { SIM_COMMANDS } from './simCommands.ts'

/** All command handlers by type. The built-in sim controls are always included. */
export function createRegistry(handlers: readonly CommandHandler[]): Registry {
  const registry = new Map<string, CommandHandler>()
  for (const handler of [...SIM_COMMANDS, ...handlers]) {
    if (registry.has(handler.type)) throw new Error(`Two handlers for command type '${handler.type}'`)
    registry.set(handler.type, handler)
  }
  return registry
}
