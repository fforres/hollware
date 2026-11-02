import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vite-plus/test'
import {
  checkShippedMigrations,
  type ShippedMigrationsInput,
} from '../guards/shipped-migrations.ts'
import { describeViolations } from '../guards/types.ts'
import { REPO_ROOT } from '../support/repo.ts'

const MIGRATIONS = 'packages/server/migrations'

function git(...args: string[]): string {
  const result = spawnSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`)
  return result.stdout
}

function blobsOf(ids: readonly string[]): Map<string, string> {
  const result = spawnSync('git', ['cat-file', '--batch'], {
    cwd: REPO_ROOT,
    input: `${ids.join('\n')}\n`,
    maxBuffer: 256 * 1024 * 1024,
  })
  if (result.status !== 0) throw new Error(`git cat-file --batch failed: ${String(result.stderr)}`)
  const out = result.stdout
  const blobs = new Map<string, string>()
  let at = 0
  for (const id of ids) {
    const end = out.indexOf(0x0a, at)
    const size = Number(out.subarray(at, end).toString('utf8').split(' ')[2])
    blobs.set(id, out.subarray(end + 1, end + 1 + size).toString('utf8'))
    at = end + 1 + size + 1
  }
  return blobs
}

function shippedReleases() {
  const tags = git('tag', '--list', '@hollware/server@*').split('\n').filter(Boolean).sort()
  const listed = tags.map((tag) => ({
    tag,
    entries: git('ls-tree', `${tag}:${MIGRATIONS}`)
      .split('\n')
      .map((line) => /^\d+ blob ([0-9a-f]+)\t(.+\.sql)$/.exec(line))
      .filter((match) => match !== null)
      .map(([, id = '', name = '']) => ({ id, name })),
  }))
  const blobs = blobsOf([...new Set(listed.flatMap((release) => release.entries.map((e) => e.id)))])
  return listed.map(({ tag, entries }) => ({
    tag,
    files: Object.fromEntries(entries.map(({ id, name }) => [name, blobs.get(id) ?? ''])),
  }))
}

describe('shipped migrations', { timeout: 60_000 }, () => {
  it('no migration that a release of @hollware/server shipped has changed', () => {
    const releases = shippedReleases()
    expect(releases.map((release) => release.tag)).toEqual(
      expect.arrayContaining(['@hollware/server@0.0.1', '@hollware/server@0.0.2']),
    )
    const directory = join(REPO_ROOT, MIGRATIONS)
    const current = Object.fromEntries(
      readdirSync(directory)
        .filter((name) => name.endsWith('.sql'))
        .map((name) => [name, readFileSync(join(directory, name), 'utf8')]),
    )
    expect(describeViolations(checkShippedMigrations({ releases, current }))).toEqual([])
  })

  describe('self-test: the guard fails on a bad fixture', () => {
    const init = 'CREATE TABLE a (id TEXT);\n'
    const releases: ShippedMigrationsInput['releases'] = [
      { tag: '@hollware/server@0.1.0', files: { '0000_init.sql': init } },
      { tag: '@hollware/server@0.2.0', files: { '0000_init.sql': init, '0001_more.sql': 'X;\n' } },
    ]

    it('accepts shipped files that are unchanged, next to new ones', () => {
      expect(
        checkShippedMigrations({
          releases,
          current: { '0000_init.sql': init, '0001_more.sql': 'X;\n', '0002_new.sql': 'Y;\n' },
        }),
      ).toEqual([])
    })

    it('reports an edited file once, naming every release that shipped it', () => {
      expect(
        checkShippedMigrations({
          releases,
          current: { '0000_init.sql': `${init}-- a comment\n`, '0001_more.sql': 'X;\n' },
        }),
      ).toEqual([
        {
          rule: 'shipped-migrations/edited',
          file: 'packages/server/migrations/0000_init.sql',
          message:
            'shipped by @hollware/server@0.1.0, @hollware/server@0.2.0 and changed since: never edit a shipped migration; fix forward with a new one',
        },
      ])
    })

    it('reports a removed file', () => {
      expect(checkShippedMigrations({ releases, current: { '0000_init.sql': init } })).toEqual([
        {
          rule: 'shipped-migrations/removed',
          file: 'packages/server/migrations/0001_more.sql',
          message:
            'shipped by @hollware/server@0.2.0 and now missing: a shipped migration stays, and a change goes in a new migration',
        },
      ])
    })
  })
})
