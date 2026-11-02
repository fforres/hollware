import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vite-plus/test'

import { d1, d1Failed, fakeWrangler, type FakeWrangler } from './support/fake-wrangler.ts'
import { activityNote, auditOf, initialDefinition } from '../src/commands/init.ts'
import { run } from './support/io.ts'
import { tempDirs, WRANGLER_JSONC } from './support/project.ts'

const temp = tempDirs()

const OWNER_ID = 'usr_01M4QZQSG0040G2081040G2081'
const TOKEN_ID = 'tok_01M4QZQSG0081040G2081040G2'
const SECRET = `hw_pat_${'3'.repeat(52)}`
const HASH = 'b07c83868ce651218676f8ab9a47188f183db88ea929168941c3f8f20afa6a7a'
const OWNER_QUERY =
  "SELECT user_id AS id, site_id AS site FROM members WHERE role = 'owner' ORDER BY created_at, user_id"

function setup(
  wrangler: FakeWrangler,
  files: Record<string, string> = { 'wrangler.jsonc': WRANGLER_JSONC },
) {
  const cwd = temp.make(files)
  const scratch = temp.make()
  let requests = 0
  return {
    cwd,
    scratch,
    sqlFile: join(scratch, 'init.sql'),
    requests: () => requests,
    run: (argv: string[]) =>
      run(argv, {
        cwd,
        wrangler: wrangler.run,
        tempDir: () => {
          requests += 1
          return scratch
        },
      }),
  }
}

const BLOG_DEFINITION =
  '{"locales":["en"],"defaultLocale":"en","url":null,"styleGuide":null,"cors":{"origins":[]},"events":{"webhooks":[],"indexNow":null},"audit":{"ipAddresses":"off","retentionDays":null},"backups":{"enabled":true,"retentionDays":30},"media":{"format":"webp","quality":85,"maxWidth":2400,"widths":[640,1280],"keepOriginals":true},"access":{"autoProvision":null},"agents":[],"review":{"requireAgents":false},"collections":{"blog":{"routes":{"en":"/blog/:slug/"},"translationGroupField":null,"tagsField":"tags","sortByField":"date","automaticFields":{"date":"firstPublished"},"components":{},"rules":[{"rule":"images-have-alt","severity":"error","params":{}},{"rule":"internal-links-resolve","severity":"warning","params":{}}],"maxMarkdownBytes":null,"styleGuide":null,"navigation":null,"schema":{"type":"object","properties":{"title":{"type":"string","minLength":1},"description":{"type":"string","minLength":1,"maxLength":160},"date":{"type":"string","format":"date"},"tags":{"type":"array","items":{"type":"string","minLength":1}}},"required":["title","description"]}}}}'

const SCRIPT = [
  `INSERT INTO sites (id, definition, version, created_at, updated_at) VALUES ('blog', '${BLOG_DEFINITION}', 1, '2026-10-12T12:00:00.000Z', '2026-10-12T12:00:00.000Z') ON CONFLICT (id) DO UPDATE SET definition = excluded.definition, version = 1, updated_at = excluded.updated_at WHERE sites.definition IS NULL;`,
  `INSERT INTO users (id, name, role, email, email_verified_at, created_at, updated_at) VALUES ('${OWNER_ID}', 'Sergio', 'owner', 'olga@example.com', '2026-10-12T12:00:00.000Z', '2026-10-12T12:00:00.000Z', '2026-10-12T12:00:00.000Z');`,
  `INSERT INTO members (id, site_id, user_id, role, created_at, updated_at) VALUES ('mbr_01M4QZQSG00R30C1G60R30C1G6', 'blog', '${OWNER_ID}', 'owner', '2026-10-12T12:00:00.000Z', '2026-10-12T12:00:00.000Z');`,
  `INSERT INTO tokens (id, site_id, user_id, label, hash, scopes, expires_at, created_at, updated_at) VALUES ('${TOKEN_ID}', 'blog', '${OWNER_ID}', 'hollware init', '${HASH}', '["content:read","content:write","content:publish","schema:admin","site:owner","review:read","review:comment"]', '2027-01-10T12:00:00.000Z', '2026-10-12T12:00:00.000Z', '2026-10-12T12:00:00.000Z');`,
  `INSERT OR IGNORE INTO site_changes (id, site_id, version, actor_user_id, actor_meta, before, after, created_at, updated_at) SELECT 'sit_01M4QZQSG00W3GE1R70W3GE1R7', id, 1, '${OWNER_ID}', NULL, NULL, definition, '2026-10-12T12:00:00.000Z', '2026-10-12T12:00:00.000Z' FROM sites WHERE id = 'blog' AND version = 1 AND updated_at = '2026-10-12T12:00:00.000Z';`,
  `INSERT INTO invitations (id, site_id, hash, role, user_id, expires_at, used_at, created_at, updated_at) VALUES ('inv_01M4QZQSG00M2GA1850M2GA185', 'blog', '44a460337a32fc1946b319cfb5b958772000faaa3658fe6b12c1faf2b5aaee0f', 'owner', '${OWNER_ID}', '2026-10-19T12:00:00.000Z', NULL, '2026-10-12T12:00:00.000Z', '2026-10-12T12:00:00.000Z');`,
  '',
].join('\n')

