import { defineCollection, defineConfig } from '@hollware/core'
import { env } from 'cloudflare:workers'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as z from 'zod'

import { dropExpiredLines } from '../../src/audit/log.ts'
import { seedToken } from '../auth/support.ts'
import { ENTRY_ID, INPUTS, connect as connectMcp } from '../mcp/support.ts'
import { adminPerson, call } from '../http/admin-session.ts'
import { boot, NOW, PUBLIC_URL, restoreLogs, SITE_KEY } from '../http/support.ts'
import { connect as connectDb } from '../../src/db/d1.ts'
import { createInvitation, createSession } from '../../src/identity/store.ts'
import { softAuthenticator } from '../support/authenticator.ts'

vi.setConfig({ testTimeout: 60_000 })

const MASTER = '0123456789abcdef0123456789abcdef'
const ADDRESS = '203.0.113.7'
const ADDRESS_HASH = '3adb6bc012ba02c32d9137824abd625ca89d1e621f4bf62c2065685c563e01b8'

function never(): never {
  throw new Error('the test config has no site')
}

afterEach(() => {
  restoreLogs()
})

function configKeeping(ipAddresses: 'off' | 'hashed', retentionDays: number | null = null) {
  return defineConfig({
    sites: {
      [SITE_KEY]: {
        locales: ['en', 'es'],
        defaultLocale: 'en',
        collections: {
          blog: defineCollection({
            schema: z.object({ title: z.string().min(1) }),
            routes: { en: '/blog/:slug/', es: '/es/blog/:slug/' },
          }),
        },
        audit: { ipAddresses, retentionDays },
      },
    },
  })
}

interface LineRow {
  action: string
  outcome: string
  error_code: string | null
  actor_kind: string
  actor_user_id: string | null
  actor_token_id: string | null
  actor_client_id: string | null
  actor_meta: string | null
  target_type: string | null
  target_id: string | null
  detail: string | null
  ip_hash: string | null
}

