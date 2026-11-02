import { describe, expect, it } from 'vite-plus/test'

import { d1, d1Failed, fakeWrangler, type FakeWrangler } from './support/fake-wrangler.ts'
import { run } from './support/io.ts'
import { tempDirs, WRANGLER_JSONC } from './support/project.ts'

const temp = tempDirs()

const OWNER_ID = 'usr_01JAB3XQ8ZK4M6N2P5R7S9T0VW'
const TOKEN_ID = 'tok_01M4QZQSG0040G2081040G2081'
const SECRET = `hw_pat_${'2'.repeat(52)}`
const HASH = '4dae158c0f9ca15ca4364c007877155d279d027930f58291cc65e9f95b98b429'
const CONTEXT_QUERY =
  "SELECT id FROM sites ORDER BY id; SELECT user_id AS id FROM members WHERE role = 'owner' ORDER BY created_at, user_id LIMIT 1;"
const NOW = '2026-10-12T12:00:00.000Z'
const IN_90_DAYS = '2027-01-10T12:00:00.000Z'

function setup(
  wrangler: FakeWrangler,
  files: Record<string, string> = { 'wrangler.jsonc': WRANGLER_JSONC },
) {
  const cwd = temp.make(files)
  return { cwd, run: (argv: string[]) => run(argv, { cwd, wrangler: wrangler.run }) }
}

function createAnswers() {
  return [d1([{ id: 'blog' }], [{ id: OWNER_ID }]), d1([])]
}

function insertSql(label: string, scopes: string, expiresAt: string | null, site = 'blog'): string {
  const expires = expiresAt === null ? 'NULL' : `'${expiresAt}'`
  return `INSERT INTO tokens (id, site_id, user_id, label, hash, scopes, expires_at, created_at, updated_at) VALUES ('${TOKEN_ID}', '${site}', '${OWNER_ID}', ${label}, '${HASH}', '${scopes}', ${expires}, '${NOW}', '${NOW}');`
}

