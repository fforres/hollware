import { cpSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test'

import { readToken } from '../../conformance/seed.ts'
import { connectAgent } from './support/agent.ts'
import { createProject, SITE_KEY, type Project } from './support/project.ts'

const REPOSITORY = join(import.meta.dirname, '..', '..', '..')
const MIGRATIONS = join(REPOSITORY, 'packages', 'server', 'migrations')
const CORPUS = join(REPOSITORY, 'tests', 'fixtures', 'content', 'blog')

const SHIPPED = readdirSync(MIGRATIONS)
  .filter((name) => name.endsWith('.sql'))
  .sort((a, b) => a.localeCompare(b))

let project: Project

beforeAll(() => {
  project = createProject()
})

afterAll(async () => {
  await project.close()
})

function stable(output: string): string {
  return output
    .replace(/hw_pat_[A-Za-z0-9_-]+/g, '<token>')
    .replace(/\b(usr|tok|ent)_[0-9A-HJKMNP-TV-Z]{26}\b/g, '<$1>')
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g, '<time>')
}

function cells(output: string): string[][] {
  return stable(output)
    .trimEnd()
    .split('\n')
    .map((line) => line.split(/ {2,}/))
}

const usedOrNot = expect.stringMatching(/^(never|<time>)$/)

describe('AC-0.1-10: migrations', () => {
  it('lists every shipped migration as pending on an empty database, and exits 1', async () => {
    const checked = await project.hollware('migrate', '--check')

    expect(checked.code).toBe(1)
    expect(checked.output).toBe(
      [
        `${SHIPPED.length} migrations pending on the local database "DB":`,
        ...SHIPPED.map((name) => `  ${name}`),
        `hollware migrate: ${SHIPPED.length} migrations pending. Run "hollware migrate --local" to apply them.`,
        '',
      ].join('\n'),
    )
  })

  it('applies them all once, and a second run applies nothing', async () => {
    const first = await project.hollware('migrate', '--local')
    const second = await project.hollware('migrate', '--local')
    const checked = await project.hollware('migrate', '--check')

    expect([first.code, first.output]).toEqual([
      0,
      [
        `Applied ${SHIPPED.length} migrations to the local database "DB":`,
        ...SHIPPED.map((name) => `  ${name}`),
        '',
      ].join('\n'),
    ])
    expect([second.code, second.output]).toEqual([
      0,
      'No pending migrations on the local database "DB".\n',
    ])
    expect([checked.code, checked.output]).toEqual([
      0,
      'No pending migrations on the local database "DB".\n',
    ])
  })

  it('leaves the triggers that keep revisions, their tags and publications append-only', async () => {
    const [rows] = await project.query(
      "SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name",
    )

    expect(rows?.map((row) => row['name'])).toEqual([
      'assets_immutable',
      'assets_no_delete',
      'audit_log_immutable',
      'audit_log_no_delete',
      'audit_log_no_replace',
      'entries_fts_publication',
      'entries_fts_removal',
      'entry_purges_immutable',
      'entry_purges_no_delete',
      'publications_immutable',
      'publications_no_delete',
      'publications_no_replace',
      'reviews_close_items',
      'reviews_decided_event',
      'reviews_requested_event',
      'revision_tags_immutable',
      'revision_tags_no_delete',
      'revision_tags_no_replace',
      'revisions_immutable',
      'revisions_no_delete',
      'revisions_no_replace',
      'site_changes_immutable',
      'site_changes_no_delete',
      'site_changes_no_replace',
    ])
  })
})

