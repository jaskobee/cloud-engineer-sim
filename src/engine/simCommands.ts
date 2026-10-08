import { invalid, type CommandHandler } from './commands.ts'
import { CLOCK_SPEEDS, type ClockSpeed } from './world.ts'

/** Built-in time controls. Game commands, not Azure writes, so they leave no activity log entry. */

const isClockSpeed = (n: unknown): n is ClockSpeed => (CLOCK_SPEEDS as readonly unknown[]).includes(n)

export const setSpeed: CommandHandler<{ speed: number }> = {
  type: 'sim/setSpeed',
  write: () => null,
  validate: (_world, { payload }) =>
    isClockSpeed(payload.speed) ? null : invalid('sim/invalid-speed', `Speed must be one of ${CLOCK_SPEEDS.join(', ')}.`),
  apply: (world, { payload }) =>
    isClockSpeed(payload.speed) ? { ...world, clock: { ...world.clock, speed: payload.speed } } : world,
}

export const setPaused: CommandHandler<{ paused: boolean }> = {
  type: 'sim/setPaused',
  write: () => null,
  validate: (_world, { payload }) =>
    typeof payload.paused === 'boolean' ? null : invalid('sim/invalid-paused', 'Paused must be true or false.'),
  apply: (world, { payload }) => ({ ...world, clock: { ...world.clock, paused: payload.paused } }),
}

export const SIM_COMMANDS: readonly CommandHandler[] = [setSpeed, setPaused]
