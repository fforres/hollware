import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { breakingChanges } from './api-compat.ts'
import { surfaceOf } from './api.ts'

export function partsAt(root: string, ref: string, files: readonly string[]) {
  const parts: Record<string, Record<string, unknown>> = {}
  for (const file of files) {
    try {
      const text = execFileSync('git', ['show', `${ref}:api/${file}`], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      parts[file] = JSON.parse(text)
    } catch {
      continue
    }
  }
  return Object.keys(parts).length === 0 ? null : parts
}

function versionOf(tag: string): [number, number, number, string] | null {
  const match = /^@hollware\/core@(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/.exec(tag)
  if (match === null) return null
  return [Number(match[1]), Number(match[2]), Number(match[3]), match[4] ?? '']
}

export function promisedTag(tags: readonly string[]): string | null {
  const ranked = tags
    .map((tag) => ({ tag, version: versionOf(tag) }))
    .filter((item): item is { tag: string; version: [number, number, number, string] } => {
      return item.version !== null && item.version[0] >= 1
    })
  const order = (a: [number, number, number, string], b: [number, number, number, string]) => {
    for (let index = 0; index < 3; index++) {
      const difference = Number(a[index]) - Number(b[index])
      if (difference !== 0) return difference
    }
    if (a[3] === b[3]) return 0
    if (a[3] === '') return 1
    if (b[3] === '') return -1
    return a[3].localeCompare(b[3], 'en', { numeric: true })
  }
  ranked.sort((a, b) => order(a.version, b.version))
  return ranked.at(-1)?.tag ?? null
}

export function asksForMajor(changeset: string): boolean {
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(changeset)?.[1] ?? ''
  return front.split(/\r?\n/).some((line) => /^\s*['"]?[^'":]+['"]?\s*:\s*major\s*$/.test(line))
}

export function majorsSince(
  changesets: readonly { name: string; text: string }[],
  released: ReadonlySet<string>,
): string[] {
  return changesets
    .filter((changeset) => !released.has(changeset.name) && asksForMajor(changeset.text))
    .map((changeset) => changeset.name)
}

export function acceptedBreaks(json: string | null, ref: string): Set<string> {
  if (json === null) return new Set()
  try {
    const parsed: unknown = JSON.parse(json)
    if (typeof parsed !== 'object' || parsed === null) return new Set()
    const against: unknown = Reflect.get(parsed, 'against')
    const breaks: unknown = Reflect.get(parsed, 'breaks')
    const reason: unknown = Reflect.get(parsed, 'reason')
    if (against !== ref || typeof reason !== 'string' || reason.trim() === '') return new Set()
    if (!Array.isArray(breaks)) return new Set()
    return new Set(breaks.filter((line): line is string => typeof line === 'string'))
  } catch {
    return new Set()
  }
}

export function inPreMode(preJson: string | null): boolean {
  if (preJson === null) return false
  try {
    const parsed: unknown = JSON.parse(preJson)
    return typeof parsed === 'object' && parsed !== null && Reflect.get(parsed, 'mode') === 'pre'
  } catch {
    return false
  }
}

export function verdictOf(
  breaks: readonly string[],
  majors: readonly string[],
  pre: boolean,
): 'fits' | 'carried' | 'frozen' | 'refused' {
  if (breaks.length === 0) return 'fits'
  if (pre) return 'frozen'
  return majors.length > 0 ? 'carried' : 'refused'
}

function acceptedJsonOf(root: string): string | null {
  try {
    return readFileSync(join(root, '.changeset', 'accepted-breaks.json'), 'utf8')
  } catch {
    return null
  }
}

function preJsonOf(root: string): string | null {
  try {
    return readFileSync(join(root, '.changeset', 'pre.json'), 'utf8')
  } catch {
    return null
  }
}

function changesetsOf(root: string): { name: string; text: string }[] {
  const read = (directory: string) => {
    try {
      return readdirSync(directory)
        .filter((file) => file.endsWith('.md') && file !== 'README.md')
        .map((file) => ({ name: file, text: readFileSync(join(directory, file), 'utf8') }))
    } catch {
      return []
    }
  }
  return [...read(join(root, '.changeset')), ...read(join(root, '.changeset', 'pre'))]
}

function releasedAt(root: string, ref: string): Set<string> {
  try {
    const list = execFileSync('git', ['ls-tree', '--name-only', `${ref}:.changeset/pre`], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return new Set(
      list
        .split('\n')
        .filter((line) => line !== '')
        .map((path) => basename(path)),
    )
  } catch {
    return new Set()
  }
}

export async function main(root: string, argv: readonly string[]): Promise<number> {
  let ref: string | undefined
  if (argv.includes('--against-promise')) {
    const tags = execFileSync('git', ['tag', '--list', '@hollware/core@*'], {
      cwd: root,
      encoding: 'utf8',
    })
      .split('\n')
      .filter((tag) => tag !== '')
    const promised = promisedTag(tags)
    if (promised === null) {
      console.log('No release of 1.x yet: the public API promises nothing to compare with.')
      return 0
    }
    ref = promised
  } else {
    const at = argv.indexOf('--against')
    ref = at === -1 ? undefined : argv[at + 1]
  }
  if (ref === undefined) {
    console.error(
      'Usage: node scripts/api-check.ts --against <git ref> | --against-promise (the newest release from 1.0.0-rc.0 on)',
    )
    return 2
  }
  const now = await surfaceOf(root)
  const before = partsAt(root, ref, Object.keys(now))
  if (before === null) {
    console.log(`${ref} has no api/: nothing to compare with.`)
    return 0
  }
  const accepted = acceptedBreaks(acceptedJsonOf(root), ref)
  const found = breakingChanges(before, now)
  const breaks = found.filter((line) => !accepted.has(line))
  const taken = found.filter((line) => accepted.has(line))
  if (taken.length > 0) {
    console.log(
      `What breaks since ${ref}, accepted in .changeset/accepted-breaks.json:\n${taken.map((line) => `  - ${line}`).join('\n')}`,
    )
  }
  const majors = majorsSince(changesetsOf(root), releasedAt(root, ref))
  const list = breaks.map((line) => `  - ${line}`).join('\n')
  switch (verdictOf(breaks, majors, inPreMode(preJsonOf(root)))) {
    case 'fits':
      console.log(`Nothing breaks since ${ref}: the change fits a minor version.`)
      return 0
    case 'carried':
      console.log(
        `What breaks since ${ref}, carried by the major version of ${majors.join(', ')}:\n${list}`,
      )
      return 0
    case 'frozen':
      console.error(
        `What breaks since ${ref}, which a release candidate refuses whatever its changesets say: the public API is frozen until the release. Keep what is public as it is, or leave pre mode first:\n${list}`,
      )
      return 1
    case 'refused':
      console.error(`What breaks since ${ref}, which needs a major version:\n${list}`)
      return 1
  }
}

const invoked = process.argv[1]
if (invoked !== undefined && pathToFileURL(resolve(invoked)).href === import.meta.url) {
  main(resolve(import.meta.dirname, '..'), process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error: unknown) => {
      console.error(error)
      process.exit(1)
    },
  )
}