describe('AC-0.1-16: init and tokens', () => {
  let ownerToken: string
  let url: string

  it('init creates the site, its owner and a token with every scope, printed once', async () => {
    const initialized = await project.hollware(
      'init',
      '--local',
      '--site',
      SITE_KEY,
      '--owner-email',
      'olga@example.com',
    )

    expect(initialized.code).toBe(0)
    ownerToken = readToken(initialized.output)
    expect(stable(initialized.output).split('\n').slice(0, 11)).toEqual([
      'Hollware is ready on the local database "DB".',
      '',
      'Site     playground',
      'Owner    <usr>',
      'Token    <tok>',
      'Scopes   content:read content:write content:publish schema:admin site:owner review:read review:comment',
      'Expires  <time> (in 90 days)',
      '',
      'Your personal token. It is shown only once: Hollware keeps just its hash.',
      '',
      '<token>',
    ])
    const [sites, users, tokens] = await project.query(
      'SELECT id FROM sites; SELECT role, email FROM users; SELECT site_id, label, revoked_at, scopes, length(hash) AS hash FROM tokens',
    )
    expect([sites, users, tokens]).toEqual([
      [{ id: 'playground' }],
      [{ role: 'owner', email: 'olga@example.com' }],
      [
        {
          site_id: 'playground',
          label: 'hollware init',
          revoked_at: null,
          scopes:
            '["content:read","content:write","content:publish","schema:admin","site:owner","review:read","review:comment"]',
          hash: 64,
        },
      ],
    ])
  })

  it('init refuses to run again for a site that has an owner, and changes nothing', async () => {
    const again = await project.hollware('init', '--local', '--site', SITE_KEY)

    expect(again.code).toBe(1)
    expect(stable(again.output)).toBe(
      `hollware init: the site "${SITE_KEY}" already has an owner (<usr>), so there is nothing to set up. Create another token with "hollware token create --site ${SITE_KEY} --label <text>".\n`,
    )
    const [users, tokens] = await project.query(
      'SELECT count(*) AS n FROM users; SELECT count(*) AS n FROM tokens',
    )
    expect([users, tokens]).toEqual([[{ n: 1 }], [{ n: 1 }]])
  })

  it('token create, list and revoke: the revoked token gets 401 from then on', async () => {
    url = await project.start()
    const created = await project.hollware(
      'token',
      'create',
      '--local',
      '--label',
      'acceptance reader',
      '--scopes',
      'content:read',
    )
    expect(created.code).toBe(0)
    const reader = readToken(created.output)
    const id = /Created token (tok_[0-9A-HJKMNP-TV-Z]{26}) /.exec(created.output)?.[1]

    const agent = await connectAgent(url, reader, { era: '2026' })
    const described = await agent.call('describe_site', {})
    await agent.close()
    expect([described.isError, described.output['outcome']]).toEqual([false, 'ok'])

    const listed = await project.hollware('token', 'list', '--local', '--site', SITE_KEY)
    expect(cells(listed.output)).toEqual([
      ['ID', 'LABEL', 'WHOSE', 'STATUS', 'EXPIRES', 'LAST USED', 'SCOPES'],
      [
        '<tok>',
        'hollware init',
        'owner',
        'active',
        '<time>',
        'never',
        'content:read content:write content:publish schema:admin site:owner review:read review:comment',
      ],
      ['<tok>', 'acceptance reader', 'owner', 'active', '<time>', usedOrNot, 'content:read'],
    ])

    const revoked = await project.hollware('token', 'revoke', '--local', String(id))
    expect([revoked.code, revoked.output]).toEqual([0, `Revoked token ${id}.\n`])
    const refused = await fetch(`${url}/mcp`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${reader}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    })
    expect([refused.status, refused.headers.get('www-authenticate')]).toEqual([
      401,
      `Bearer realm="hollware", resource_metadata="${url}/.well-known/oauth-protected-resource/mcp", error="invalid_token", scope="content:read"`,
    ])
    const relisted = await project.hollware('token', 'list', '--local', '--site', SITE_KEY)
    expect(cells(relisted.output)[2]?.slice(1, 4)).toEqual([
      'acceptance reader',
      'owner',
      'revoked',
    ])
  })

  describe('AC-0.1-9: import', () => {
    it('creates the corpus as drafts, and a second run changes nothing', async () => {
      const directory = join(project.scratch, 'content')
      mkdirSync(directory)
      cpSync(CORPUS, join(directory, 'blog'), { recursive: true })
      const tokenFile = project.writeSecret('owner-token', `${ownerToken}\n`)
      const run = () =>
        project.hollware('import', directory, '--url', url, '--token-file', tokenFile)

      const first = await run()
      const second = await run()

      expect(first.code).toBe(0)
      expect(stable(first.output).split('\n').slice(-2)).toEqual([
        'Drafts: 10 created, 0 updated, 0 unchanged.',
        '',
      ])
      expect(second.code).toBe(0)
      expect(stable(second.output).split('\n').slice(-2)).toEqual([
        'Drafts: 0 created, 0 updated, 10 unchanged.',
        '',
      ])
      const [entries, groups, tags, revisions] = await project.query(
        [
          "SELECT locale, count(*) AS n, max(version) AS version, min(status) AS status FROM entries WHERE site_id = 'playground' GROUP BY locale ORDER BY locale",
          "SELECT count(DISTINCT translation_group) AS n FROM entries WHERE site_id = 'playground'",
          "SELECT tag, count(*) AS n FROM revision_tags WHERE site_id = 'playground' GROUP BY tag ORDER BY tag",
          "SELECT count(*) AS n FROM revisions WHERE site_id = 'playground'",
        ].join('; '),
      )
      expect([entries, groups, tags, revisions]).toEqual([
        [
          { locale: 'en', n: 5, version: 1, status: 'draft' },
          { locale: 'es', n: 5, version: 1, status: 'draft' },
        ],
        [{ n: 5 }],
        [
          { tag: 'agents', n: 4 },
          { tag: 'cloudflare', n: 4 },
          { tag: 'cms', n: 6 },
          { tag: 'markdown', n: 4 },
        ],
        [{ n: 10 }],
      ])
    })
  })
})