async function linesSince(since: string): Promise<LineRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT action, outcome, error_code, actor_kind, actor_user_id, actor_token_id, actor_client_id,
            actor_meta, target_type, target_id, detail, ip_hash
     FROM audit_log WHERE site_id = ?1 AND created_at >= ?2 ORDER BY created_at, id`,
  )
    .bind(SITE_KEY, since)
    .all<LineRow>()
  return results
}

let step = 0
function moment(): string {
  step += 1
  return new Date(Date.parse(NOW) + step * 600_000).toISOString()
}

describe('the activity log of the operations', () => {
  it('writes a line for a write, with the token and what the client declared, and none for a read', async () => {
    const at = moment()
    const worker = boot({ now: at })
    const seeded = await seedToken(env.DB, SITE_KEY)
    const { client } = await connectMcp(worker.endpoint(seeded.token), { era: '2026' })

    await client.callTool({ name: 'describe_site', arguments: {} })
    await client.callTool({ name: 'create_draft', arguments: INPUTS.create_draft })
    await client.close()
    await worker.settle()

    const lines = await linesSince(at)
    expect(lines.map(({ actor_meta: _meta, ...rest }) => rest)).toEqual([
      {
        action: 'create_draft',
        outcome: 'ok',
        error_code: null,
        actor_kind: 'token',
        actor_user_id: seeded.userId,
        actor_token_id: seeded.tokenId,
        actor_client_id: null,
        target_type: 'entry',
        target_id: ENTRY_ID,
        detail: JSON.stringify({
          answer: 'saved',
          input: { collection: 'blog', locale: 'en', slug: 'hello-world' },
        }),
        ip_hash: null,
      },
    ])
    expect(JSON.parse(lines[0]?.actor_meta ?? 'null')).toMatchObject({ name: 'probe' })
  })

  it('writes a refusal of a missing scope as denied', async () => {
    const at = moment()
    const worker = boot({ now: at })
    const reader = await seedToken(env.DB, SITE_KEY, { scopes: ['content:read'] })
    const { client } = await connectMcp(worker.endpoint(reader.token), { era: '2026' })

    await client
      .callTool({ name: 'create_draft', arguments: INPUTS.create_draft })
      .catch(() => undefined)
    await client.close()
    await worker.settle()

    expect(
      (await linesSince(at)).map((line) => [
        line.action,
        line.outcome,
        line.error_code,
        line.actor_token_id,
      ]),
    ).toEqual([['create_draft', 'denied', 'insufficient_scope', reader.tokenId]])
  })
})

describe('the address of a request', () => {
  it.each([
    ['keeps nothing of it when the site keeps no addresses', 'off', null],
    ['keeps only its hash, keyed by the site, when the site keeps them', 'hashed', ADDRESS_HASH],
  ] as const)('%s', async (_name, ipAddresses, expected) => {
    const at = moment()
    const worker = boot({
      now: at,
      config: configKeeping(ipAddresses),
      bindings: { HOLLWARE_SECRET: MASTER },
    })
    const seeded = await seedToken(env.DB, SITE_KEY)

    await worker.send('/v1/ops/create_draft', {
      method: 'POST',
      token: seeded.token,
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': ADDRESS },
      body: JSON.stringify(INPUTS.create_draft),
    })

    expect((await linesSince(at)).map((line) => line.ip_hash)).toEqual([expected])
  })
})

describe("the admin's changes of identity", () => {
  it('writes a token made, as the person in the admin, with what was made and never its secret', async () => {
    const at = moment()
    const worker = boot({ now: at })
    const owner = await adminPerson(worker, 'owner')

    const made = await (
      await call(worker, owner.access, '/v1/admin/tokens', {
        label: 'CI reader',
        scopes: ['content:read'],
        expiresInDays: null,
      })
    ).json<{ id: string; secret: string }>()

    const lines = await linesSince(at)
    expect(lines.map(({ actor_client_id: _client, ...rest }) => rest)).toEqual([
      {
        action: 'token.create',
        outcome: 'ok',
        error_code: null,
        actor_kind: 'user',
        actor_user_id: owner.userId,
        actor_token_id: null,
        actor_meta: null,
        target_type: 'token',
        target_id: made.id,
        detail: JSON.stringify({
          kind: 'personal',
          label: 'CI reader',
          scopes: ['content:read'],
          expiresAt: null,
        }),
        ip_hash: null,
      },
    ])
    const admin = await (await worker.send('/admin/config.json')).json<{ clientId: string }>()
    expect(lines[0]?.actor_client_id).toBe(admin.clientId)
    expect(JSON.stringify(lines)).not.toContain(made.secret)
  })

  it('writes each change of the admin by its action, on what it acted', async () => {
    const at = moment()
    const worker = boot({ now: at })
    const owner = await adminPerson(worker, 'owner')
    const editor = await adminPerson(worker, 'editor')
    const made = await (
      await call(worker, owner.access, '/v1/admin/tokens', {
        label: 'to revoke',
        scopes: ['content:read'],
      })
    ).json<{ id: string }>()

    await call(worker, owner.access, `/v1/admin/tokens/${made.id}/revoke`, {})
    const invited = await (
      await call(worker, owner.access, '/v1/admin/invitations', {
        role: 'author',
        email: 'ana@example.org',
      })
    ).json<{ id: string }>()
    await call(worker, owner.access, `/v1/admin/invitations/${invited.id}/revoke`, {})
    await call(worker, owner.access, '/v1/admin/people/role', {
      userId: editor.userId,
      role: 'author',
    })
    await call(worker, owner.access, '/v1/admin/people/remove', { userId: editor.userId })
    await call(worker, owner.access, '/v1/admin/account/sessions/end', {})

    expect(
      (await linesSince(at)).map((line) => [
        line.action,
        line.outcome,
        line.actor_user_id === owner.userId,
        line.target_type,
        line.target_id,
        line.detail,
      ]),
    ).toEqual([
      ['token.create', 'ok', true, 'token', made.id, expect.any(String)],
      ['token.revoke', 'ok', true, 'token', made.id, null],
      ['invitation.create', 'ok', true, 'invitation', invited.id, '{"role":"author","days":7}'],
      ['invitation.revoke', 'ok', true, 'invitation', invited.id, null],
      ['member.role', 'ok', true, 'user', editor.userId, '{"role":"author"}'],
      ['member.remove', 'ok', true, 'user', editor.userId, null],
      ['session.end_all', 'ok', true, 'user', owner.userId, '{"sessions":1,"adminGrants":1}'],
    ])
  })

  it('writes a refused change as failed, with the code the admin got', async () => {
    const at = moment()
    const worker = boot({ now: at })
    const owner = await adminPerson(worker, 'owner')
    await env.DB.prepare(
      "DELETE FROM members WHERE site_id = ?1 AND role = 'owner' AND user_id != ?2",
    )
      .bind(SITE_KEY, owner.userId)
      .run()

    const answer = await call(worker, owner.access, '/v1/admin/people/role', {
      userId: owner.userId,
      role: 'editor',
    })

    expect(answer.status).toBe(409)
    expect(
      (await linesSince(at)).map((line) => [line.action, line.outcome, line.error_code]),
    ).toEqual([['member.role', 'failed', 'conflict']])
  })
})

describe("a person's own sign-in", () => {
  it('writes the acceptance of an invitation and a sign-in with a passkey, as the person', async () => {
    const at = moment()
    const worker = boot({ now: at })
    await worker.ready()
    const invitation = await createInvitation(connectDb(env.DB), {
      site: SITE_KEY,
      role: 'author',
      userId: null,
      now: new Date(at),
      days: 7,
      email: `new-${crypto.randomUUID().slice(0, 8)}@example.org`,
    })
    const authenticator = await softAuthenticator(PUBLIC_URL)
    const post = async <T>(path: string, body: unknown) =>
      (
        await worker.send(path, {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin: PUBLIC_URL },
          body: JSON.stringify(body),
        })
      ).json<T>()
    type Options = { challengeId: string; options: { challenge: string; user: { id: string } } }

    const registration = await post<Options>('/auth/register/options', {
      invitation: invitation.secret,
    })
    await post('/auth/register/verify', {
      challengeId: registration.challengeId,
      response: await authenticator.register(registration.options),
      name: 'Ada',
      label: 'Laptop',
    })
    const signIn = await post<Options>('/auth/signin/options', {})
    await post('/auth/signin/verify', {
      challengeId: signIn.challengeId,
      response: await authenticator.authenticate(signIn.options),
    })

    const lines = await linesSince(at)
    const person = lines[0]?.actor_user_id
    expect(
      lines.map((line) => [line.action, line.actor_kind, line.actor_user_id, line.target_id]),
    ).toEqual([
      ['invitation.accept', 'user', person, person],
      ['session.sign_in', 'user', person, person],
    ])
    expect(person).toMatch(/^usr_/)
  })

  it('writes a sign-out in each site the person is a member of', async () => {
    const at = moment()
    const sites = configKeeping('off').sites ?? {}
    const worker = boot({
      now: at,
      config: defineConfig({ sites: { ...sites, 'second-site': sites[SITE_KEY] ?? never() } }),
    })
    const owner = await adminPerson(worker, 'owner', ['second-site'])
    const session = await createSession(connectDb(env.DB), {
      userId: owner.userId,
      now: new Date(at),
      hours: 12,
    })

    await worker.send('/authorize/signout', {
      method: 'POST',
      headers: { cookie: `hollware_session=${session.secret}`, origin: PUBLIC_URL },
    })

    const { results } = await env.DB.prepare(
      'SELECT site_id, action, actor_kind, actor_user_id FROM audit_log WHERE actor_user_id = ?1 ORDER BY site_id',
    )
      .bind(owner.userId)
      .all()
    expect(results).toEqual([
      {
        site_id: SITE_KEY,
        action: 'session.sign_out',
        actor_kind: 'user',
        actor_user_id: owner.userId,
      },
      {
        site_id: 'second-site',
        action: 'session.sign_out',
        actor_kind: 'user',
        actor_user_id: owner.userId,
      },
    ])
  })
})

describe('the retention of a site', () => {
  it('deletes the lines past it, and only those', async () => {
    const site = `kept-${crypto.randomUUID().slice(0, 8)}`
    await env.DB.prepare(
      "INSERT INTO sites (id, definition, created_at, updated_at) VALUES (?1, ?2, 'now', 'now')",
    )
      .bind(site, JSON.stringify({ audit: { retentionDays: 30 } }))
      .run()
    const now = new Date()
    const write = (id: string, daysAgo: number) =>
      env.DB.prepare(
        "INSERT INTO audit_log (id, site_id, action, outcome, actor_kind, created_at, updated_at) VALUES (?1, ?2, 'publish', 'ok', 'user', ?3, ?3)",
      )
        .bind(id, site, new Date(now.getTime() - daysAgo * 86_400_000).toISOString())
        .run()
    await write('aud_01JAB3XQ8ZK4M6N2P5R7S9T0V1', 31)
    await write('aud_01JAB3XQ8ZK4M6N2P5R7S9T0V2', 29)

    const dropped = await dropExpiredLines(
      env.DB,
      { key: site, audit: { ipAddresses: 'off', retentionDays: 30 } },
      now,
    )

    const { results } = await env.DB.prepare('SELECT id FROM audit_log WHERE site_id = ?1')
      .bind(site)
      .all<{ id: string }>()
    expect([dropped, results.map((row) => row.id)]).toEqual([1, ['aud_01JAB3XQ8ZK4M6N2P5R7S9T0V2']])
  })

  it('deletes nothing of a site that keeps every line', async () => {
    expect(
      await dropExpiredLines(
        env.DB,
        { key: SITE_KEY, audit: { ipAddresses: 'off', retentionDays: null } },
        new Date('2040-01-01T00:00:00.000Z'),
      ),
    ).toBe(0)
  })
})

describe('the activity route of the admin', () => {
  it('answers owners alone, newest first, filtered, a page at a time', async () => {
    const at = moment()
    const worker = boot({ now: at })
    const owner = await adminPerson(worker, 'owner')
    const editor = await adminPerson(worker, 'editor')
    for (const label of ['first', 'second', 'third']) {
      worker.clock.set(new Date(Date.parse(worker.clock.now().toISOString()) + 1000).toISOString())
      await call(worker, owner.access, '/v1/admin/tokens', { label, scopes: ['content:read'] })
    }

    const refused = await call(worker, editor.access, '/v1/admin/activity')
    const first = await (
      await call(
        worker,
        owner.access,
        `/v1/admin/activity?action=token.create&from=${encodeURIComponent(at)}&limit=2`,
      )
    ).json<{ lines: { detail: { label: string } }[]; nextCursor: string | null }>()
    const second = await (
      await call(
        worker,
        owner.access,
        `/v1/admin/activity?action=token.create&from=${encodeURIComponent(at)}&limit=2&cursor=${first.nextCursor ?? ''}`,
      )
    ).json<{ lines: { detail: { label: string } }[]; nextCursor: string | null }>()

    expect(refused.status).toBe(403)
    expect([
      first.lines.map((line) => line.detail.label),
      second.lines.map((line) => line.detail.label),
      second.nextCursor,
    ]).toEqual([['third', 'second'], ['first'], null])
  })

  it('refuses a filter or a cursor that is not valid', async () => {
    const worker = boot({ now: moment() })
    const owner = await adminPerson(worker, 'owner')

    const answers = await Promise.all(
      ['?action=drop_table', '?from=yesterday', '?cursor=bm90LWEtY3Vyc29y'].map(async (query) => {
        const answer = await call(worker, owner.access, `/v1/admin/activity${query}`)
        return [answer.status, (await answer.json<{ code: string }>()).code]
      }),
    )

    expect(answers).toEqual([
      [400, 'invalid_input'],
      [400, 'invalid_input'],
      [400, 'invalid_input'],
    ])
  })

  it('gives the lines as CSV: a header, a row each, quoted where they need it (tests/audit/csv.test.ts)', async () => {
    const at = moment()
    const worker = boot({ now: at })
    const owner = await adminPerson(worker, 'owner')
    await call(worker, owner.access, '/v1/admin/tokens', {
      label: '=HYPERLINK("https://evil.example")',
      scopes: ['content:read'],
    })

    const answer = await call(
      worker,
      owner.access,
      `/v1/admin/activity.csv?action=token.create&from=${encodeURIComponent(at)}`,
    )
    const [header, row, end] = (await answer.text()).split('\r\n')

    expect([answer.headers.get('content-type'), header, end]).toEqual([
      'text/csv; charset=utf-8',
      'at,action,outcome,error_code,actor_kind,actor_user_id,actor_name,actor_token_id,actor_token_label,actor_client_id,actor_declared,target_type,target_id,detail,request_id,ip_hash',
      '',
    ])
    expect(row).toContain(
      `"{""kind"":""personal"",""label"":""=HYPERLINK(\\""https://evil.example\\"")""`,
    )
  })
})
