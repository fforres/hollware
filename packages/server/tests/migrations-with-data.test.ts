import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vite-plus/test'

const MIGRATIONS = join(import.meta.dirname, '..', 'migrations')

function statementsOf(file: string): string[] {
  return readFileSync(join(MIGRATIONS, file), 'utf8')
    .split('--> statement-breakpoint')
    .filter((statement) => statement.trim() !== '')
}

const T = '2026-10-01T10:00:00.000Z'
const ID = (prefix: string) => `${prefix}_01JAB3XQ8ZK4M6N2P5R7S9T0VW`

const CONTENT = [
  `INSERT INTO sites (id, created_at, updated_at) VALUES ('demo', '${T}', '${T}')`,
  `INSERT INTO users (id, name, role, created_at, updated_at) VALUES ('${ID('usr')}', 'Owner', 'owner', '${T}', '${T}')`,
  `INSERT INTO tokens (id, site_id, user_id, label, hash, scopes, created_at, updated_at)
    VALUES ('${ID('tok')}', 'demo', '${ID('usr')}', 'cli', 'hash', '["content:read"]', '${T}', '${T}')`,
  `INSERT INTO users (id, name, role, created_at, updated_at) VALUES ('usr_reviewer', 'Rae', 'reviewer', '${T}', '${T}')`,
  `INSERT INTO tokens (id, site_id, user_id, label, hash, scopes, created_at, updated_at)
    VALUES ('tok_reviewer', 'demo', 'usr_reviewer', 'cli', 'hash-2', '["content:read"]', '${T}', '${T}')`,
  `INSERT INTO entries (id, site_id, collection, locale, slug, status, version, head_rev, created_at, updated_at)
    VALUES ('${ID('ent')}', 'demo', 'blog', 'en', 'hello', 'draft', 1, '${ID('rev')}', '${T}', '${T}')`,
  `INSERT INTO revisions (id, site_id, entry_id, markdown, frontmatter, document, comark_version,
    pipeline_version, word_count, verdict, actor_kind, actor_user_id, actor_token_id, created_at, updated_at)
    VALUES ('${ID('rev')}', 'demo', '${ID('ent')}', '# Hello', '{"title":"Hello harbour"}', '{}', '0.7.0', '1', 1, '{}',
    'token', '${ID('usr')}', '${ID('tok')}', '${T}', '${T}')`,
  `INSERT INTO publications (id, site_id, entry_id, revision_id, action, verdict, acknowledged,
    actor_kind, actor_user_id, actor_token_id, created_at, updated_at)
    VALUES ('${ID('pub')}', 'demo', '${ID('ent')}', '${ID('rev')}', 'publish', '{}', '[]',
    'token', '${ID('usr')}', '${ID('tok')}', '${T}', '${T}')`,
  `INSERT INTO outbox (id, site_id, kind, entry_id, payload, sent_at, created_at, updated_at)
    VALUES ('${ID('evt')}', 'demo', 'entry.published', '${ID('ent')}', '{"kind":"entry.published"}', '${T}', '${T}', '${T}')`,
  `INSERT INTO deliveries (id, site_id, event_id, subscriber, attempts, delivered_at, created_at, updated_at)
    VALUES ('${ID('dlv')}', 'demo', '${ID('evt')}', 'webhook:site', 1, '${T}', '${T}', '${T}')`,
]

const PUBLISHED = [
  `UPDATE entries SET status = 'published', published_rev = head_rev, published_at = '${T}',
    published_sort_key = '${T}', version = 2 WHERE id = '${ID('ent')}'`,
]

const PEOPLE = [
  `INSERT INTO passkeys (id, site_id, user_id, credential_id, public_key, counter, transports, label, created_at, updated_at)
    VALUES ('pky_1', 'demo', '${ID('usr')}', 'credential-1', 'key', 0, '[]', 'Laptop', '${T}', '${T}')`,
  `INSERT INTO sessions (id, site_id, user_id, hash, expires_at, created_at, updated_at)
    VALUES ('ses_1', 'demo', '${ID('usr')}', 'session-hash', '2099-01-01T00:00:00.000Z', '${T}', '${T}')`,
]

