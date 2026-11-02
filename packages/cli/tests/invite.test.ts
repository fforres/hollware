import { describe, expect, it } from 'vite-plus/test'

import { d1, fakeWrangler } from './support/fake-wrangler.ts'
import { run } from './support/io.ts'
import { tempDirs, WRANGLER_JSONC, wranglerWithPublicUrl } from './support/project.ts'

const temp = tempDirs()
const SITES = 'SELECT id FROM sites ORDER BY id;'

function project() {
  const cwd = temp.make({
    'wrangler.jsonc': wranglerWithPublicUrl('https://cms.example.com'),
  })
  const wrangler = fakeWrangler(d1([{ id: 'blog' }]), d1([]))
  return { wrangler, run: (argv: string[]) => run(argv, { cwd, wrangler: wrangler.run }) }
}

describe('hollware invite', () => {
  it('inserts the invitation and prints its link once', async () => {
    const { wrangler, run: invite } = project()

    const { code, out, err } = await invite([
      'invite',
      '--role',
      'author',
      '--email',
      'ada@example.org',
    ])

    expect([code, err]).toEqual([0, []])
    expect(wrangler.calls.map((call) => call.args[6]?.split(' (')[0])).toEqual([
      SITES,
      'INSERT INTO invitations',
    ])
    expect(out).toEqual([
      [
        'Invited an author to the site "blog". The link works once, until 2026-10-19T12:00:00.000Z:',
        '',
        '  https://cms.example.com/setup#invitation=hw_inv_AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE',
      ].join('\n'),
    ])
  })

  it.each([
    ['admin', 'Invited an admin'],
    ['reviewer', 'Invited a reviewer'],
  ])('invites %s, with its article', async (role, said) => {
    const { wrangler, run: invite } = project()

    const { code, out } = await invite(['invite', '--role', role, '--email', 'ada@example.org'])

    expect(code).toBe(0)
    expect(wrangler.calls[1]?.args[6]).toContain(`, '${role}', NULL, 'ada@example.org', `)
    expect(out[0]?.split(' to the site')[0]).toBe(said)
  })

  it('refuses a new person without --email, and --email with --owner, before it touches wrangler', async () => {
    const { wrangler, run: invite } = project()

    const bare = await invite(['invite', '--role', 'editor'])
    const both = await invite(['invite', '--owner', '--email', 'ada@example.org'])

    expect([bare.code, bare.err]).toEqual([
      1,
      [
        'hollware invite: --email is required with --role: name the address of the person, such as --email ada@example.com. Run "hollware invite --help" for the options.',
      ],
    ])
    expect([both.code, both.err]).toEqual([
      1,
      [
        'hollware invite: --owner and --email cannot be used together: --email names a new person. Run "hollware invite --help" for the options.',
      ],
    ])
    expect(wrangler.calls).toEqual([])
  })

  it('names the address of the person with --email, in lowercase, and refuses one that is no address', async () => {
    const { wrangler, run: invite } = project()

    const sent = await invite(['invite', '--role', 'editor', '--email', 'Ada@Example.ORG'])
    const wrong = await invite([
      'invite',
      '--role',
      'editor',
      '--email',
      "ada'); DROP TABLE users;--",
    ])

    expect(sent.code).toBe(0)
    expect(wrangler.calls[1]?.args[6]).toMatch(
      /^INSERT INTO invitations \(id, site_id, hash, role, user_id, email, expires_at, used_at, created_at, updated_at\) VALUES \('inv_[0-9A-Z]{26}', 'blog', '[0-9a-f]{64}', 'editor', NULL, 'ada@example\.org', '2026-10-19T12:00:00\.000Z', NULL, /,
    )
    expect(wrong.code).toBe(1)
    expect(wrong.err.join('\n')).toContain('is not an email address')
    expect(wrangler.calls).toHaveLength(2)
  })

  it('makes a setup link for the owner of the site with --owner', async () => {
    const cwd = temp.make({
      'wrangler.jsonc': wranglerWithPublicUrl('https://cms.example.com'),
    })
    const wrangler = fakeWrangler(d1([{ id: 'blog' }]), d1([{ id: 'usr_OWNER' }]), d1([]))

    const { code, out } = await run(['invite', '--owner'], { cwd, wrangler: wrangler.run })

    expect(code).toBe(0)
    expect(wrangler.calls[1]?.args[6]).toBe(
      "SELECT user_id AS id FROM members WHERE site_id = 'blog' AND role = 'owner' ORDER BY created_at, user_id LIMIT 1;",
    )
    expect(wrangler.calls[2]?.args[6]).toMatch(/'blog', '[0-9a-f]{64}', 'owner', 'usr_OWNER', /)
    expect(out[0]).toMatch(/^A setup link for the owner \(usr_OWNER\) of the site "blog"/)
  })

  it('says so when the site has no owner, and refuses --owner with --role', async () => {
    const cwd = temp.make({ 'wrangler.jsonc': WRANGLER_JSONC })
    const wrangler = fakeWrangler(d1([{ id: 'blog' }]), d1([]))

    const none = await run(['invite', '--owner', '--url', 'https://cms.example.com'], {
      cwd,
      wrangler: wrangler.run,
    })
    const both = await run(['invite', '--owner', '--role', 'author'], {
      cwd,
      wrangler: wrangler.run,
    })

    expect(none.err).toEqual([
      'hollware invite: the site "blog" has no owner. Run "hollware init" to make one.',
    ])
    expect(both.code).toBe(1)
  })

  it('refuses a role other than admin, editor, author and reviewer', async () => {
    const { run: invite } = project()

    const { code, err } = await invite(['invite', '--role', 'owner'])

    expect([code, err]).toEqual([
      1,
      [
        'hollware invite: --role is required, and it is admin, editor, author or reviewer. Run "hollware invite --help" for the options.',
      ],
    ])
  })

  it('lists the invitations that wait, and revokes one of the site at once', async () => {
    const cwd = temp.make({ 'wrangler.jsonc': WRANGLER_JSONC })
    const id = 'inv_01JAB3XQ8ZK4M6N2P5R7S9T0VW'
    const wrangler = fakeWrangler(
      d1([{ id: 'blog' }]),
      d1([{ id, role: 'author', expires_at: '2026-10-19T12:00:00.000Z' }]),
      d1([{ id: 'blog' }]),
      d1([{ id }]),
    )

    const listed = await run(['invite', 'list'], { cwd, wrangler: wrangler.run })
    const revoked = await run(['invite', 'revoke', id], { cwd, wrangler: wrangler.run })

    expect(wrangler.calls.map((call) => call.args[6])).toEqual([
      SITES,
      "SELECT id, role, email, expires_at FROM invitations WHERE site_id = 'blog' AND used_at IS NULL AND revoked_at IS NULL AND expires_at > '2026-10-12T12:00:00.000Z' ORDER BY created_at, id;",
      SITES,
      "UPDATE invitations SET revoked_at = '2026-10-12T12:00:00.000Z', updated_at = '2026-10-12T12:00:00.000Z' WHERE id = 'inv_01JAB3XQ8ZK4M6N2P5R7S9T0VW' AND site_id = 'blog' AND used_at IS NULL AND revoked_at IS NULL RETURNING id;",
    ])
    expect([listed.code, listed.out]).toEqual([
      0,
      ['inv_01JAB3XQ8ZK4M6N2P5R7S9T0VW  author  until 2026-10-19T12:00:00.000Z'],
    ])
    expect([revoked.code, revoked.out]).toEqual([
      0,
      ['Revoked invitation inv_01JAB3XQ8ZK4M6N2P5R7S9T0VW: its link no longer works.'],
    ])
  })

  it('says so when no invitation waits, or when the one to revoke waits no more', async () => {
    const cwd = temp.make({ 'wrangler.jsonc': WRANGLER_JSONC })
    const wrangler = fakeWrangler(d1([{ id: 'blog' }]), d1([]), d1([{ id: 'blog' }]), d1([]))

    const listed = await run(['invite', 'list'], { cwd, wrangler: wrangler.run })
    const revoked = await run(['invite', 'revoke', 'inv_01JAB3XQ8ZK4M6N2P5R7S9T0VW'], {
      cwd,
      wrangler: wrangler.run,
    })
    const wrong = await run(['invite', 'revoke', 'tok_01JAB3XQ8ZK4M6N2P5R7S9T0VW'], {
      cwd,
      wrangler: wrangler.run,
    })

    expect(listed.out).toEqual(['No invitation waits in the site "blog".'])
    expect([revoked.code, revoked.err]).toEqual([
      1,
      [
        'hollware invite: no invitation inv_01JAB3XQ8ZK4M6N2P5R7S9T0VW waits in the site "blog". "hollware invite list" shows the ones that do.',
      ],
    ])
    expect([wrong.code, wrong.err]).toEqual([
      1,
      [
        expect.stringMatching(
          /^hollware invite: invalid invitation id .*tok_01JAB3XQ8ZK4M6N2P5R7S9T0VW.*: an invitation id is inv_ followed by 26 characters\./,
        ),
      ],
    ])
  })
})
