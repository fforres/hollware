import { createHash } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test'
import * as z from 'zod'

import { type Io } from '../src/index.ts'
import { createWranglerRunner } from '../src/wrangler.ts'
import { countingBytes, run } from './support/io.ts'

const MIGRATIONS = fileURLToPath(new URL('../../server/migrations', import.meta.url))
const WRANGLER = fileURLToPath(new URL('../node_modules/.bin/wrangler', import.meta.url))
const MIGRATION_NAMES = readdirSync(MIGRATIONS)
  .filter((name) => name.endsWith('.sql'))
  .sort()
const NOW = '2026-10-12T12:00:00.000Z'
const SLOW = { timeout: 180_000 }

let project: string

beforeAll(() => {
  project = mkdtempSync(join(tmpdir(), 'hollware-cli-it-'))
  writeFileSync(
    join(project, 'wrangler.jsonc'),
    JSON.stringify({
      name: 'hollware-cli-it',
      compatibility_date: '2026-10-06',
      compatibility_flags: ['no_nodejs_compat', 'no_nodejs_compat_v2'],
      send_metrics: false,
      d1_databases: [
        {
          binding: 'DB',
          database_name: 'hollware-cli-it',
          database_id: '00000000-0000-0000-0000-000000000000',
          migrations_dir: MIGRATIONS,
        },
        {
          binding: 'DB2',
          database_name: 'hollware-cli-it-2',
          database_id: '00000000-0000-0000-0000-000000000002',
          migrations_dir: MIGRATIONS,
        },
      ],
    }),
  )
  const bin = join(project, 'node_modules', '.bin', 'wrangler')
  mkdirSync(join(project, 'node_modules', '.bin'), { recursive: true })
  writeFileSync(bin, `#!/bin/sh\nexec "${WRANGLER}" "$@"\n`)
  chmodSync(bin, 0o755)
})

afterAll(() => {
  rmSync(project, { recursive: true, force: true })
})

function cli(argv: string[], overrides: Partial<Io> = {}) {
  return run(argv, {
    cwd: project,
    wrangler: createWranglerRunner(project),
    randomBytes: (length) => crypto.getRandomValues(new Uint8Array(length)),
    tempDir: () => mkdtempSync(join(tmpdir(), 'hollware-cli-it-sql-')),
    ...overrides,
  })
}

const Answer = z.array(z.object({ results: z.array(z.record(z.string(), z.unknown())) }))

