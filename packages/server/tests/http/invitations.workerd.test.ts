import { defineConfig } from '@hollware/core'
import { env } from 'cloudflare:workers'
import { describe, expect, it, vi } from 'vitest'

import { connect } from '../../src/db/d1.ts'
import { createInvitation } from '../../src/identity/store.ts'
import { seedToken } from '../auth/support.ts'
import { adminPerson, adminToken, call } from './admin-session.ts'
import { boot, CONFIG, NOW, SITE_KEY } from './support.ts'

vi.setConfig({ testTimeout: 60_000 })

const FROM = 'Hollware <invitations@hollware.test>'

function mailbox(fails = false) {
  const sent: EmailMessageBuilder[] = []
  const binding: SendEmail = {
    async send(message: EmailMessage | EmailMessageBuilder) {
      if (fails) throw new Error('the domain is not onboarded')
      if ('subject' in message) sent.push(message)
      return { messageId: 'm-1' }
    },
  }
  return { sent, bindings: { EMAIL: binding, HOLLWARE_EMAIL_FROM: FROM } }
}

function address(name: string) {
  return `${name}-${crypto.randomUUID().slice(0, 8)}@example.org`
}

function linkIn(text: string): string {
  return /https:\/\/hollware\.test\/setup#invitation=hw_inv_\S+/.exec(text)?.[0] ?? ''
}

const registerOptions = (worker: ReturnType<typeof boot>, link: string) =>
  worker.send('/auth/register/options', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://hollware.test' },
    body: JSON.stringify({ invitation: link.split('#invitation=')[1] ?? '' }),
  })

describe('the roles of a site', () => {
  it('let an admin invite up to an admin, and never an owner', async () => {
    const worker = boot()
    const admin = await adminToken(worker, 'admin')

    const answers = await Promise.all(
      ['admin', 'editor', 'author', 'reviewer', 'owner'].map(async (role) => {
        const made = await call(worker, admin, '/v1/admin/invitations', {
          role,
          email: `${role}@example.org`,
        })
        return [role, made.status]
      }),
    )
    const people = await (
      await call(worker, admin, '/v1/admin/people')
    ).json<{ invite: { roles: string[] } }>()

    expect(answers).toEqual([
      ['admin', 201],
      ['editor', 201],
      ['author', 201],
      ['reviewer', 201],
      ['owner', 400],
    ])
    expect(people.invite.roles).toEqual(['admin', 'editor', 'author', 'reviewer'])
  })

  it('let an admin change and remove anyone but an owner, and name no owner', async () => {
    const worker = boot()
    const admin = await adminToken(worker, 'admin')
    const owner = await seedToken(env.DB, SITE_KEY, { role: 'owner' })
    const editor = await seedToken(env.DB, SITE_KEY, { role: 'editor' })

    const demoteOwner = await call(worker, admin, '/v1/admin/people/role', {
      userId: owner.userId,
      role: 'editor',
    })
    const removeOwner = await call(worker, admin, '/v1/admin/people/remove', {
      userId: owner.userId,
    })
    const promote = await call(worker, admin, '/v1/admin/people/role', {
      userId: editor.userId,
      role: 'owner',
    })
    const toReviewer = await call(worker, admin, '/v1/admin/people/role', {
      userId: editor.userId,
      role: 'reviewer',
    })
    const removeEditor = await call(worker, admin, '/v1/admin/people/remove', {
      userId: editor.userId,
    })
    const roleOfOwner = await env.DB.prepare(
      'SELECT role FROM members WHERE site_id = ?1 AND user_id = ?2',
    )
      .bind(SITE_KEY, owner.userId)
      .first<string>('role')

    expect([demoteOwner.status, removeOwner.status, promote.status]).toEqual([403, 403, 403])
    expect(await promote.json()).toMatchObject({
      message: 'Only an owner names, changes or removes an owner.',
    })
    expect([toReviewer.status, removeEditor.status]).toEqual([200, 200])
    expect(roleOfOwner).toBe('owner')
  })

  it('keep the deletion of entries and the anonymizing of people for an owner', async () => {
    const worker = boot()
    const admin = await adminToken(worker, 'admin')
    const entry = 'ent_01JAB3XQ8ZK4M6N2P5R7S9T0VW'

    const purge = await call(worker, admin, `/v1/admin/entries/${entry}/purge`, {})
    const anonymize = await call(worker, admin, '/v1/admin/people/anonymize', {
      userId: 'usr_01JAB3XQ8ZK4M6N2P5R7S9T0VW',
    })

    expect([purge.status, anonymize.status]).toEqual([403, 403])
    expect(purge.headers.get('www-authenticate')).toContain('scope="site:owner"')
  })

  it('give a reviewer reading and comments, and no draft', async () => {
    const worker = boot()
    const reviewer = await adminToken(worker, 'reviewer')

    const me = await (await call(worker, reviewer, '/v1/admin/me')).json<{ scopes: string[] }>()
    const people = await call(worker, reviewer, '/v1/admin/people')

    expect(me.scopes).toEqual(['content:read', 'review:read', 'review:comment'])
    expect(people.status).toBe(403)
  })
})

