/**
 * Learn drift check (QA layer 1, deterministic). Every rule in Docs/AZURE_FACTS.md cites a Microsoft Learn
 * page. Learn changes on its own schedule, so a rule verified last month can go stale without any commit
 * here. This module finds each cited page's "last updated" date and compares it with the date recorded
 * when the rules were last checked (Docs/learn-sources.lock.json). A changed date means: re-verify the
 * rules that cite that page. Pure functions here; `learn-drift.ts` does the fetching.
 */

export interface LearnSource {
  key: string
  title: string
  url: string
}

export interface LockEntry {
  key: string
  url: string
  /** The page's last-updated date as Learn publishes it, or null if the page had none. */
  updated: string | null
}

export type Lock = Record<string, LockEntry>

export type PageResult =
  | { key: string; url: string; ok: true; status: number; updated: string | null; finalUrl: string }
  | { key: string; url: string; ok: false; status: number | null; error: string }

/** The `L-…` sources from the register's Sources table: `| L-KEY | Title — https://… |`. */
export function parseSources(markdown: string): LearnSource[] {
  const out: LearnSource[] = []
  for (const line of markdown.split('\n')) {
    const m = /^\|\s*(L-[A-Z0-9-]+)\s*\|\s*(.*?)\s+—\s+(https:\/\/\S+?)\s*\|\s*$/.exec(line)
    if (m) out.push({ key: m[1] ?? '', title: m[2] ?? '', url: m[3] ?? '' })
  }
  return out
}

/**
 * The last-updated date from a Learn page's HTML. Learn pages carry it as metadata (`updated_at`, then
 * `ms.date`); the visible "Last updated on" text is the fallback.
 */
export function extractUpdated(html: string): string | null {
  for (const name of ['updated_at', 'ms.date']) {
    const re = new RegExp(`<meta\\s+[^>]*name=["']${name.replace('.', '\\.')}["'][^>]*content=["']([^"']+)["']`, 'i')
    const alt = new RegExp(`<meta\\s+[^>]*content=["']([^"']+)["'][^>]*name=["']${name.replace('.', '\\.')}["']`, 'i')
    const m = re.exec(html) ?? alt.exec(html)
    if (m?.[1]) return m[1].trim()
  }
  const visible = /Last updated on\s*<[^>]*>?\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i.exec(html) ?? /Last updated on\s+([0-9]{4}-[0-9]{2}-[0-9]{2})/i.exec(html)
  return visible?.[1] ?? null
}

export interface DriftReport {
  changed: { key: string; url: string; was: string | null; now: string | null }[]
  broken: { key: string; url: string; status: number | null; error: string }[]
  /** Pages with no recorded date yet: recorded now, nothing to re-verify. */
  baseline: { key: string; url: string; now: string | null }[]
  /** The lock as it would be after this run (changed and baseline entries updated). */
  lock: Lock
  /** The old lock plus only the newly cited pages: safe to record without re-verifying anything. */
  baselineLock: Lock
}

export function compare(lock: Lock, results: readonly PageResult[]): DriftReport {
  const report: DriftReport = { changed: [], broken: [], baseline: [], lock: { ...lock }, baselineLock: { ...lock } }
  for (const r of results) {
    if (!r.ok) {
      report.broken.push({ key: r.key, url: r.url, status: r.status, error: r.error })
      continue
    }
    const before = lock[r.url]
    if (!before) {
      report.baseline.push({ key: r.key, url: r.url, now: r.updated })
      report.baselineLock[r.url] = { key: r.key, url: r.url, updated: r.updated }
    }
    else if (before.updated !== r.updated) report.changed.push({ key: r.key, url: r.url, was: before.updated, now: r.updated })
    report.lock[r.url] = { key: r.key, url: r.url, updated: r.updated }
  }
  return report
}

/** Rule IDs in the register that cite a source key: what to re-verify when that page changes. */
export function rulesCiting(markdown: string, key: string): string[] {
  const ids: string[] = []
  for (const line of markdown.split('\n')) {
    const cells = line.split('|').map(c => c.trim())
    const id = cells[1] ?? ''
    if (!/^[A-Z]{2,5}-\d+[a-z]?$/.test(id)) continue
    const sources = (cells[3] ?? '').split(',').map(s => s.trim())
    if (sources.includes(key)) ids.push(id)
  }
  return ids
}

/** The issue body for a run with changed or broken pages. */
export function renderReport(report: DriftReport, markdown: string, runUrl: string): string {
  const lines: string[] = []
  lines.push('Cited Microsoft Learn pages changed or broke since the rules that cite them were last verified.')
  lines.push('Re-verify the listed rules against the page (the `azure-qa` agent can do it), update `Docs/AZURE_FACTS.md`')
  lines.push('if Learn changed, then record the new dates in `Docs/learn-sources.lock.json` (artifact of the run below).')
  lines.push('')
  if (report.changed.length) {
    lines.push('## Changed pages', '', '| Source | Page | Was | Now | Rules to re-verify |', '|---|---|---|---|---|')
    for (const c of report.changed) {
      lines.push(`| ${c.key} | ${c.url} | ${c.was ?? '—'} | ${c.now ?? '—'} | ${rulesCiting(markdown, c.key).join(', ') || '—'} |`)
    }
    lines.push('')
  }
  if (report.broken.length) {
    lines.push('## Broken or unreachable pages', '', '| Source | Page | Status | Error | Rules affected |', '|---|---|---|---|---|')
    for (const b of report.broken) {
      lines.push(`| ${b.key} | ${b.url} | ${b.status ?? '—'} | ${b.error} | ${rulesCiting(markdown, b.key).join(', ') || '—'} |`)
    }
    lines.push('')
  }
  lines.push(`Run: ${runUrl}`)
  return lines.join('\n')
}
