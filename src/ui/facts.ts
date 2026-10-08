import factsMarkdown from '../../Docs/AZURE_FACTS.md?raw'

/**
 * The facts register, read at build time so the game shows the same rule text and Learn links as
 * Docs/AZURE_FACTS.md. There is exactly one place where a rule is written down.
 */

export interface RuleSource {
  key: string
  title: string
  url: string
}

export interface RuleInfo {
  id: string
  text: string
  status: string
  sources: RuleSource[]
}

/** Split a Markdown table row into cells, keeping escaped pipes (`\|`) inside cells. */
function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, '')
    .split(/(?<!\\)\|/)
    .map(c => c.trim().replace(/\\\|/g, '|'))
}

export function parseFacts(markdown: string): Map<string, RuleInfo> {
  const sources = new Map<string, RuleSource>()
  const rows: string[][] = []
  for (const line of markdown.split('\n')) {
    if (!line.startsWith('|')) continue
    const row = cells(line)
    const first = row[0] ?? ''
    if (/^L-[A-Z0-9-]+$/.test(first)) {
      const m = /^(.*?)\s+—\s+(https:\/\/\S+)$/.exec(row[1] ?? '')
      if (m) sources.set(first, { key: first, title: m[1] ?? first, url: m[2] ?? '' })
    } else if (/^[A-Z]{2,5}-\d+[a-z]?$/.test(first)) {
      rows.push(row)
    }
  }
  const rules = new Map<string, RuleInfo>()
  for (const [id = '', text = '', sourceCell = '', status = ''] of rows) {
    const keys = sourceCell.split(',').map(k => k.trim()).filter(k => sources.has(k))
    rules.set(id, { id, text, status, sources: keys.map(k => sources.get(k) as RuleSource) })
  }
  return rules
}

const RULES = parseFacts(factsMarkdown)

export const ruleInfo = (id: string): RuleInfo | undefined => RULES.get(id)
