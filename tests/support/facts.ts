/** Rule IDs defined in Docs/AZURE_FACTS.md: the first cell of every table row, e.g. `| NSG-4 | … |`. */
export function factIds(markdown: string): Set<string> {
  const ids = new Set<string>()
  for (const m of markdown.matchAll(/^\|\s*([A-Z]{2,5}-\d+[a-z]?)\s*\|/gm)) ids.add(m[1] ?? '')
  return ids
}

/** Every reference to a rule ID with one of the register's prefixes, e.g. `MON-8` or `ARM-1u`. */
export function citedIds(source: string, prefixes: Iterable<string>): string[] {
  const alternatives = [...prefixes].join('|')
  if (!alternatives) return []
  const re = new RegExp(`\\b(?:${alternatives})-\\d+[a-z]?\\b`, 'g')
  return [...source.matchAll(re)].map(m => m[0])
}
