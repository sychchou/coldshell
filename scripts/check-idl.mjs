/**
 * Every constant the code asks the IDL for, against the constants the IDL has.
 *
 * `idlConstant()` throws at module load, and config.ts is imported by everything — so a constant
 * the program stopped exporting does not break a test or a type check. It builds, it deploys,
 * and the site is blank. This is the only place that notices in between.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const idl = JSON.parse(readFileSync(join(root, 'app/src/idl/coldshell.json'), 'utf8'))
const has = new Set(idl.constants.map((c) => c.name))

const sources = (dir, found = []) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) sources(path, found)
    else if (/\.tsx?$/.test(name)) found.push(path)
  }
  return found
}

const missing = []
for (const path of [...sources(join(root, 'app/src')), ...sources(join(root, 'server/src'))]) {
  const text = readFileSync(path, 'utf8')
  for (const m of text.matchAll(/(?:idlConstant|constant)\(\s*'([A-Z_0-9]+)'/g)) {
    if (!has.has(m[1])) missing.push(`${path.slice(root.length)} asks for ${m[1]}`)
  }
}

if (missing.length) {
  console.error('the IDL no longer has what the code reads:\n  ' + missing.join('\n  '))
  process.exit(1)
}
console.log(`idl: ${has.size} constants, all of them still read for`)