describe('hollware token create', () => {
  it('asks for the site and the owner, inserts the token and prints it once', async () => {
    const wrangler = fakeWrangler(...createAnswers())
    const project = setup(wrangler)

    const { code, out, err } = await project.run(['token', 'create', '--label', 'ci'])

    expect(err).toEqual([])
    expect(code).toBe(0)
    expect(wrangler.calls.map((call) => call.args)).toEqual([
      ['d1', 'execute', 'DB', '--local', '--json', '--command', CONTEXT_QUERY],
      [
        'd1',
        'execute',
        'DB',
        '--local',
        '--json',
        '--command',
        insertSql("'ci'", '["content:read","content:write"]', IN_90_DAYS),
      ],
    ])
    expect(wrangler.calls[1]?.args[6]).not.toContain(SECRET)
    expect(out).toEqual([
      [
        `Created token ${TOKEN_ID} for the site "blog".`,
        '',
        'Label    ci',
        'Scopes   content:read content:write',
        `Expires  ${IN_90_DAYS} (in 90 days)`,
        '',
        'The token. It is shown only once: Hollware keeps just its hash.',
        '',
        SECRET,
      ].join('\n'),
    ])
    expect(out.join('\n').split(SECRET)).toHaveLength(2)
  })

  it("makes the token of an agent member with --member, which it checks, of an author's scopes at most", async () => {
    const agent = 'usr_01JAB3XQ8ZK4M6N2P5R7S9T0VX'
    const wrangler = fakeWrangler(
      d1([{ id: 'blog' }], [{ id: OWNER_ID }]),
      d1([{ id: agent, name: 'gateway' }]),
      d1([]),
    )
    const project = setup(wrangler)

    const { code, out, err } = await project.run([
      'token',
      'create',
      '--label',
      'executor',
      '--member',
      agent,
      '--expires-at',
      '2027-06-30',
    ])
    const publishing = await project.run([
      'token',
      'create',
      '--label',
      'executor',
      '--member',
      agent,
      '--scopes',
      'content:read,content:publish',
    ])

    expect([code, err]).toEqual([0, []])
    expect(wrangler.calls.map((call) => call.args[6])).toEqual([
      CONTEXT_QUERY,
      `SELECT users.id AS id, users.name AS name FROM members JOIN users ON users.id = members.user_id WHERE members.site_id = 'blog' AND members.user_id = '${agent}' AND users.kind = 'agent';`,
      insertSql(
        "'executor'",
        '["content:read","content:write"]',
        '2027-06-30T00:00:00.000Z',
      ).replace(`'${OWNER_ID}'`, `'${agent}'`),
    ])
    expect(out[0]?.split('\n').slice(0, 5)).toEqual([
      `Created token ${TOKEN_ID} for the agent ${agent} of the site "blog".`,
      '',
      'Label    executor',
      'Scopes   content:read content:write',
      'Expires  2027-06-30T00:00:00.000Z (in 261 days)',
    ])
    expect([publishing.code, publishing.err]).toEqual([
      1,
      [
        'hollware token create: an agent\'s token never holds content:publish: choose among content:read, content:write, review:read, review:comment. An agent writes drafts and asks for review, and a person publishes. Run "hollware token create --help" for the options.',
      ],
    ])
    expect(wrangler.calls).toHaveLength(3)
    expect(
      (await project.run(['token', 'create', '--label', 'x', '--member', agent, '--read'])).err,
    ).toEqual([
      'hollware token create: --member and --read cannot be used together: an agent gets a personal token. Run "hollware token create --help" for the options.',
    ])
  })

  it('refuses --member for a user that is no agent member of the site, and writes nothing', async () => {
    const person = 'usr_01JAB3XQ8ZK4M6N2P5R7S9T0VX'
    const wrangler = fakeWrangler(d1([{ id: 'blog' }], [{ id: OWNER_ID }]), d1([]))
    const project = setup(wrangler)

    const { code, err } = await project.run(['token', 'create', '--label', 'x', '--member', person])

    expect([code, err]).toEqual([
      1,
      [
        `hollware token create: ${person} is no agent member of the site "blog". "hollware agent list" shows the ones that are.`,
      ],
    ])
    expect(wrangler.calls).toHaveLength(2)
  })

  it('refuses an --expires-at of the past or that is no date, before it calls wrangler', async () => {
    const wrangler = fakeWrangler()
    const project = setup(wrangler)

    const past = await project.run([
      'token',
      'create',
      '--label',
      'x',
      '--expires-at',
      '2026-10-12',
    ])
    const word = await project.run(['token', 'create', '--label', 'x', '--expires-at', 'tomorrow'])

    expect([past.code, word.code]).toEqual([1, 1])
    expect(past.err).toEqual([
      'hollware token create: invalid --expires-at "2026-10-12": use a date or time of the future, such as 2027-06-30 or 2027-06-30T18:00:00Z. Run "hollware token create --help" for the options.',
    ])
    expect(wrangler.calls).toEqual([])
  })

  it('makes a read token with --read: hw_read_, content:read and the kind read, printed once', async () => {
    const wrangler = fakeWrangler(...createAnswers())
    const project = setup(wrangler)
    const secret = `hw_read_${'2'.repeat(52)}`

    const { code, out, err } = await project.run(['token', 'create', '--label', 'site', '--read'])
    const refused = await project.run([
      'token',
      'create',
      '--label',
      'site',
      '--read',
      '--scopes',
      'content:write',
    ])

    expect(err).toEqual([])
    expect(code).toBe(0)
    expect(wrangler.calls[1]?.args[6]).toBe(
      `INSERT INTO tokens (id, site_id, user_id, label, hash, scopes, expires_at, created_at, updated_at, kind) VALUES ('${TOKEN_ID}', 'blog', '${OWNER_ID}', 'site', '269a65ac0cce4966bd7249c4d1c7ed1630d16df2900df4a04839632e04fd8158', '["content:read"]', NULL, '${NOW}', '${NOW}', 'read');`,
    )
    expect(out[0]?.split('\n')[0]).toBe(`Created read token ${TOKEN_ID} for the site "blog".`)
    expect(out.join('\n').split(secret)).toHaveLength(2)
    expect([refused.code, refused.err]).toEqual([
      1,
      [
        'hollware token create: --read and --scopes cannot be used together: a read token only reads. Run "hollware token create --help" for the options.',
      ],
    ])
    expect(wrangler.calls).toHaveLength(2)
  })

  it.each([
    [
      ['--scopes', 'content:write,content:read,content:write', '--expires-in-days', '30'],
      '["content:write","content:read"]',
      '2026-11-11T12:00:00.000Z',
      '30 days',
    ],
    [
      ['--scopes', 'content:publish, schema:admin'],
      '["content:publish","schema:admin"]',
      IN_90_DAYS,
      '90 days',
    ],
    [['--no-expiry'], '["content:read","content:write"]', null, 'never'],
    [
      ['--expires-in-days', '1'],
      '["content:read","content:write"]',
      '2026-10-13T12:00:00.000Z',
      '1 day',
    ],
    [
      ['--expires-in-days', '365'],
      '["content:read","content:write"]',
      '2027-10-12T12:00:00.000Z',
      '365 days',
    ],
  ])(
    'takes the scopes, the expiry and the site from the flags %j',
    async (flags, scopes, expiresAt, days) => {
      const wrangler = fakeWrangler(...createAnswers())
      const project = setup(wrangler)

      const { code, out } = await project.run([
        'token',
        'create',
        '--label',
        'ci',
        '--site',
        'blog',
        ...flags,
      ])

      expect(code).toBe(0)
      expect(wrangler.calls[1]?.args[6]).toBe(insertSql("'ci'", scopes, expiresAt))
      expect(out[0]).toContain(
        expiresAt === null
          ? 'Expires  never (revoke it with hollware token revoke)'
          : `Expires  ${expiresAt} (in ${days})`,
      )
    },
  )

  it('chooses the site named when the database has several', async () => {
    const wrangler = fakeWrangler(d1([{ id: 'blog' }, { id: 'docs' }], [{ id: OWNER_ID }]), d1([]))
    const project = setup(wrangler)

    const { code, out } = await project.run(['token', 'create', '--label', 'ci', '--site', 'docs'])

    expect(code).toBe(0)
    expect(wrangler.calls[1]?.args[6]).toBe(
      insertSql("'ci'", '["content:read","content:write"]', IN_90_DAYS, 'docs'),
    )
    expect(out[0]?.split('\n')[0]).toBe(`Created token ${TOKEN_ID} for the site "docs".`)
  })

  it.each([
    ["x'); DROP TABLE tokens; --", "'x''); DROP TABLE tokens; --'"],
    ["Sergio's laptop", "'Sergio''s laptop'"],
    ["' OR '1'='1", "''' OR ''1''=''1'"],
    ["\\'); SELECT 1; --", "'\\''); SELECT 1; --'"],
  ])('writes the hostile label %j as one string literal', async (label, literal) => {
    const wrangler = fakeWrangler(...createAnswers())
    const project = setup(wrangler)

    const { code, out } = await project.run(['token', 'create', '--label', label])

    expect(code).toBe(0)
    expect(wrangler.calls[1]?.args[6]).toBe(
      insertSql(literal, '["content:read","content:write"]', IN_90_DAYS),
    )
    expect(out[0]).toContain(`Label    ${label}\n`)
  })

  it('trims the label it stores', async () => {
    const wrangler = fakeWrangler(...createAnswers())
    const project = setup(wrangler)

    await project.run(['token', 'create', '--label', '  ci  '])

    expect(wrangler.calls[1]?.args[6]).toBe(
      insertSql("'ci'", '["content:read","content:write"]', IN_90_DAYS),
    )
  })

  it.each([
    [
      [],
      /^hollware token create: --label is required: say what the token is for, such as "ci" or "claude-code"\. Run "hollware token create --help" for the options\.$/,
    ],
    [['--label', 'a\nb'], /^hollware token create: invalid --label "a\\nb": /],
    [['--label', 'a'.repeat(65)], /^hollware token create: invalid --label "a{65}": /],
    [['--label', ''], /^hollware token create: invalid --label "": /],
    [
      ['--label', 'ci', '--scopes', 'content:admin'],
      /^hollware token create: invalid --scopes: "content:admin" is not a scope\. Choose from content:read, content:write, content:publish, schema:admin, site:owner, review:read, review:comment\./,
    ],
    [
      ['--label', 'ci', '--expires-in-days', '0'],
      /^hollware token create: invalid --expires-in-days "0": use a whole number of days from 1 to 365\./,
    ],
    [
      ['--label', 'ci', '--expires-in-days', '366'],
      /^hollware token create: invalid --expires-in-days "366": /,
    ],
    [
      ['--label', 'ci', '--expires-in-days', 'soon'],
      /^hollware token create: invalid --expires-in-days "soon": /,
    ],
    [
      ['--label', 'ci', '--expires-in-days', '30', '--no-expiry'],
      /^hollware token create: use one of --expires-in-days, --expires-at and --no-expiry\./,
    ],
    [['--label', 'ci', '--site', 'Blog'], /^hollware token create: invalid --site "Blog": /],
    [
      ['--label', 'ci', '--local', '--remote'],
      /^hollware token create: --local and --remote cannot be used together/,
    ],
    [['--label', 'ci', 'extra'], /^hollware token create: unexpected argument 'extra'\./],
  ])('rejects %j without touching wrangler', async (args, message) => {
    const wrangler = fakeWrangler()
    const project = setup(wrangler)

    const { code, out, err } = await project.run(['token', 'create', ...args])

    expect(code).toBe(1)
    expect(out).toEqual([])
    expect(err).toEqual([expect.stringMatching(message)])
    expect(wrangler.calls).toEqual([])
  })

  it.each([
    [
      'a database without a site',
      [d1([], [])],
      'hollware token create: the database has no site yet. Run "hollware init --site <key>" first.',
    ],
    [
      'a database without an owner',
      [d1([{ id: 'blog' }], [])],
      'hollware token create: the database has no owner yet. Run "hollware init --site <key>" first.',
    ],
    [
      'several sites and no --site',
      [d1([{ id: 'blog' }, { id: 'docs' }], [{ id: OWNER_ID }])],
      'hollware token create: the database has several sites (blog, docs): choose one with --site <key>.',
    ],
  ])('says what is missing in %s, and inserts nothing', async (_what, answers, message) => {
    const wrangler = fakeWrangler(...answers)
    const project = setup(wrangler)

    const { code, out, err } = await project.run(['token', 'create', '--label', 'ci'])

    expect(code).toBe(1)
    expect(out).toEqual([])
    expect(err).toEqual([message])
    expect(wrangler.calls).toHaveLength(1)
  })

  it('says what sites there are when --site names one that is not there', async () => {
    const wrangler = fakeWrangler(d1([{ id: 'blog' }], [{ id: OWNER_ID }]))
    const project = setup(wrangler)

    const { code, err } = await project.run(['token', 'create', '--label', 'ci', '--site', 'docs'])

    expect(code).toBe(1)
    expect(err).toEqual([
      'hollware token create: the database has no site "docs" (it has blog). Run "hollware init --site docs" to create it.',
    ])
    expect(wrangler.calls).toHaveLength(1)
  })

  it('prints no token when wrangler fails', async () => {
    const wrangler = fakeWrangler(
      d1([{ id: 'blog' }], [{ id: OWNER_ID }]),
      d1Failed('UNIQUE constraint failed: tokens.hash: SQLITE_CONSTRAINT'),
    )
    const project = setup(wrangler)

    const { code, out, err } = await project.run(['token', 'create', '--label', 'ci'])

    expect(code).toBe(1)
    expect(out).toEqual([])
    expect(err).toEqual([
      'hollware token create: wrangler could not run the SQL: UNIQUE constraint failed: tokens.hash: SQLITE_CONSTRAINT',
    ])
  })
})