async function rows(command: string, database = 'DB'): Promise<Record<string, unknown>[][]> {
  const result = await createWranglerRunner(project)([
    'd1',
    'execute',
    database,
    '--local',
    '--json',
    '--command',
    command,
  ])
  expect(result.stderr).toBe('')
  expect(result.code).toBe(0)
  return Answer.parse(JSON.parse(result.stdout)).map((statement) => statement.results)
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

function tokenIn(messages: string[]): string {
  const token = /hw_pat_[0-9a-hjkmnp-tv-z]{52}/.exec(messages.join('\n'))?.[0]
  if (token === undefined) throw new Error('the command printed no token')
  return token
}

const HOSTILE_LABELS = ["x'); DROP TABLE tokens; --", "\\'); SELECT 'INJECTED' AS injected; --"]
const state: { ownerId: string; firstTokenId: string; created: { id: string; token: string }[] } = {
  ownerId: '',
  firstTokenId: '',
  created: [],
}

describe('hollware on a real local D1', () => {
  it('lists the pending migrations of an empty database', SLOW, async () => {
    const { code, out, err } = await cli(['migrate', '--check'])

    expect(code).toBe(1)
    expect(out).toEqual([
      [
        `${MIGRATION_NAMES.length} migrations pending on the local database "DB":`,
        ...MIGRATION_NAMES.map((name) => `  ${name}`),
      ].join('\n'),
    ])
    expect(err).toEqual([
      `hollware migrate: ${MIGRATION_NAMES.length} migrations pending. Run "hollware migrate --local" to apply them.`,
    ])
  })

  it('applies every migration to an empty database', SLOW, async () => {
    const { code, out, err } = await cli(['migrate'])

    expect(err).toEqual([])
    expect(code).toBe(0)
    expect(out).toEqual([
      [
        `Applied ${MIGRATION_NAMES.length} migrations to the local database "DB":`,
        ...MIGRATION_NAMES.map((name) => `  ${name}`),
      ].join('\n'),
    ])
    const [applied, tables] = await rows(
      "SELECT name FROM d1_migrations ORDER BY id; SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;",
    )
    expect(applied?.map((row) => row.name)).toEqual(MIGRATION_NAMES)
    expect(tables?.map((row) => row.name)).toEqual(
      expect.arrayContaining([
        'entries',
        'publications',
        'revision_tags',
        'revisions',
        'sites',
        'tokens',
        'users',
      ]),
    )
  })

  it('a second migrate is a no-op, and --check is clean', SLOW, async () => {
    expect(await cli(['migrate'])).toEqual({
      code: 0,
      out: ['No pending migrations on the local database "DB".'],
      err: [],
    })
    expect(await cli(['migrate', '--check'])).toEqual({
      code: 0,
      out: ['No pending migrations on the local database "DB".'],
      err: [],
    })
  })

  it('init writes the site, the owner and a token whose hash is stored', SLOW, async () => {
    const { code, out, err } = await cli([
      'init',
      '--site',
      'blog',
      '--owner-name',
      'Test Owner',
      '--owner-email',
      'Owner@Example.com',
    ])

    expect(err).toEqual([])
    expect(code).toBe(0)
    const token = tokenIn(out)
    const [sites, users, tokens] = await rows(
      'SELECT * FROM sites; SELECT * FROM users; SELECT * FROM tokens;',
    )
    expect(sites).toEqual([
      {
        id: 'blog',
        definition: expect.any(String),
        version: 1,
        deleted_at: null,
        created_at: NOW,
        updated_at: NOW,
      },
    ])
    const definition: unknown = JSON.parse(String(sites?.[0]?.['definition']))
    expect(definition).toMatchObject({
      locales: ['en'],
      defaultLocale: 'en',
      collections: { blog: { tagsField: 'tags' } },
    })
    expect(users).toEqual([
      {
        id: expect.stringMatching(/^usr_[0-9A-HJKMNP-TV-Z]{26}$/),
        name: 'Test Owner',
        role: 'owner',
        email: 'owner@example.com',
        email_verified_at: NOW,
        created_at: NOW,
        updated_at: NOW,
        kind: 'person',
      },
    ])
    state.ownerId = String(users?.[0]?.id)
    state.firstTokenId = String(tokens?.[0]?.id)
    expect(tokens).toEqual([
      {
        id: expect.stringMatching(/^tok_[0-9A-HJKMNP-TV-Z]{26}$/),
        site_id: 'blog',
        user_id: state.ownerId,
        label: 'hollware init',
        hash: sha256(token),
        scopes:
          '["content:read","content:write","content:publish","schema:admin","site:owner","review:read","review:comment"]',
        expires_at: '2027-01-10T12:00:00.000Z',
        revoked_at: null,
        last_used_at: null,
        created_at: NOW,
        updated_at: NOW,
        kind: 'personal',
      },
    ])
    expect(tokens?.[0]?.hash).not.toBe(token)
    expect(out.join('\n')).toContain(`Token    ${state.firstTokenId}`)
  })

  it('a second init is refused and the database is unchanged', SLOW, async () => {
    const { code, out, err } = await cli([
      'init',
      '--owner-email',
      'olga@example.com',
      '--site',
      'blog',
    ])

    expect(code).toBe(1)
    expect(out).toEqual([])
    expect(err).toEqual([
      `hollware init: the site "blog" already has an owner (${state.ownerId}), so there is nothing to set up. Create another token with "hollware token create --site blog --label <text>".`,
    ])
    expect(
      await rows(
        'SELECT (SELECT count(*) FROM sites) AS sites, (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM tokens) AS tokens;',
      ),
    ).toEqual([[{ sites: 1, users: 1, tokens: 1 }]])
  })

  it('token create writes a hostile label as one string', SLOW, async () => {
    for (const [index, label] of HOSTILE_LABELS.entries()) {
      const flags = index === 0 ? ['--scopes', 'content:read', '--expires-in-days', '30'] : []
      const { code, out, err } = await cli(['token', 'create', '--label', label, ...flags])

      expect(err).toEqual([])
      expect(code).toBe(0)
      const token = tokenIn(out)
      const id = /^Created token (tok_\S+) /.exec(out[0] ?? '')?.[1]
      if (id === undefined) throw new Error('no token id printed')
      state.created.push({ id, token })
      const [row] = (await rows(`SELECT * FROM tokens WHERE id = '${id}';`))[0] ?? []
      expect(row).toEqual({
        id,
        site_id: 'blog',
        user_id: state.ownerId,
        label,
        hash: sha256(token),
        scopes: index === 0 ? '["content:read"]' : '["content:read","content:write"]',
        expires_at: index === 0 ? '2026-11-11T12:00:00.000Z' : '2027-01-10T12:00:00.000Z',
        revoked_at: null,
        last_used_at: null,
        created_at: NOW,
        updated_at: NOW,
        kind: 'personal',
      })
    }
    expect(await rows('SELECT count(*) AS tokens FROM tokens;')).toEqual([[{ tokens: 3 }]])
  })

  it('token list shows the tokens and never a hash', SLOW, async () => {
    const { code, out, err } = await cli(['token', 'list'])

    expect(err).toEqual([])
    expect(code).toBe(0)
    const text = out.join('\n')
    for (const id of [state.firstTokenId, ...state.created.map((created) => created.id)]) {
      expect(text).toContain(id)
    }
    for (const label of HOSTILE_LABELS) expect(text).toContain(label)
    expect(text.match(/\bactive\b/g)).toHaveLength(3)
    for (const token of state.created.map((created) => created.token)) {
      expect(text).not.toContain(token)
      expect(text).not.toContain(sha256(token))
    }
  })

  it('token revoke sets revoked_at and tells the three cases apart', SLOW, async () => {
    const [first, second] = state.created
    if (first === undefined || second === undefined) throw new Error('no tokens were created')

    expect(await cli(['token', 'revoke', first.id])).toEqual({
      code: 0,
      out: [`Revoked token ${first.id}.`],
      err: [],
    })
    expect(
      await rows(`SELECT id, revoked_at, updated_at FROM tokens WHERE revoked_at IS NOT NULL;`),
    ).toEqual([[{ id: first.id, revoked_at: NOW, updated_at: NOW }]])

    expect(await cli(['token', 'revoke', first.id])).toEqual({
      code: 0,
      out: [`Token ${first.id} was already revoked at ${NOW}. Nothing changed.`],
      err: [],
    })

    const unknown = 'tok_0000000000000000000000000Z'
    expect(await cli(['token', 'revoke', unknown])).toEqual({
      code: 1,
      out: [],
      err: [
        `hollware token revoke: there is no token ${unknown}. "hollware token list" shows the tokens.`,
      ],
    })

    const { out } = await cli(['token', 'list'])
    const statuses = Object.fromEntries(
      (out[0] ?? '')
        .split('\n')
        .slice(1)
        .map((line) => [line.split(/\s{2,}/)[0], line.split(/\s{2,}/)[3]]),
    )
    expect(statuses).toEqual({
      [state.firstTokenId]: 'active',
      [first.id]: 'revoked',
      [second.id]: 'active',
    })
  })

  it(
    'init is all or nothing: a script that fails leaves nothing behind, on another binding',
    SLOW,
    async () => {
      const hash = sha256(`hw_pat_${'3'.repeat(52)}`)
      expect((await cli(['migrate', '--database', 'DB2'])).code).toBe(0)
      await rows(
        `INSERT INTO sites (id, created_at, updated_at) VALUES ('other', '${NOW}', '${NOW}'); INSERT INTO users (id, name, role, created_at, updated_at) VALUES ('usr_EDITOR', NULL, 'editor', '${NOW}', '${NOW}'); INSERT INTO tokens (id, site_id, user_id, label, hash, scopes, expires_at, created_at, updated_at) VALUES ('tok_TAKEN', 'other', 'usr_EDITOR', 'taken', '${hash}', '[]', NULL, '${NOW}', '${NOW}');`,
        'DB2',
      )
      let scratch = ''

      const { code, out, err } = await cli(
        ['init', '--owner-email', 'olga@example.com', '--site', 'blog', '--database', 'DB2'],
        {
          randomBytes: countingBytes(),
          tempDir: () => (scratch = mkdtempSync(join(tmpdir(), 'hollware-cli-it-sql-'))),
        },
      )

      expect(code).toBe(1)
      expect(out).toEqual([])
      expect(err).toEqual([
        expect.stringMatching(
          /^hollware init: wrangler could not run the SQL: UNIQUE constraint failed: tokens\.hash/,
        ),
      ])
      expect(existsSync(scratch)).toBe(false)
      expect(
        await rows(
          'SELECT (SELECT count(*) FROM sites) AS sites, (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM tokens) AS tokens;',
          'DB2',
        ),
      ).toEqual([[{ sites: 1, users: 1, tokens: 1 }]])
    },
  )

  it(
    'init of a second site makes the owner its owner, with a token of that site',
    SLOW,
    async () => {
      const { code, err } = await cli([
        'init',
        '--owner-email',
        'olga@example.com',
        '--site',
        'docs',
      ])

      expect(err).toEqual([])
      expect(code).toBe(0)
      expect(
        await rows(
          "SELECT m.site_id AS site, m.role AS role, (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM tokens WHERE site_id = 'docs') AS tokens FROM members m WHERE m.user_id = '" +
            state.ownerId +
            "' ORDER BY m.site_id;",
        ),
      ).toEqual([
        [
          { site: 'blog', role: 'owner', users: 1, tokens: 1 },
          { site: 'docs', role: 'owner', users: 1, tokens: 1 },
        ],
      ])
    },
  )

  it(
    'agent add makes an agent member, and agent remove takes it out and revokes its grants, never a person',
    SLOW,
    async () => {
      const added = await cli(['agent', 'add', 'reviewer', '--site', 'blog', '--json'])
      expect([added.code, added.err]).toEqual([0, []])
      const id = String(JSON.parse(added.out[0] ?? '{}').id)
      expect(
        await rows(
          `SELECT u.name AS name, u.role AS role, u.kind AS kind, u.email AS email, m.site_id AS site, m.role AS member FROM users u JOIN members m ON m.user_id = u.id WHERE u.id = '${id}';`,
        ),
      ).toEqual([
        [
          {
            name: 'reviewer',
            role: 'reviewer',
            kind: 'agent',
            email: null,
            site: 'blog',
            member: 'author',
          },
        ],
      ])

      const again = await cli(['agent', 'add', 'reviewer', '--site', 'blog'])
      expect(again.err).toEqual([
        'hollware agent add: the site "blog" already has an agent named "reviewer". "hollware agent list" shows its id.',
      ])

      await rows(
        `INSERT INTO agent_grants (id, site_id, user_id, agent, hash, scopes, expires_at, created_at, updated_at) VALUES ('agt_LIVE', 'blog', '${id}', 'reviewer', 'hash-live', '[]', '2026-10-12T13:00:00.000Z', '${NOW}', '${NOW}');`,
      )

      const person = await cli(['agent', 'remove', state.ownerId, '--site', 'blog'])
      expect([person.code, person.err]).toEqual([
        1,
        [
          `hollware agent remove: ${state.ownerId} is no agent member of the site "blog". "hollware agent list" shows the ones that are.`,
        ],
      ])

      const removed = await cli(['agent', 'remove', id, '--site', 'blog'])
      expect([removed.code, removed.err]).toEqual([0, []])
      expect(
        await rows(
          `SELECT user_id FROM members WHERE site_id = 'blog' ORDER BY user_id; SELECT revoked_at, updated_at FROM agent_grants;`,
        ),
      ).toEqual([[{ user_id: state.ownerId }], [{ revoked_at: NOW, updated_at: NOW }]])
      expect((await cli(['agent', 'list', '--site', 'blog'])).out).toEqual([
        'The site "blog" has no agent members.',
      ])
    },
  )
})
