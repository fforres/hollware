import { env } from 'cloudflare:workers'
import { describe, expect, it, vi } from 'vitest'

import { connect } from '../../src/db/d1.ts'
import { createInvitation, redeemInvitation } from '../../src/identity/store.ts'
import { seedToken } from '../auth/support.ts'
import { insertEntries } from '../db/support.ts'
import { adminPerson, adminToken, call } from './admin-session.ts'
import { boot, NOW, OTHER_SITE_KEY, SITE_KEY } from './support.ts'

vi.setConfig({ testTimeout: 60_000 })

describe("the admin's own routes", () => {
  it("refuse a personal token, even an owner's, and an admin token without schema:admin", async () => {
    const worker = boot()
    const owner = await seedToken(env.DB, SITE_KEY)
    const editor = await adminToken(worker, 'editor')

    const personal = await call(worker, owner.token, '/v1/admin/tokens')
    const scoped = await call(worker, editor, '/v1/admin/tokens')

    expect(personal.status).toBe(403)
    expect(await personal.json()).toMatchObject({ message: 'Only the admin may do this.' })
    expect(scoped.status).toBe(403)
    expect(scoped.headers.get('www-authenticate')).toContain('scope="schema:admin"')
  })

  it('say who is signed in to any role, with the sites of this deployment they may switch to', async () => {
    const worker = boot()
    const author = await adminToken(worker, 'author', [OTHER_SITE_KEY])

    const me = await call(worker, author, '/v1/admin/me')
    const tokens = await call(worker, author, '/v1/admin/tokens')

    expect(me.status).toBe(200)
    expect(await me.json()).toMatchObject({
      site: SITE_KEY,
      scopes: ['content:read', 'content:write', 'review:read', 'review:comment'],
      sites: [{ site: SITE_KEY, role: 'author' }],
    })
    expect(tokens.status).toBe(403)
  })

  it('list the sites in the trash that the person owns, and no other', async () => {
    const worker = boot()
    const owner = await adminPerson(worker, 'owner')
    const [mine, theirs] = [
      `trashed-${crypto.randomUUID().slice(0, 6)}`,
      `kept-${crypto.randomUUID().slice(0, 6)}`,
    ]
    for (const [site, role] of [
      [mine, 'owner'],
      [theirs, 'editor'],
    ] as const) {
      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO sites (id, definition, version, deleted_at, created_at, updated_at) VALUES (?1, '{}', 2, ?2, ?2, ?2)",
        ).bind(site, NOW),
        env.DB.prepare(
          'INSERT INTO members (id, site_id, user_id, role, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)',
        ).bind(`mbr_${crypto.randomUUID()}`, site, owner.userId, role, NOW),
      ])
    }

    const me = await (await call(worker, owner.access, '/v1/admin/me')).json<{ trash: unknown[] }>()

    expect(me.trash).toEqual([{ site: mine, deletedAt: NOW }])
  })

  it('make a token with the scopes its maker has, once in clear, and revoke it', async () => {
    const worker = boot()
    const owner = await adminToken(worker, 'owner')

    const made = await call(worker, owner, '/v1/admin/tokens', {
      label: 'Agent',
      scopes: ['content:read', 'content:publish', 'everything'],
    })
    const created = await made.json<{ id: string; secret: string; scopes: string[] }>()
    const listed = await (
      await call(worker, owner, '/v1/admin/tokens')
    ).json<{
      tokens: Record<string, unknown>[]
    }>()
    const before = await worker.send('/v1/site', { token: created.secret })
    await call(worker, owner, `/v1/admin/tokens/${created.id}/revoke`, {})
    const after = await worker.send('/v1/site', { token: created.secret })

    expect(made.status).toBe(201)
    expect(created.scopes).toEqual(['content:read', 'content:publish'])
    expect(created.secret).toMatch(/^hw_pat_/)
    const row = listed.tokens.find((token) => token['id'] === created.id)
    expect(row).toMatchObject({ label: 'Agent', scopes: ['content:read', 'content:publish'] })
    expect(row).not.toHaveProperty('hash')
    expect(JSON.stringify(listed)).not.toContain(created.secret)
    expect([before.status, after.status]).toEqual([200, 401])
  })

  it('make a personal token that expires after 90 days when no days are given, one that never does when asked, a read token that never expires, and one with its days', async () => {
    const worker = boot()
    const owner = await adminToken(worker, 'owner')

    const standard = await (
      await call(worker, owner, '/v1/admin/tokens', { label: 'CI', scopes: ['content:read'] })
    ).json<{ expiresAt: string | null }>()
    const forever = await (
      await call(worker, owner, '/v1/admin/tokens', {
        label: 'Pipeline',
        scopes: ['content:read'],
        expiresInDays: null,
      })
    ).json<{ expiresAt: string | null }>()
    const site = await (
      await call(worker, owner, '/v1/admin/tokens', { label: 'Site', kind: 'read' })
    ).json<{ expiresAt: string | null }>()
    const month = await (
      await call(worker, owner, '/v1/admin/tokens', {
        label: 'Laptop',
        scopes: ['content:read'],
        expiresInDays: 30,
      })
    ).json<{ expiresAt: string | null }>()
    const wrong = await call(worker, owner, '/v1/admin/tokens', {
      label: 'Bad',
      scopes: ['content:read'],
      expiresInDays: 0,
    })

    expect(standard.expiresAt).toBe('2027-01-11T12:00:00.000Z')
    expect(forever.expiresAt).toBe(null)
    expect(site.expiresAt).toBe(null)
    expect(month.expiresAt).toBe(new Date(Date.parse(NOW) + 30 * 86_400_000).toISOString())
    expect(wrong.status).toBe(400)
  })

  it('make a read token that reads and nothing else, whatever scopes it asks for', async () => {
    const worker = boot()
    const owner = await adminToken(worker, 'owner')

    const made = await call(worker, owner, '/v1/admin/tokens', {
      label: 'Site',
      kind: 'read',
      scopes: ['content:write'],
    })
    const created = await made.json<{ secret: string; kind: string; scopes: string[] }>()
    const read = await worker.send('/v1/site', { token: created.secret })
    const listed = await (
      await call(worker, owner, '/v1/admin/tokens')
    ).json<{ tokens: { kind: string; label: string }[] }>()
    const wrong = await call(worker, owner, '/v1/admin/tokens', { label: 'x', kind: 'admin' })

    expect(made.status).toBe(201)
    expect(created).toMatchObject({ kind: 'read', scopes: ['content:read'] })
    expect(created.secret).toMatch(/^hw_read_/)
    expect(read.status).toBe(200)
    expect(listed.tokens.find((token) => token.label === 'Site')?.kind).toBe('read')
    expect(wrong.status).toBe(400)
  })

  it('invite an editor or an author with a link to /setup, and never an owner', async () => {
    const worker = boot()
    const owner = await adminToken(worker, 'owner')

    const invited = await call(worker, owner, '/v1/admin/invitations', {
      role: 'author',
      email: `ana-${crypto.randomUUID().slice(0, 8)}@example.org`,
    })
    const asOwner = await call(worker, owner, '/v1/admin/invitations', {
      role: 'owner',
      email: 'olga@example.org',
    })
    const people = await (
      await call(worker, owner, '/v1/admin/people')
    ).json<{
      people: { role: string }[]
      invitations: { role: string }[]
    }>()

    expect(invited.status).toBe(201)
    expect(await invited.json()).toMatchObject({
      role: 'author',
      link: expect.stringMatching(/^https:\/\/hollware\.test\/setup#invitation=hw_inv_/),
    })
    expect(asOwner.status).toBe(400)
    expect(people.invitations.map((invitation) => invitation.role)).toContain('author')
    expect(people.people.some((person) => person.role === 'owner')).toBe(true)
  })

  it('invite an address, kept in lowercase and listed with the invitation, and refuse one that is no address', async () => {
    const worker = boot()
    const owner = await adminToken(worker, 'owner')
    const address = `Ada-${crypto.randomUUID().slice(0, 8)}@Example.org`

    const invited = await call(worker, owner, '/v1/admin/invitations', {
      role: 'editor',
      email: address,
    })
    const wrong = await call(worker, owner, '/v1/admin/invitations', {
      role: 'editor',
      email: 'ada',
    })
    const people = await (
      await call(worker, owner, '/v1/admin/people')
    ).json<{ invitations: { email: string | null }[]; people: { email: string | null }[] }>()

    expect(invited.status).toBe(201)
    expect(await invited.json()).toMatchObject({ role: 'editor', email: address.toLowerCase() })
    expect(wrong.status).toBe(400)
    expect(people.invitations.map((invitation) => invitation.email)).toContain(
      address.toLowerCase(),
    )
    expect(people.people.every((person) => person.email === null)).toBe(true)
  })

  it('revoke an invitation that waits, whose link stops working at once, and only of the site', async () => {
    const worker = boot()
    const owner = await adminToken(worker, 'owner')
    const made = await (
      await call(worker, owner, '/v1/admin/invitations', {
        role: 'author',
        email: `ana-${crypto.randomUUID().slice(0, 8)}@example.org`,
      })
    ).json<{ id: string; link: string }>()
    const elsewhere = await createInvitation(connect(env.DB), {
      site: OTHER_SITE_KEY,
      role: 'author',
      userId: null,
      now: new Date(NOW),
      days: 7,
      email: `new-${crypto.randomUUID().slice(0, 8)}@example.org`,
    })
    const used = await createInvitation(connect(env.DB), {
      site: SITE_KEY,
      role: 'author',
      userId: null,
      now: new Date(NOW),
      days: 7,
      email: `new-${crypto.randomUUID().slice(0, 8)}@example.org`,
    })
    await redeemInvitation(connect(env.DB), used.id, new Date(NOW))
    const options = (invitation: string) =>
      worker.send('/auth/register/options', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://hollware.test' },
        body: JSON.stringify({ invitation }),
      })
    const secret = made.link.split('#invitation=')[1] ?? ''

    const before = await options(secret)
    const revoked = await call(worker, owner, `/v1/admin/invitations/${made.id}/revoke`, {})
    const again = await call(worker, owner, `/v1/admin/invitations/${made.id}/revoke`, {})
    const foreign = await call(worker, owner, `/v1/admin/invitations/${elsewhere.id}/revoke`, {})
    const spent = await call(worker, owner, `/v1/admin/invitations/${used.id}/revoke`, {})
    const after = await options(secret)
    const theirs = await options(elsewhere.secret)
    const people = await (
      await call(worker, owner, '/v1/admin/people')
    ).json<{ invitations: { id: string }[] }>()

    expect([before.status, revoked.status, again.status, foreign.status, spent.status]).toEqual([
      200, 200, 404, 404, 404,
    ])
    expect(await revoked.json()).toEqual({ outcome: 'revoked' })
    expect([after.ok, theirs.ok]).toEqual([false, true])
    expect(people.invitations.map((invitation) => invitation.id)).not.toContain(made.id)
  })

  it('say how big the database of the deployment is, to an owner only', async () => {
    const worker = boot()
    const owner = await adminToken(worker, 'owner')
    const editor = await adminToken(worker, 'editor')
    const size = async () =>
      (await (await call(worker, owner, '/v1/admin/database')).json<{ bytes: number }>()).bytes

    const before = await size()
    await env.DB.prepare('CREATE TABLE size_probe (x TEXT)').run()
    await env.DB.prepare('INSERT INTO size_probe (x) VALUES (?1)').bind('x'.repeat(1_000_000)).run()
    const after = await size()
    await env.DB.prepare('DROP TABLE size_probe').run()
    const refused = await call(worker, editor, '/v1/admin/database')

    expect(after - before).toBeGreaterThanOrEqual(1_000_000)
    expect(refused.status).toBe(403)
  })

  it('delete an entry of the trash for ever, for an owner, and refuse one out of the trash', async () => {
    const worker = boot()
    await worker.ready()
    const owner = await adminPerson(worker, 'owner')
    const editor = await adminToken(worker, 'editor')
    const unique = crypto.randomUUID().replaceAll('-', '').slice(0, 20).toUpperCase()
    const [trashed, live] = [`ent_${unique}TRASH1`, `ent_${unique}LIVE01`]
    await insertEntries(
      env.DB,
      { site: SITE_KEY, actor: { kind: 'user', userId: owner.userId, tokenId: null, meta: null } },
      [
        { id: trashed, slug: `trashed-${unique.toLowerCase()}`, updatedAt: NOW },
        { id: live, slug: `live-${unique.toLowerCase()}`, updatedAt: NOW },
      ],
    )
    await env.DB.prepare('UPDATE entries SET deleted_at = ?1 WHERE id = ?2')
      .bind(NOW, trashed)
      .run()

    const answers = [
      await call(worker, editor, `/v1/admin/entries/${trashed}/purge`, {}),
      await call(worker, owner.access, `/v1/admin/entries/${live}/purge`, {}),
      await call(worker, owner.access, `/v1/admin/entries/${trashed}/purge`, {}),
      await call(worker, owner.access, `/v1/admin/entries/${trashed}/purge`, {}),
    ]
    const rows = await env.DB.prepare('SELECT id FROM entries WHERE id IN (?1, ?2) ORDER BY id')
      .bind(trashed, live)
      .all<{ id: string }>()
    const audit = await env.DB.prepare(
      "SELECT outcome FROM audit_log WHERE action = 'entry.purge' AND target_id IN (?1, ?2) ORDER BY rowid",
    )
      .bind(trashed, live)
      .all<{ outcome: string }>()

    expect(answers.map((answer) => answer.status)).toEqual([403, 409, 200, 404])
    expect(await answers[2]?.json()).toEqual({ outcome: 'purged' })
    expect(rows.results.map((row) => row.id)).toEqual([live])
    expect(audit.results.map((line) => line.outcome)).toEqual(['failed', 'ok', 'failed'])
  })

  it('list the deliveries of the site that failed, and send one of their events again', async () => {
    const sent: unknown[] = []
    const worker = boot({
      bindings: {
        EVENTS: {
          sendBatch: async (messages: Iterable<{ readonly body: unknown }>) => {
            for (const message of messages) sent.push(message.body)
          },
        },
      },
    })
    const owner = await adminToken(worker, 'owner')
    const unique = crypto.randomUUID().replaceAll('-', '').slice(0, 20).toUpperCase()
    const failed = `evt_${unique}FAIL01`
    const delivered = `evt_${unique}DONE01`
    const foreign = `evt_${unique}ELSE01`
    const entry = JSON.stringify({
      id: failed,
      site: SITE_KEY,
      at: NOW,
      cacheTags: [],
      kind: 'entry.published',
      entry: {
        id: 'ent_1',
        collection: 'blog',
        locale: 'en',
        slug: 'hello',
        translationGroup: null,
      },
      path: '/en/blog/hello/',
      url: null,
    })
    const event = (
      id: string,
      site: string,
      kind: string,
      payload: string,
      abandoned: string | null,
    ) =>
      env.DB.prepare(
        'INSERT INTO outbox (id, site_id, kind, entry_id, payload, sent_at, abandoned_at, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?6, ?6)',
      ).bind(id, site, kind, kind === 'site.changed' ? null : 'ent_1', payload, NOW, abandoned)
    const delivery = (id: string, site: string, deliveredAt: string | null) =>
      env.DB.prepare(
        "INSERT INTO deliveries (id, site_id, event_id, subscriber, attempts, delivered_at, last_error, created_at, updated_at) VALUES (?1, ?2, ?3, 'webhook:site', 6, ?4, ?5, ?6, ?6)",
      ).bind(
        `dlv_${id.slice(4)}`,
        site,
        id,
        deliveredAt,
        deliveredAt === null ? 'the webhook site answered 500' : null,
        NOW,
      )
    await worker.ready()
    await env.DB.batch([
      event(failed, SITE_KEY, 'entry.published', entry, NOW),
      event(delivered, SITE_KEY, 'site.changed', '{}', null),
      event(foreign, OTHER_SITE_KEY, 'site.changed', '{}', NOW),
      delivery(failed, SITE_KEY, null),
      delivery(delivered, SITE_KEY, NOW),
      delivery(foreign, OTHER_SITE_KEY, null),
    ])

    const listed = await (
      await call(worker, owner, '/v1/admin/deliveries')
    ).json<{ deliveries: { event: string }[] }>()
    const answers = [
      await call(worker, owner, `/v1/admin/events/${failed}/retry`, {}),
      await call(worker, owner, `/v1/admin/events/${delivered}/retry`, {}),
      await call(worker, owner, `/v1/admin/events/${foreign}/retry`, {}),
    ]
    const row = await env.DB.prepare('SELECT sent_at, abandoned_at FROM outbox WHERE id = ?1')
      .bind(failed)
      .first()

    expect(
      listed.deliveries.filter((one) => [failed, delivered, foreign].includes(one.event)),
    ).toEqual([
      {
        event: failed,
        kind: 'entry.published',
        entry: { collection: 'blog', locale: 'en', slug: 'hello' },
        subscriber: 'webhook:site',
        attempts: 6,
        lastError: 'the webhook site answered 500',
        triedAt: NOW,
        abandonedAt: NOW,
      },
    ])
    expect(answers.map((answer) => answer.status)).toEqual([200, 404, 404])
    expect(await answers[0]?.json()).toEqual({ outcome: 'queued' })
    expect(sent).toEqual([{ site: SITE_KEY, id: failed }])
    expect(row).toEqual({ sent_at: NOW, abandoned_at: null })
    const audit = await env.DB.prepare(
      "SELECT target_id, outcome FROM audit_log WHERE action = 'event.retry' AND target_id IN (?1, ?2, ?3) ORDER BY rowid",
    )
      .bind(failed, delivered, foreign)
      .all()
    expect(audit.results).toEqual([
      { target_id: failed, outcome: 'ok' },
      { target_id: delivered, outcome: 'failed' },
      { target_id: foreign, outcome: 'failed' },
    ])
  })

  it('give a member another role, and remove one, whose token stops working at once', async () => {
    const worker = boot()
    const owner = await adminToken(worker, 'owner')
    const editor = await seedToken(env.DB, SITE_KEY, { role: 'editor' })

    const demoted = await call(worker, owner, '/v1/admin/people/role', {
      userId: editor.userId,
      role: 'author',
    })
    const same = await call(worker, owner, '/v1/admin/people/role', {
      userId: editor.userId,
      role: 'author',
    })
    const before = await worker.send('/v1/site', { token: editor.token })
    const removed = await call(worker, owner, '/v1/admin/people/remove', { userId: editor.userId })
    const after = await worker.send('/v1/site', { token: editor.token })
    const stranger = await call(worker, owner, '/v1/admin/people/remove', { userId: editor.userId })

    expect([await demoted.json(), await same.json()]).toEqual([
      { outcome: 'changed' },
      { outcome: 'unchanged' },
    ])
    expect([before.status, removed.status, after.status, stranger.status]).toEqual([
      200, 200, 401, 404,
    ])
  })

  it('keep an agent member an author, whatever role an owner gives it', async () => {
    const worker = boot()
    const owner = await adminToken(worker, 'owner')
    const made = await call(worker, owner, '/v1/admin/agents', {
      name: `reviewer-${crypto.randomUUID().slice(0, 8)}`,
    })
    const agent = await made.json<{ id: string }>()

    const promoted = await call(worker, owner, '/v1/admin/people/role', {
      userId: agent.id,
      role: 'owner',
    })
    const role = await env.DB.prepare(
      'SELECT role FROM members WHERE site_id = ?1 AND user_id = ?2',
    )
      .bind(SITE_KEY, agent.id)
      .first<string>('role')

    expect(promoted.status).toBe(409)
    expect(await promoted.json()).toMatchObject({ code: 'conflict' })
    expect(role).toBe('author')
  })

  it('keep the last owner of the site: neither demoted nor removed until another owner exists', async () => {
    const worker = boot()
    const owner = await adminPerson(worker, 'owner')
    const editor = await seedToken(env.DB, SITE_KEY, { role: 'editor' })
    await env.DB.prepare(
      "UPDATE members SET role = 'editor' WHERE site_id = ?1 AND role = 'owner' AND user_id <> ?2",
    )
      .bind(SITE_KEY, owner.userId)
      .run()

    const demote = await call(worker, owner.access, '/v1/admin/people/role', {
      userId: owner.userId,
      role: 'editor',
    })
    const remove = await call(worker, owner.access, '/v1/admin/people/remove', {
      userId: owner.userId,
    })
    const promoted = await call(worker, owner.access, '/v1/admin/people/role', {
      userId: editor.userId,
      role: 'owner',
    })
    const stepDown = await call(worker, owner.access, '/v1/admin/people/role', {
      userId: owner.userId,
      role: 'editor',
    })

    expect([demote.status, remove.status]).toEqual([409, 409])
    expect(await demote.json()).toMatchObject({ code: 'conflict' })
    expect([promoted.status, stepDown.status]).toEqual([200, 200])
  })
})
