import { CLOCK_SPEEDS, WORLD_SCHEMA_VERSION, type World } from './world.ts'

export type LoadFailure = 'invalid-json' | 'not-a-world' | 'unsupported-version'
export type LoadResult = { ok: true; world: World } | { ok: false; reason: LoadFailure; message: string }

type SaveData = Record<string, unknown>

/** Upgrades a save from schema version `n` to `n + 1`. Add one whenever WORLD_SCHEMA_VERSION is bumped. */
const MIGRATIONS: Record<number, (save: SaveData) => SaveData> = {}

/** The world as save text. It already is plain JSON data, and telemetry is bounded. */
export function saveWorld(world: World): string {
  return JSON.stringify(world)
}

/** Parse, migrate and shape-check a save. Never throws: a bad save is reported, not crashed on. */
export function loadWorld(text: string): LoadResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return fail('invalid-json', 'The save is not valid JSON.')
  }
  if (!isRecord(data) || !Number.isInteger(data['schemaVersion'])) return fail('not-a-world', 'The save has no schema version.')

  let version = data['schemaVersion'] as number
  if (version > WORLD_SCHEMA_VERSION) {
    return fail('unsupported-version', `The save is from a newer version of the game (schema v${version}).`)
  }
  let save: SaveData = data
  while (version < WORLD_SCHEMA_VERSION) {
    const migrate = MIGRATIONS[version]
    if (!migrate) return fail('unsupported-version', `Saves with schema v${version} can't be upgraded.`)
    save = migrate(save)
    version++
  }
  return isWorldShape(save) ? { ok: true, world: save } : fail('not-a-world', 'The save does not contain a valid world.')
}

function fail(reason: LoadFailure, message: string): LoadResult {
  return { ok: false, reason, message }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Top-level shape check. Deeper checks belong to the systems and resource types that own the data. */
function isWorldShape(s: SaveData): s is SaveData & World {
  const { clock, rng, tenant, external, telemetry, alerts } = s
  return (
    s['schemaVersion'] === WORLD_SCHEMA_VERSION &&
    isRecord(clock) && isNumber(clock['now']) && isNumber(clock['epochMs']) &&
    (CLOCK_SPEEDS as readonly unknown[]).includes(clock['speed']) && typeof clock['paused'] === 'boolean' &&
    isRecord(rng) && typeof rng['seed'] === 'string' && isNumber(rng['game']) && isNumber(rng['ids']) &&
    isRecord(tenant) && isRecord(tenant['subscriptions']) && isRecord(tenant['resourceGroups']) && isRecord(tenant['resources']) &&
    isRecord(s['deployments']) && isRecord(s['runtime']) &&
    isRecord(external) && isRecord(external['traffic']) && Array.isArray(external['actors']) && Array.isArray(external['probeLocations']) &&
    Array.isArray(s['activityLog']) &&
    isRecord(telemetry) && isRecord(telemetry['availability']) && Array.isArray(telemetry['availability']['items']) &&
    isNumber(telemetry['availability']['capacity']) && isRecord(telemetry['metrics']) &&
    isRecord(alerts) && Array.isArray(alerts['fired'])
  )
}