const CHALLENGES = [
  `INSERT INTO auth_challenges (id, challenge, purpose, invitation_id, user_id, expires_at, created_at, updated_at)
    VALUES ('chl_1', 'challenge-1', 'authenticate', NULL, NULL, '2099-01-01T00:00:00.000Z', '${T}', '${T}')`,
]

const REVIEWS = [
  `INSERT INTO reviews (id, site_id, entry_id, revision_id, status, acknowledged, requested_by, created_at, updated_at)
    VALUES ('rvw_1', 'demo', '${ID('ent')}', '${ID('rev')}', 'pending', '[]', '${ID('usr')}', '${T}', '${T}')`,
  `INSERT INTO review_comments (id, site_id, review_id, author_id, body, created_at, updated_at)
    VALUES ('rvc_1', 'demo', 'rvw_1', '${ID('usr')}', 'Looks good', '${T}', '${T}')`,
]

const ASSET_COLUMNS =
  'id, site_id, sha256, format, width, height, bytes, widths, original_format, original_bytes, alt, filename, created_by, created_at, updated_at'

const asset = (id: string, format: string, bytes: number) =>
  `INSERT INTO assets (${ASSET_COLUMNS}) VALUES ('${id}', 'demo', '${id.slice(4).padEnd(64, '0')}', '${format}', NULL, NULL, ${bytes}, '[]', '${format}', ${bytes}, 'A file', 'file', '${ID('usr')}', '${T}', '${T}')`

const ASSETS = [asset('ast_00000000000000000000000001', 'image/png', 2048)]