const ANOTHER_SITE = [
  `INSERT INTO sites (id, definition, version, created_at, updated_at) VALUES ('docs', '${BLOG_DEFINITION}', 1, '2026-10-12T12:00:00.000Z', '2026-10-12T12:00:00.000Z') ON CONFLICT (id) DO UPDATE SET definition = excluded.definition, version = 1, updated_at = excluded.updated_at WHERE sites.definition IS NULL;`,
  `INSERT INTO members (id, site_id, user_id, role, created_at, updated_at) VALUES ('mbr_01M4QZQSG00C1G60R30C1G60R3', 'docs', '${OWNER_ID}', 'owner', '2026-10-12T12:00:00.000Z', '2026-10-12T12:00:00.000Z');`,
  `INSERT INTO tokens (id, site_id, user_id, label, hash, scopes, expires_at, created_at, updated_at) VALUES ('tok_01M4QZQSG0040G2081040G2081', 'docs', '${OWNER_ID}', 'hollware init', '4dae158c0f9ca15ca4364c007877155d279d027930f58291cc65e9f95b98b429', '["content:read","content:write","content:publish","schema:admin","site:owner","review:read","review:comment"]', '2027-01-10T12:00:00.000Z', '2026-10-12T12:00:00.000Z', '2026-10-12T12:00:00.000Z');`,
  `INSERT OR IGNORE INTO site_changes (id, site_id, version, actor_user_id, actor_meta, before, after, created_at, updated_at) SELECT 'sit_01M4QZQSG00G2081040G208104', id, 1, '${OWNER_ID}', NULL, NULL, definition, '2026-10-12T12:00:00.000Z', '2026-10-12T12:00:00.000Z' FROM sites WHERE id = 'docs' AND version = 1 AND updated_at = '2026-10-12T12:00:00.000Z';`,
  '',
].join('\n')
const SECRET_OF_ANOTHER = `hw_pat_${'2'.repeat(52)}`