const LIST_SQL =
  "SELECT tokens.id AS id, tokens.label AS label, tokens.scopes AS scopes, tokens.expires_at AS expires_at, tokens.revoked_at AS revoked_at, tokens.last_used_at AS last_used_at, tokens.created_at AS created_at, users.name AS user_name, users.kind AS user_kind FROM tokens JOIN users ON users.id = tokens.user_id WHERE tokens.site_id = 'blog' ORDER BY tokens.created_at, tokens.id;"

describe('hollware token list', () => {
  it('shows the tokens of the site as a table, whose each is, and never a hash', async () => {
    const wrangler = fakeWrangler(
      d1([{ id: 'blog' }]),
      d1([
        {
          id: 'tok_01JAB3XQ8ZK4M6N2P5R7S9T0VW',
          label: 'hollware init',
          scopes: '["content:read","content:write","content:publish","schema:admin"]',
          expires_at: '2027-01-10T12:00:00.000Z',
          revoked_at: null,
          last_used_at: '2026-10-12T11:00:00.000Z',
          created_at: '2026-10-12T10:00:00.000Z',
          user_name: 'Sergio',
          user_kind: 'person',
          hash: 'f'.repeat(64),
        },
        {
          id: 'tok_01JAB3XQ8ZK4M6N2P5R7S9T0VX',
          label: 'ci',
          scopes: '["content:read"]',
          expires_at: '2026-10-01T00:00:00.000Z',
          revoked_at: null,
          last_used_at: null,
          created_at: '2026-09-01T00:00:00.000Z',
          user_name: 'gateway',
          user_kind: 'agent',
          hash: 'e'.repeat(64),
        },
        {
          id: 'tok_01JAB3XQ8ZK4M6N2P5R7S9T0VY',
          label: 'old laptop',
          scopes: '["content:read","content:write"]',
          expires_at: '2027-01-10T12:00:00.000Z',
          revoked_at: '2026-10-11T08:00:00.000Z',
          last_used_at: null,
          created_at: '2026-08-01T00:00:00.000Z',
          hash: 'd'.repeat(64),
        },
      ]),
    )
    const project = setup(wrangler)

    const { code, out, err } = await project.run(['token', 'list'])

    expect(err).toEqual([])
    expect(code).toBe(0)
    expect(wrangler.calls.map((call) => call.args)).toEqual([
      [
        'd1',
        'execute',
        'DB',
        '--local',
        '--json',
        '--command',
        'SELECT id FROM sites ORDER BY id;',
      ],
      ['d1', 'execute', 'DB', '--local', '--json', '--command', LIST_SQL],
    ])
    expect(wrangler.calls[1]?.args[6]).not.toContain('hash')
    expect(out).toEqual([
      [
        'ID                              LABEL          WHOSE          STATUS   EXPIRES                   LAST USED                 SCOPES',
        'tok_01JAB3XQ8ZK4M6N2P5R7S9T0VW  hollware init  Sergio         active   2027-01-10T12:00:00.000Z  2026-10-12T11:00:00.000Z  content:read content:write content:publish schema:admin',
        'tok_01JAB3XQ8ZK4M6N2P5R7S9T0VX  ci             agent gateway  expired  2026-10-01T00:00:00.000Z  never                     content:read',
        'tok_01JAB3XQ8ZK4M6N2P5R7S9T0VY  old laptop     owner          revoked  2027-01-10T12:00:00.000Z  never                     content:read content:write',
      ].join('\n'),
    ])
    expect(out.join('\n')).not.toMatch(/[def]{64}/)
  })

  it('says an expiry that is now is expired, and one a moment later is not', async () => {
    const wrangler = fakeWrangler(
      d1([{ id: 'blog' }]),
      d1([
        {
          id: 'tok_01JAB3XQ8ZK4M6N2P5R7S9T0VW',
          label: 'now',
          scopes: '[]',
          expires_at: NOW,
          revoked_at: null,
          last_used_at: null,
        },
        {
          id: 'tok_01JAB3XQ8ZK4M6N2P5R7S9T0VX',
          label: 'later',
          scopes: '[]',
          expires_at: '2026-10-12T12:00:00.001Z',
          revoked_at: null,
          last_used_at: null,
        },
      ]),
    )
    const project = setup(wrangler)

    const { out } = await project.run(['token', 'list'])

    const statuses = out[0]
      ?.split('\n')
      .slice(1)
      .map((line) => line.split(/\s{2,}/)[3])
    expect(statuses).toEqual(['expired', 'active'])
  })

  it('says when the site has no tokens', async () => {
    const wrangler = fakeWrangler(d1([{ id: 'blog' }]), d1([]))
    const project = setup(wrangler)

    expect(await project.run(['token', 'list'])).toEqual({
      code: 0,
      out: ['The site "blog" has no tokens.'],
      err: [],
    })
  })

  it('shows a value from the database without its control characters', async () => {
    const wrangler = fakeWrangler(
      d1([{ id: 'blog' }]),
      d1([
        {
          id: 'tok_01JAB3XQ8ZK4M6N2P5R7S9T0VW',
          label: 'evil\u001B[2Jlabel',
          scopes: 'not json \u001B[31m',
          expires_at: null,
          revoked_at: null,
          last_used_at: null,
        },
      ]),
    )
    const project = setup(wrangler)

    const { out } = await project.run(['token', 'list'])

    expect(out[0]).not.toContain('\u001B')
    expect(out[0]?.split('\n')[1]).toBe(
      'tok_01JAB3XQ8ZK4M6N2P5R7S9T0VW  evil?[2Jlabel  owner  active  never    never      not json ?[31m',
    )
  })

  it('lists the site named', async () => {
    const wrangler = fakeWrangler(d1([{ id: 'blog' }, { id: 'docs' }]), d1([]))
    const project = setup(wrangler)

    const { out } = await project.run(['token', 'list', '--site', 'docs'])

    expect(out).toEqual(['The site "docs" has no tokens.'])
    expect(wrangler.calls[1]?.args[6]).toBe(LIST_SQL.replace("'blog'", "'docs'"))
  })

  it('rejects a bad --site without touching wrangler', async () => {
    const wrangler = fakeWrangler()
    const project = setup(wrangler)

    const { code, err } = await project.run([
      'token',
      'list',
      '--site',
      "x'; DROP TABLE tokens; --",
    ])

    expect(code).toBe(1)
    expect(err).toEqual([
      `hollware token list: invalid --site "x'; DROP TABLE tokens; --": a site key is lowercase letters and digits joined by single hyphens, up to 64 characters, such as "blog" or "my-site". Run "hollware token list --help" for the options.`,
    ])
    expect(wrangler.calls).toEqual([])
  })
})