it('runs every migration after 0003 over the content of a deployment, and keeps all of it', () => {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  const files = readdirSync(MIGRATIONS)
    .filter((file) => file.endsWith('.sql'))
    .sort()
  const early = files.filter((file) => file < '0004')
  const later = files.filter((file) => file >= '0004')
  expect(early).toEqual([
    '0000_init.sql',
    '0001_core.sql',
    '0002_append_only.sql',
    '0003_events_and_schedules.sql',
  ])
  for (const file of early) for (const statement of statementsOf(file)) db.exec(statement)
  db.exec('BEGIN')
  db.exec('PRAGMA defer_foreign_keys = ON')
  for (const statement of CONTENT) db.exec(statement)
  db.exec('COMMIT')

  for (const file of later) {
    if (file.startsWith('0006')) for (const statement of PEOPLE) db.exec(statement)
    if (file.startsWith('0008')) for (const statement of PUBLISHED) db.exec(statement)
    if (file.startsWith('0021')) for (const statement of REVIEWS) db.exec(statement)
    if (file.startsWith('0028')) for (const statement of CHALLENGES) db.exec(statement)
    if (file.startsWith('0032')) for (const statement of ASSETS) db.exec(statement)
    db.exec('BEGIN')
    for (const statement of statementsOf(file)) db.exec(statement)
    db.exec('COMMIT')
  }

  expect(db.prepare('SELECT id, format, original_bytes FROM assets').all()).toEqual([
    { id: 'ast_00000000000000000000000001', format: 'image/png', original_bytes: 2048 },
  ])
  db.exec(asset('ast_00000000000000000000000002', 'video/mp4', 734003200))
  db.exec(asset('ast_00000000000000000000000003', 'application/pdf', 921600))
  expect(() => db.exec(asset('ast_00000000000000000000000004', 'text/html', 10))).toThrow(
    /CHECK constraint failed: assets_formats/,
  )
  expect(() => db.exec(asset('ast_00000000000000000000000005', 'video/webm', 0))).toThrow(
    /CHECK constraint failed: assets_sizes/,
  )
  expect(() => db.exec("DELETE FROM assets WHERE id = 'ast_00000000000000000000000002'")).toThrow(
    /append-only: an asset is never deleted/,
  )
  expect(() =>
    db.exec("UPDATE assets SET bytes = 1 WHERE id = 'ast_00000000000000000000000002'"),
  ).toThrow(/append-only: only the alt of an asset changes/)

  const count = (table: string) => db.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.['n']
  expect(['sites', 'users', 'tokens', 'entries', 'revisions', 'publications'].map(count)).toEqual([
    1, 2, 2, 1, 1, 1,
  ])
  expect(db.prepare('SELECT site_id, user_id, role FROM members ORDER BY user_id').all()).toEqual([
    { site_id: 'demo', user_id: ID('usr'), role: 'owner' },
    { site_id: 'demo', user_id: 'usr_reviewer', role: 'author' },
  ])
  expect(db.prepare('SELECT id FROM members').get()).toEqual({
    id: expect.stringMatching(/^mbr_[0-9A-F]{26}$/),
  })
  expect(db.prepare('SELECT user_id, credential_id FROM passkeys').all()).toEqual([
    { user_id: ID('usr'), credential_id: 'credential-1' },
  ])
  expect(db.prepare('SELECT id, email, email_verified_at FROM users ORDER BY id').all()).toEqual([
    { id: ID('usr'), email: null, email_verified_at: null },
    { id: 'usr_reviewer', email: null, email_verified_at: null },
  ])
  expect(
    db.prepare('SELECT id, challenge, purpose, provider, nonce FROM auth_challenges').all(),
  ).toEqual([
    { id: 'chl_1', challenge: 'challenge-1', purpose: 'authenticate', provider: null, nonce: null },
  ])
  expect(() =>
    db.exec(`INSERT INTO auth_challenges (id, challenge, purpose, expires_at, created_at, updated_at)
      VALUES ('chl_bad', 'c', 'guess', '${T}', '${T}', '${T}')`),
  ).toThrow(/CHECK constraint failed: auth_challenges_purpose/)
  expect(db.prepare('SELECT user_id, hash FROM sessions').all()).toEqual([
    { user_id: ID('usr'), hash: 'session-hash' },
  ])
  expect(
    db.prepare("SELECT entry_id, title FROM entries_fts WHERE entries_fts MATCH 'harbour'").all(),
  ).toEqual([{ entry_id: ID('ent'), title: 'Hello harbour' }])
  expect(db.prepare('SELECT id, kind, entry_id FROM outbox').all()).toEqual([
    { id: ID('evt'), kind: 'entry.published', entry_id: ID('ent') },
  ])
  expect(db.prepare('SELECT event_id, subscriber FROM deliveries').all()).toEqual([
    { event_id: ID('evt'), subscriber: 'webhook:site' },
  ])
  db.exec(`INSERT INTO outbox (id, site_id, kind, entry_id, payload, created_at, updated_at)
    VALUES ('evt_site', 'demo', 'site.changed', NULL, '{"kind":"site.changed"}', '${T}', '${T}')`)
  expect(() =>
    db.exec(`INSERT INTO outbox (id, site_id, kind, entry_id, payload, created_at, updated_at)
      VALUES ('evt_bad', 'demo', 'entry.published', NULL, '{}', '${T}', '${T}')`),
  ).toThrow(/CHECK constraint failed: outbox_entry/)
  expect(
    db
      .prepare(
        'SELECT r.id, r.status, c.body FROM reviews r JOIN review_comments c ON c.review_id = r.id',
      )
      .all(),
  ).toEqual([{ id: 'rvw_1', status: 'pending', body: 'Looks good' }])
  const items = () =>
    db
      .prepare(
        'SELECT id, review_id, entry_id, revision_id, base_revision_id, action, excluded, active FROM review_items',
      )
      .all()
  expect(items()).toEqual([
    {
      id: 'rvi_1',
      review_id: 'rvw_1',
      entry_id: ID('ent'),
      revision_id: ID('rev'),
      base_revision_id: ID('rev'),
      action: 'publish',
      excluded: 0,
      active: 1,
    },
  ])
  db.exec(
    `UPDATE reviews SET status = 'rejected', decided_by = '${ID('usr')}', decided_at = '${T}' WHERE id = 'rvw_1'`,
  )
  expect(items()).toMatchObject([{ id: 'rvi_1', active: 0 }])
  expect(
    db
      .prepare(
        "SELECT json_extract(payload, '$.items') AS items FROM outbox WHERE kind = 'review.decided'",
      )
      .all(),
  ).toEqual([{ items: `[{"entryId":"${ID('ent')}","action":"publish"}]` }])
  expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
})