describe('invitations', () => {
  it('mail an invitation that names an address, and show its link to nobody', async () => {
    const box = mailbox()
    const worker = boot({ bindings: box.bindings })
    const owner = await adminPerson(worker, 'owner')
    const to = address('ada')

    const made = await call(worker, owner.access, '/v1/admin/invitations', {
      role: 'reviewer',
      email: to,
      language: 'es',
    })
    const body = await made.json<Record<string, unknown>>()
    const people = await (
      await call(worker, owner.access, '/v1/admin/people')
    ).json<{ invitations: { id: string; sentAt: string | null }[]; invite: { mail: boolean } }>()

    expect(made.status).toBe(201)
    expect(body).toEqual({
      id: expect.stringMatching(/^inv_/),
      role: 'reviewer',
      email: to,
      expiresAt: '2026-10-20T12:00:00.000Z',
      sent: true,
    })
    expect(box.sent).toHaveLength(1)
    expect(box.sent[0]).toMatchObject({
      from: FROM,
      to,
      subject: 'Test user te invitó a gateway-tests en Hollware',
    })
    expect(box.sent[0]?.text).toContain('como revisor')
    expect((await registerOptions(worker, linkIn(String(box.sent[0]?.text)))).status).toBe(200)
    expect(people.invite.mail).toBe(true)
    expect(people.invitations.find((one) => one.id === body['id'])?.sentAt).toBe(NOW)
  })

  it('show the link when the mail fails or there is no mail, and log the failure', async () => {
    const logged: unknown[] = []
    const spy = vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
      logged.push(line)
    })
    const failing = boot({ bindings: mailbox(true).bindings })
    const plain = boot()
    const failed = await call(
      failing,
      await adminToken(failing, 'owner'),
      '/v1/admin/invitations',
      { role: 'author', email: address('bob') },
    )
    const unmailed = await call(plain, await adminToken(plain, 'owner'), '/v1/admin/invitations', {
      role: 'author',
      email: address('cy'),
    })
    spy.mockRestore()

    expect(await failed.json()).toMatchObject({
      sent: false,
      link: expect.stringContaining('#invitation='),
    })
    expect(await unmailed.json()).toMatchObject({
      sent: false,
      link: expect.stringContaining('#invitation='),
    })
    expect(
      logged
        .map((line): unknown => JSON.parse(String(line)))
        .filter(
          (line): line is { kind: string; reason: string } =>
            typeof line === 'object' &&
            line !== null &&
            Reflect.get(line, 'kind') === 'invitation_mail_failed',
        )
        .map((line) => line.reason),
    ).toEqual(['the domain is not onboarded'])
  })

  it('refuse a second invitation of an address, and one of a member', async () => {
    const worker = boot()
    const owner = await adminToken(worker, 'owner')
    const to = address('dee')
    const member = await seedToken(env.DB, SITE_KEY, { role: 'author' })
    const known = address('eve')
    await env.DB.prepare('UPDATE users SET email = ?1, email_verified_at = ?2 WHERE id = ?3')
      .bind(known, NOW, member.userId)
      .run()

    const first = await call(worker, owner, '/v1/admin/invitations', { role: 'author', email: to })
    const again = await call(worker, owner, '/v1/admin/invitations', { role: 'editor', email: to })
    const ofMember = await call(worker, owner, '/v1/admin/invitations', {
      role: 'editor',
      email: known,
    })

    expect([first.status, again.status, ofMember.status]).toEqual([201, 409, 409])
    expect(await again.json()).toMatchObject({
      message: 'That address already has an invitation to this site.',
    })
    expect(await ofMember.json()).toMatchObject({
      message: 'That address is already a member of this site.',
    })
  })

  it('name the address of the person, with passkeys or without them', async () => {
    const withPasskeys = boot()
    const providersOnly = boot({
      config: defineConfig({
        ...CONFIG,
        auth: {
          passkeys: false,
          providers: [{ kind: 'google', clientId: 'google-client', clientSecret: 'GOOGLE_SECRET' }],
        },
      }),
    })
    const blank = async (worker: ReturnType<typeof boot>) =>
      (
        await call(worker, await adminToken(worker, 'owner'), '/v1/admin/invitations', {
          role: 'author',
        })
      ).status

    const answers = [await blank(withPasskeys), await blank(providersOnly)]
    const named = await call(
      withPasskeys,
      await adminToken(withPasskeys, 'owner'),
      '/v1/admin/invitations',
      { role: 'author', email: address('fay') },
    )

    expect(answers).toEqual([400, 400])
    expect(named.status).toBe(201)
  })

  it('renew an invitation that waited too long with a new link, which the old one stops being', async () => {
    const worker = boot()
    const owner = await adminToken(worker, 'owner')
    const old = await createInvitation(connect(env.DB), {
      site: SITE_KEY,
      role: 'editor',
      userId: null,
      now: new Date('2026-09-01T00:00:00.000Z'),
      days: 7,
      email: `new-${crypto.randomUUID().slice(0, 8)}@example.org`,
    })

    const listed = async () =>
      (
        await (
          await call(worker, owner, '/v1/admin/people')
        ).json<{ invitations: { id: string; status: string; expiresAt: string }[] }>()
      ).invitations.find((one) => one.id === old.id)
    const before = await listed()
    const renewed = await call(worker, owner, `/v1/admin/invitations/${old.id}/renew`, {
      days: 3,
    })
    const body = await renewed.json<{ link: string; expiresAt: string }>()
    const after = await listed()
    const fresh = await registerOptions(worker, body.link)
    const stale = await registerOptions(worker, `x#invitation=${old.secret}`)
    const revoked = await call(worker, owner, `/v1/admin/invitations/${old.id}/revoke`, {})
    const gone = await listed()
    const renewRevoked = await call(worker, owner, `/v1/admin/invitations/${old.id}/renew`, {})

    expect(before?.status).toBe('expired')
    expect(renewed.status).toBe(201)
    expect(body.expiresAt).toBe('2026-10-16T12:00:00.000Z')
    expect(after).toMatchObject({ status: 'waiting', expiresAt: '2026-10-16T12:00:00.000Z' })
    expect([fresh.status, stale.status]).toEqual([200, 400])
    expect([revoked.status, gone, renewRevoked.status]).toEqual([200, undefined, 404])
  })
})
