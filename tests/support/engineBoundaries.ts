import path from 'node:path'

/** Bare module names the headless engine may never import. */
const FORBIDDEN_PACKAGES = [/^react(-dom)?(\/|$)/, /^zustand(\/|$)/, /^@xyflow\//]

/**
 * Calls that break determinism. The engine gets time from the sim clock and randomness
 * from a seeded RNG, so these must never appear in engine code.
 */
const FORBIDDEN_CALLS: [RegExp, string][] = [
  [/\bDate\.now\s*\(/, 'Date.now()'],
  [/\bnew\s+Date\s*\(/, 'new Date()'],
  [/\bMath\.random\s*\(/, 'Math.random()'],
  [/\bperformance\.now\s*\(/, 'performance.now()'],
  [/\bsetTimeout\s*\(/, 'setTimeout()'],
  [/\bsetInterval\s*\(/, 'setInterval()'],
]

const IMPORT_PATTERNS = [
  /\bfrom\s+['"]([^'"]+)['"]/g, // import x from '…' / export … from '…'
  /\bimport\s+['"]([^'"]+)['"]/g, // import '…'
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g, // import('…')
]

/** Remove comments so documentation may mention forbidden names. Good enough for our code style. */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

export function importSpecifiers(source: string): string[] {
  const code = stripComments(source)
  return IMPORT_PATTERNS.flatMap(re => [...code.matchAll(re)].map(m => m[1] ?? ''))
}

/**
 * Violations of the engine rules for one file.
 * @param file      absolute path of the file
 * @param source    its contents
 * @param engineDir absolute path of src/engine (or of the headless folder being checked)
 * @param allowedDirs folders relative imports may reach; by default only `engineDir` itself
 */
export function engineViolations(file: string, source: string, engineDir: string, allowedDirs: readonly string[] = [engineDir]): string[] {
  const problems: string[] = []
  const rel = path.relative(engineDir, file)

  if (file.endsWith('.tsx') || file.endsWith('.jsx')) problems.push(`${rel}: JSX files don't belong in the headless engine`)

  for (const spec of importSpecifiers(source)) {
    if (spec.startsWith('.')) {
      const target = path.resolve(path.dirname(file), spec)
      const inside = allowedDirs.some(dir => target === dir || target.startsWith(dir + path.sep))
      if (!inside) problems.push(`${rel}: imports '${spec}', which is outside ${allowedDirs.map(d => path.basename(d)).join(' and ')}`)
    } else if (FORBIDDEN_PACKAGES.some(re => re.test(spec))) {
      problems.push(`${rel}: imports UI package '${spec}'`)
    }
  }

  const code = stripComments(source)
  for (const [re, name] of FORBIDDEN_CALLS) {
    if (re.test(code)) problems.push(`${rel}: uses ${name} (use the sim clock / seeded RNG)`)
  }
  return problems
}