const ID = 'tok_01JAB3XQ8ZK4M6N2P5R7S9T0VW'

function revokeSql(site = ''): string {
  return `UPDATE tokens SET revoked_at = '${NOW}', updated_at = '${NOW}' WHERE id = '${ID}'${site} AND revoked_at IS NULL RETURNING id; SELECT id, revoked_at FROM tokens WHERE id = '${ID}'${site};`
}

describe('hollware token revoke', () => {
  it('sets revoked_at and says so', async () => {
    const wrangler = fakeWrangler(d1([{ id: ID }], [{ id: ID, revoked_at: NOW }]))
    const project = setup(wrangler)

    expect(await project.run(['token', 'revoke', ID])).toEqual({
      code: 0,
      out: [`Revoked token ${ID}.`],
      err: [],
    })
    expect(wrangler.calls.map((call) => call.args)).toEqual([
      ['d1', 'execute', 'DB', '--local', '--json', '--command', revokeSql()],
    ])
  })

  it('only touches a token of the site named', async () => {
    const wrangler = fakeWrangler(d1([{ id: ID }], [{ id: ID, revoked_at: NOW }]))
    const project = setup(wrangler)

    const { code } = await project.run(['token', 'revoke', ID, '--site', 'blog'])

    expect(code).toBe(0)
    expect(wrangler.calls[0]?.args[6]).toBe(revokeSql(" AND site_id = 'blog'"))
  })

  it('says when the token is already revoked, and exits 0', async () => {
    const wrangler = fakeWrangler(d1([], [{ id: ID, revoked_at: '2026-10-11T08:00:00.000Z' }]))
    const project = setup(wrangler)

    expect(await project.run(['token', 'revoke', ID])).toEqual({
      code: 0,
      out: [`Token ${ID} was already revoked at 2026-10-11T08:00:00.000Z. Nothing changed.`],
      err: [],
    })
  })

  it('says when the id does not exist, and exits 1', async () => {
    const wrangler = fakeWrangler(d1([], []), d1([], []))
    const project = setup(wrangler)

    expect(await project.run(['token', 'revoke', ID])).toEqual({
      code: 1,
      out: [],
      err: [
        `hollware token revoke: there is no token ${ID}. "hollware token list" shows the tokens.`,
      ],
    })
    expect((await project.run(['token', 'revoke', ID, '--site', 'docs'])).err).toEqual([
      `hollware token revoke: there is no token ${ID} in the site "docs". "hollware token list" shows the tokens.`,
    ])
  })

  it.each([
    [
      'no id',
      [],
      /^hollware token revoke: revoke takes the id of one token: hollware token revoke <id>\. Run "hollware token revoke --help"/,
    ],
    ['two ids', [ID, ID], /^hollware token revoke: revoke takes the id of one token/],
    ['an id that is too short', ['tok_x'], /^hollware token revoke: invalid token id "tok_x": /],
    [
      'the id of an entry',
      ['ent_01JAB3XQ8ZK4M6N2P5R7S9T0VW'],
      /^hollware token revoke: invalid token id "ent_/,
    ],
    ['an id with SQL after it', [`${ID}' OR '1'='1`], /^hollware token revoke: invalid token id /],
    ['an id in lowercase', [ID.toLowerCase()], /^hollware token revoke: invalid token id /],
  ])('rejects %s without touching wrangler', async (_what, args, message) => {
    const wrangler = fakeWrangler()
    const project = setup(wrangler)

    const { code, err } = await project.run(['token', 'revoke', ...args])

    expect(code).toBe(1)
    expect(err).toEqual([expect.stringMatching(message)])
    expect(wrangler.calls).toEqual([])
  })
})

describe('the token commands', () => {
  it.each([
    ['create', ['--label', 'ci'], () => createAnswers()],
    ['list', [], () => [d1([{ id: 'blog' }]), d1([])]],
    ['revoke', [ID], () => [d1([{ id: ID }], [{ id: ID, revoked_at: NOW }])]],
  ])(
    'pass --remote and --database to every wrangler call of %s',
    async (command, args, answers) => {
      const wrangler = fakeWrangler(...answers())
      const project = setup(wrangler, {})

      const { code } = await project.run([
        'token',
        command,
        ...args,
        '--remote',
        '--database',
        'blog-db',
      ])

      expect(code).toBe(0)
      expect(wrangler.calls.length).toBeGreaterThan(0)
      for (const call of wrangler.calls) {
        expect(call.args.slice(0, 5)).toEqual(['d1', 'execute', 'blog-db', '--remote', '--json'])
      }
    },
  )
})