describe('hollware init', () => {
  it('creates the site, the owner and the first token in one script and prints the token once', async () => {
    const wrangler = fakeWrangler(d1([]), d1([], [], []))
    const project = setup(wrangler)

    const { code, out, err } = await project.run([
      'init',
      '--owner-email',
      'olga@example.com',
      '--site',
      'blog',
      '--owner-name',
      'Sergio',
    ])

    expect(err).toEqual([])
    expect(code).toBe(0)
    expect(wrangler.calls.map((call) => call.args)).toEqual([
      ['d1', 'execute', 'DB', '--local', '--json', '--command', OWNER_QUERY],
      ['d1', 'execute', 'DB', '--local', '--json', '--file', project.sqlFile],
    ])
    expect(wrangler.calls[1]?.sql).toBe(SCRIPT)
    expect(wrangler.calls[1]?.sql).not.toContain(SECRET)
    expect(out).toEqual([
      [
        'Hollware is ready on the local database "DB".',
        '',
        'Site     blog',
        `Owner    ${OWNER_ID}`,
        `Token    ${TOKEN_ID}`,
        'Scopes   content:read content:write content:publish schema:admin site:owner review:read review:comment',
        'Expires  2027-01-10T12:00:00.000Z (in 90 days)',
        '',
        'Your personal token. It is shown only once: Hollware keeps just its hash.',
        '',
        SECRET,
        '',
        'Set up your passkey for the admin, once, by 2026-10-19T12:00:00.000Z:',
        '  <your Hollware URL>/setup#invitation=hw_inv_BAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQ',
        '',
        'The link above is for you, in a browser: it sets up the passkey that signs you in to the admin. Your agent can start now with the token alone; set up the passkey whenever you want.',
        '',
        'Next:',
        '  Save the token in a file only you can read, then import content:',
        '    hollware import <directory> --url <your Hollware URL> --token-file <file>',
        '  An MCP client sends it as the header "Authorization: Bearer <token>" to <your Hollware URL>/mcp.',
        '  More tokens: hollware token create --label <text>',
        '',
        'Connect an agent. The token goes in the environment variable HOLLWARE_TOKEN, never in the configuration:',
        '  export HOLLWARE_TOKEN="$(cat <token-file>)"',
        '  Claude Code:',
        "    claude mcp add --transport http hollware <your Hollware URL>/mcp --header 'Authorization: Bearer ${HOLLWARE_TOKEN}'",
        '  Any client that reads .mcp.json (Cursor and VS Code: "hollware mcp-config --client cursor|vscode"):',
        '    {',
        '      "mcpServers": {',
        '        "hollware": {',
        '          "type": "http",',
        '          "url": "<your Hollware URL>/mcp",',
        '          "headers": {',
        '            "Authorization": "Bearer ${HOLLWARE_TOKEN}"',
        '          }',
        '        }',
        '      }',
        '    }',
        '',
        'The activity log of the site keeps no address and keeps every line; an owner changes that in the admin (Site, Activity log).',
      ].join('\n'),
    ])
    expect(out.join('\n').split(SECRET)).toHaveLength(2)
  })

  it.each([
    [['--local'], '--local', 'local'],
    [['--remote'], '--remote', 'remote'],
    [[], '--local', 'local'],
  ])('uses the target of the flag %j in both calls', async (flags, flag, name) => {
    const wrangler = fakeWrangler(d1([]), d1([], [], []))
    const project = setup(wrangler)

    const { code, out } = await project.run([
      'init',
      '--owner-email',
      'olga@example.com',
      '--site',
      'blog',
      ...flags,
    ])

    expect(code).toBe(0)
    expect(wrangler.calls.map((call) => call.args[3])).toEqual([flag, flag])
    expect(out[0]?.split('\n')[0]).toBe(`Hollware is ready on the ${name} database "DB".`)
  })

  it('refuses a second init of a site and writes nothing', async () => {
    const wrangler = fakeWrangler(d1([{ id: OWNER_ID, site: 'blog' }]))
    const project = setup(wrangler)

    const { code, out, err } = await project.run([
      'init',
      '--owner-email',
      'olga@example.com',
      '--site',
      'blog',
    ])

    expect(code).toBe(1)
    expect(out).toEqual([])
    expect(err).toEqual([
      `hollware init: the site "blog" already has an owner (${OWNER_ID}), so there is nothing to set up. Create another token with "hollware token create --site blog --label <text>".`,
    ])
    expect(wrangler.calls.map((call) => call.args)).toEqual([
      ['d1', 'execute', 'DB', '--local', '--json', '--command', OWNER_QUERY],
    ])
    expect(project.requests()).toBe(0)
    expect(readdirSync(project.scratch)).toEqual([])
  })

  it('adds another site to the owner of the database, with a token of that site and no setup link', async () => {
    const wrangler = fakeWrangler(d1([{ id: OWNER_ID, site: 'blog' }]), d1([], [], []))
    const project = setup(wrangler)

    const { code, out, err } = await project.run(['init', '--site', 'docs'])

    expect(err).toEqual([])
    expect(code).toBe(0)
    expect(wrangler.calls[1]?.sql).toBe(ANOTHER_SITE)
    expect(out.join('\n')).not.toContain('/setup#invitation=')
    expect(out[0]?.split('\n')[0]).toBe(
      'Added the site "docs" on the local database "DB", owned by the owner of the database.',
    )
    expect(out.join('\n').split(SECRET_OF_ANOTHER)).toHaveLength(2)
  })

  it('says to migrate first when the tables are missing', async () => {
    const wrangler = fakeWrangler(d1Failed('no such table: users: SQLITE_ERROR'))
    const project = setup(wrangler)

    const { code, out, err } = await project.run([
      'init',
      '--owner-email',
      'olga@example.com',
      '--site',
      'blog',
    ])

    expect(code).toBe(1)
    expect(out).toEqual([])
    expect(err).toEqual([
      'hollware init: the database has no Hollware tables yet. Run "hollware migrate --local" first.',
    ])
    expect(wrangler.calls).toHaveLength(1)
  })

  it('takes the database from --database, as it is, and needs no wrangler.jsonc', async () => {
    const wrangler = fakeWrangler(d1([]), d1([], [], []))
    const project = setup(wrangler, {})

    const { code, out } = await project.run([
      'init',
      '--owner-email',
      'olga@example.com',
      '--site',
      'blog',
      '--database',
      'blog-db',
    ])

    expect(code).toBe(0)
    expect(wrangler.calls.map((call) => call.args)).toEqual([
      ['d1', 'execute', 'blog-db', '--local', '--json', '--command', OWNER_QUERY],
      ['d1', 'execute', 'blog-db', '--local', '--json', '--file', project.sqlFile],
    ])
    expect(out[0]?.split('\n')[0]).toBe('Hollware is ready on the local database "blog-db".')
  })

  it('does not reach wrangler when the project has no binding DB and --database is not given', async () => {
    const wrangler = fakeWrangler()
    const project = setup(wrangler, {
      'wrangler.jsonc': '{ "d1_databases": [{ "binding": "CONTENT" }] }',
    })

    const { code, err } = await project.run([
      'init',
      '--owner-email',
      'olga@example.com',
      '--site',
      'blog',
    ])

    expect(code).toBe(1)
    expect(err).toEqual([
      `hollware init: ${project.cwd}/wrangler.jsonc has no D1 binding named "DB" (it has CONTENT). Rename the binding, or choose one with --database <name or binding>.`,
    ])
    expect(wrangler.calls).toEqual([])
  })

  it('writes the owner name as a string literal', async () => {
    const wrangler = fakeWrangler(d1([]), d1([], [], []))
    const project = setup(wrangler)

    const { code } = await project.run([
      'init',
      '--owner-email',
      'olga@example.com',
      '--site',
      'blog',
      '--owner-name',
      `Sergio's "ops" team; --`,
    ])

    expect(code).toBe(0)
    expect(wrangler.calls[1]?.sql?.split('\n')[1]).toBe(
      `INSERT INTO users (id, name, role, email, email_verified_at, created_at, updated_at) VALUES ('${OWNER_ID}', 'Sergio''s "ops" team; --', 'owner', 'olga@example.com', '2026-10-12T12:00:00.000Z', '2026-10-12T12:00:00.000Z', '2026-10-12T12:00:00.000Z');`,
    )
  })

  it('stores the address of the owner with --owner-email, as verified at that moment', async () => {
    const wrangler = fakeWrangler(d1([]), d1([], [], []))
    const project = setup(wrangler)

    const { code } = await project.run([
      'init',
      '--site',
      'blog',
      '--owner-email',
      'Ops@Example.com',
    ])

    expect(code).toBe(0)
    expect(wrangler.calls[1]?.sql?.split('\n')[1]).toBe(
      `INSERT INTO users (id, name, role, email, email_verified_at, created_at, updated_at) VALUES ('${OWNER_ID}', NULL, 'owner', 'ops@example.com', '2026-10-12T12:00:00.000Z', '2026-10-12T12:00:00.000Z', '2026-10-12T12:00:00.000Z');`,
    )
  })

  it('refuses to make an owner without --owner-email, and writes nothing', async () => {
    const wrangler = fakeWrangler(d1([]))
    const project = setup(wrangler)

    const { code, err } = await project.run(['init', '--site', 'blog'])

    expect(code).toBe(1)
    expect(err).toEqual([
      'hollware init: --owner-email is required to make the owner: name their address, such as --owner-email ada@example.com. Run "hollware init --help" for the options.',
    ])
    expect(wrangler.calls).toHaveLength(1)
  })

  it.each([
    [
      [],
      /^hollware init: --site is required: name the site, such as --site my-site\. Run "hollware init --help" for the options\.$/,
    ],
    [['--site', 'Blog'], /^hollware init: invalid --site "Blog": a site key is lowercase letters/],
    [
      ['--site', "x'; DROP TABLE users; --"],
      /^hollware init: invalid --site "x'; DROP TABLE users; --": /,
    ],
    [['--site', 'blog', '--owner-name', 'a\nb'], /^hollware init: invalid --owner-name "a\\nb": /],
    [
      ['--site', 'blog', '--owner-email', "x'@y"],
      /^hollware init: --owner-email "x'@y" is not an email address/,
    ],
    [
      ['--site', 'blog', '--local', '--remote'],
      /^hollware init: --local and --remote cannot be used together: choose one\./,
    ],
    [
      ['--site', 'blog', '--frob'],
      /^hollware init: unknown option '--frob'\. Run "hollware init --help"/,
    ],
    [
      ['--site', 'blog', 'extra'],
      /^hollware init: unexpected argument 'extra'\. Run "hollware init --help"/,
    ],
    [['--site', 'blog', '--database=--local'], /^hollware init: invalid --database "--local": /],
  ])('rejects %j before it touches wrangler', async (args, message) => {
    const wrangler = fakeWrangler()
    const project = setup(wrangler)

    const { code, out, err } = await project.run([
      'init',
      '--owner-email',
      'olga@example.com',
      ...args,
    ])

    expect(code).toBe(1)
    expect(out).toEqual([])
    expect(err).toEqual([expect.stringMatching(message)])
    expect(wrangler.calls).toEqual([])
    expect(project.requests()).toBe(0)
  })

  it('writes the SQL file for its owner only and removes it', async () => {
    const wrangler = fakeWrangler(d1([]), d1([], [], []))
    const project = setup(wrangler)

    await project.run(['init', '--owner-email', 'olga@example.com', '--site', 'blog'])

    expect(wrangler.calls[1]?.mode).toBe(0o600)
    expect(existsSync(project.scratch)).toBe(false)
  })

  it('removes the SQL file and prints no token when wrangler fails', async () => {
    const wrangler = fakeWrangler(
      d1([]),
      d1Failed('UNIQUE constraint failed: users.id: SQLITE_CONSTRAINT'),
    )
    const project = setup(wrangler)

    const { code, out, err } = await project.run([
      'init',
      '--owner-email',
      'olga@example.com',
      '--site',
      'blog',
    ])

    expect(code).toBe(1)
    expect(out).toEqual([])
    expect(err).toEqual([
      'hollware init: wrangler could not run the SQL: UNIQUE constraint failed: users.id: SQLITE_CONSTRAINT',
    ])
    expect(existsSync(project.scratch)).toBe(false)
  })
})

