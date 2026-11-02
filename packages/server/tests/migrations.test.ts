import { execFileSync } from 'node:child_process'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join, relative } from 'node:path'
import { afterAll, describe, expect, it } from 'vite-plus/test'

const packageDir = join(import.meta.dirname, '..')
const drizzleKit = join(packageDir, 'node_modules/.bin/drizzle-kit')

mkdirSync(join(packageDir, '.vitest'), { recursive: true })
const scratch = mkdtempSync(join(packageDir, '.vitest', 'drizzle-kit-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

function listFiles(root: string, directory = root): string[] {
  return readdirSync(directory)
    .flatMap((name) => {
      const file = join(directory, name)
      return statSync(file).isDirectory() ? listFiles(root, file) : [relative(root, file)]
    })
    .sort()
}

function generateOnCopy(name: string, schemaFile: string, extraArgs: string[] = []) {
  const workdir = join(scratch, name)
  const out = join(workdir, 'migrations')
  mkdirSync(workdir)
  cpSync(join(packageDir, 'migrations'), out, { recursive: true })
  const config = join(workdir, 'drizzle.config.ts')
  writeFileSync(
    config,
    `import { defineConfig } from 'drizzle-kit'\n` +
      `export default defineConfig({ dialect: 'sqlite', schema: ${JSON.stringify(schemaFile)}, out: ${JSON.stringify(relative(packageDir, out))} })\n`,
  )
  const before = listFiles(out)
  const stdout = execFileSync(drizzleKit, ['generate', '--config', config, ...extraArgs], {
    cwd: packageDir,
    encoding: 'utf8',
  })
  return { out, before, after: listFiles(out), stdout }
}

describe('migrations/ and src/db/schema.ts', { timeout: 60_000 }, () => {
  it('describe the same schema: drizzle-kit finds nothing to migrate', () => {
    const run = generateOnCopy('no-change', join(packageDir, 'src/db/schema.ts'))

    expect(run.before).toEqual([
      '0000_init.sql',
      '0001_core.sql',
      '0002_append_only.sql',
      '0003_events_and_schedules.sql',
      '0004_identity.sql',
      '0005_reviews.sql',
      '0006_people_across_sites.sql',
      '0007_read_tokens.sql',
      '0008_search.sql',
      '0009_embeddings.sql',
      '0010_review_comments.sql',
      '0011_structure.sql',
      '0012_site_secrets.sql',
      '0013_site_events.sql',
      '0014_entry_trash.sql',
      '0015_site_changes_append_only.sql',
      '0016_audit_log.sql',
      '0017_assets.sql',
      '0018_unpublishes.sql',
      '0019_redirects.sql',
      '0020_asset_widths.sql',
      '0021_review_rejected.sql',
      '0022_revision_code_words.sql',
      '0023_site_analytics.sql',
      '0024_review_events.sql',
      '0025_abandoned_events.sql',
      '0026_entry_purges.sql',
      '0027_anonymizations.sql',
      '0028_federation.sql',
      '0029_review_items.sql',
      '0030_review_items_backfill.sql',
      '0031_agents.sql',
      '0032_roles_and_invitations.sql',
      '0033_media_files.sql',
      'meta/0000_snapshot.json',
      'meta/0001_snapshot.json',
      'meta/0002_snapshot.json',
      'meta/0003_snapshot.json',
      'meta/0004_snapshot.json',
      'meta/0005_snapshot.json',
      'meta/0006_snapshot.json',
      'meta/0007_snapshot.json',
      'meta/0008_snapshot.json',
      'meta/0009_snapshot.json',
      'meta/0010_snapshot.json',
      'meta/0011_snapshot.json',
      'meta/0012_snapshot.json',
      'meta/0013_snapshot.json',
      'meta/0014_snapshot.json',
      'meta/0015_snapshot.json',
      'meta/0016_snapshot.json',
      'meta/0017_snapshot.json',
      'meta/0018_snapshot.json',
      'meta/0019_snapshot.json',
      'meta/0020_snapshot.json',
      'meta/0021_snapshot.json',
      'meta/0022_snapshot.json',
      'meta/0023_snapshot.json',
      'meta/0024_snapshot.json',
      'meta/0025_snapshot.json',
      'meta/0026_snapshot.json',
      'meta/0027_snapshot.json',
      'meta/0028_snapshot.json',
      'meta/0029_snapshot.json',
      'meta/0030_snapshot.json',
      'meta/0031_snapshot.json',
      'meta/0032_snapshot.json',
      'meta/0033_snapshot.json',
      'meta/_journal.json',
    ])
    expect(run.stdout).toContain('No schema changes, nothing to migrate')
    expect(run.after).toEqual(run.before)
  })

  it('chain the snapshots: a new nullable column of revisions is one ALTER TABLE, with no rebuild', () => {
    const db = join(scratch, 'db')
    cpSync(join(packageDir, 'src/db'), db, { recursive: true })
    const schemaFile = join(db, 'schema.ts')
    const original = readFileSync(schemaFile, 'utf8')
    const changed = original.replace(
      "markdown: text('markdown').notNull(),",
      "markdown: text('markdown').notNull(),\n    summary: text('summary'),",
    )
    expect(changed).not.toBe(original)
    writeFileSync(schemaFile, changed)

    const run = generateOnCopy('drift', schemaFile, ['--name', 'drift'])

    expect(run.after.filter((file) => !run.before.includes(file))).toEqual([
      '0034_drift.sql',
      'meta/0034_snapshot.json',
    ])
    expect(readFileSync(join(run.out, '0034_drift.sql'), 'utf8')).toBe(
      'ALTER TABLE `revisions` ADD `summary` text;',
    )
  })
})
