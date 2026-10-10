/**
 * Learn drift check runner (`npm run learn:drift`). Fetches every Learn page cited in Docs/AZURE_FACTS.md,
 * compares its last-updated date with Docs/learn-sources.lock.json, and writes:
 *   - learn-drift/report.md   issue body when pages changed or broke (absent when nothing to do)
 *   - learn-drift/lock.json   the lock as it would be after re-verification
 *   - learn-drift/summary.json counts, for the workflow
 *   - learn-drift/baseline-lock.json the old lock plus newly cited pages only (recorded by the workflow)
 * `--update` also writes the new lock to Docs/learn-sources.lock.json (after you re-verified the rules).
 * Needs network access to learn.microsoft.com (GitHub runners have it).
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { compare, extractUpdated, parseSources, renderReport, type Lock, type PageResult } from './learnDrift.ts'

const FACTS = 'Docs/AZURE_FACTS.md'
const LOCK = 'Docs/learn-sources.lock.json'
const OUT = 'learn-drift'

async function check(key: string, url: string): Promise<PageResult> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'cloud-engineer-sim learn-drift check' } })
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`)
      if (!res.ok) return { key, url, ok: false, status: res.status, error: `HTTP ${res.status}` }
      return { key, url, ok: true, status: res.status, updated: extractUpdated(await res.text()), finalUrl: res.url }
    } catch (e) {
      if (attempt === 3) return { key, url, ok: false, status: null, error: String(e instanceof Error ? e.message : e) }
      await new Promise(r => setTimeout(r, 2000 * attempt))
    }
  }
  return { key, url, ok: false, status: null, error: 'unreachable' }
}

async function main() {
  const markdown = readFileSync(FACTS, 'utf8')
  const sources = parseSources(markdown)
  const lock: Lock = existsSync(LOCK) ? JSON.parse(readFileSync(LOCK, 'utf8')) as Lock : {}
  const results: PageResult[] = []
  // A few at a time, to be polite to Learn.
  for (let i = 0; i < sources.length; i += 4) {
    results.push(...await Promise.all(sources.slice(i, i + 4).map(s => check(s.key, s.url))))
  }
  const report = compare(lock, results)
  mkdirSync(OUT, { recursive: true })
  const sortLock = (l: Lock) => Object.fromEntries(Object.entries(l).sort(([a], [b]) => a.localeCompare(b)))
  const sorted = sortLock(report.lock)
  writeFileSync(`${OUT}/lock.json`, `${JSON.stringify(sorted, null, 2)}\n`)
  writeFileSync(`${OUT}/baseline-lock.json`, `${JSON.stringify(sortLock(report.baselineLock), null, 2)}\n`)
  const undated = results.filter(r => r.ok && r.updated === null).map(r => r.key)
  const summary = { sources: sources.length, changed: report.changed.length, broken: report.broken.length, baseline: report.baseline.length, undated }
  writeFileSync(`${OUT}/summary.json`, `${JSON.stringify(summary)}\n`)
  const runUrl = process.env.GITHUB_SERVER_URL ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : 'local run'
  if (report.changed.length || report.broken.length) writeFileSync(`${OUT}/report.md`, renderReport(report, markdown, runUrl))
  if (process.argv.includes('--update')) writeFileSync(LOCK, `${JSON.stringify(sorted, null, 2)}\n`)
  const line = `Learn drift: ${summary.sources} sources, ${summary.changed} changed, ${summary.broken} broken, ${summary.baseline} newly recorded, ${undated.length} without a date${undated.length ? ` (${undated.join(', ')})` : ''}`
  console.log(line)
  if (process.env.GITHUB_ACTIONS) console.log(`::notice::${line}`)
  for (const c of report.changed) console.log(`  changed ${c.key}: ${c.was} -> ${c.now}`)
  for (const b of report.broken) console.log(`  broken  ${b.key}: ${b.error} ${b.url}`)
}

await main()