describe('the first definition of a site', () => {
  it('is the preset, in the locales given, the first the default', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'init-definition-'))

    expect(initialDefinition(cwd, 'docs', 'es, en')).toMatchObject({
      locales: ['es', 'en'],
      defaultLocale: 'es',
      collections: { docs: { routes: { es: '/docs/:slug/', en: '/en/docs/:slug/' } } },
    })
    expect(() => initialDefinition(cwd, 'wiki', undefined)).toThrow(
      '--preset is one of blog, docs, empty',
    )
    expect(() => initialDefinition(cwd, undefined, 'en,EN!')).toThrow('"EN!" is not one')
  })

  it('is none in a project with a hollware.config.ts, which moves on its own', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'init-definition-'))
    writeFileSync(join(cwd, 'hollware.config.ts'), 'export default {}\n')

    expect(initialDefinition(cwd, undefined, undefined)).toBeNull()
    expect(() => initialDefinition(cwd, 'blog', undefined)).toThrow(
      'leave out --preset, --locales, --ip-addresses and --audit-retention-days',
    )
    expect(() =>
      initialDefinition(cwd, undefined, undefined, auditOf('hashed', undefined)),
    ).toThrow('leave out --preset, --locales, --ip-addresses and --audit-retention-days')
  })
})

describe('what the activity log of the new site keeps', () => {
  it('keeps no address and every line unless a flag says otherwise', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'init-audit-'))

    expect([
      Reflect.get(Object(initialDefinition(cwd, undefined, undefined)), 'audit'),
      Reflect.get(
        Object(initialDefinition(cwd, undefined, undefined, auditOf('hashed', '90'))),
        'audit',
      ),
    ]).toEqual([
      { ipAddresses: 'off', retentionDays: null },
      { ipAddresses: 'hashed', retentionDays: 90 },
    ])
    expect(activityNote(auditOf('hashed', '30'))).toBe(
      'The activity log of the site keeps a keyed hash of the address of each request and keeps each line 30 days; an owner changes that in the admin (Site, Activity log).',
    )
  })

  it.each([
    ['an address kept raw', 'raw', undefined, '--ip-addresses is off or hashed, not "raw".'],
    ['29 days', undefined, '29', 'not "29"'],
    ['3651 days', undefined, '3651', 'not "3651"'],
    ['days that are no number', undefined, '90d', 'not "90d"'],
  ])('refuses %s', (_name, addresses, days, message) => {
    expect(() => auditOf(addresses, days)).toThrow(message)
  })
})
