import { env } from 'cloudflare:workers'
import { newId } from '@hollware/core'
import { isoBase64URL } from '@simplewebauthn/server/helpers'
import { describe, expect, it } from 'vitest'

import { connect } from '../../src/db/d1.ts'
import { hashSecret } from '../../src/identity/secrets.ts'
import {
  acceptanceOptions,
  authenticationOptions,
  registrationOptions,
  verifyAcceptance,
  verifyAuthentication,
  verifyRegistration,
  type Ceremony,
} from '../../src/identity/ceremonies.ts'
import {
  createInvitation,
  findSession,
  markSent,
  membershipsOf,
  revokeInvitation,
} from '../../src/identity/store.ts'
import { seedOwner, siteKey } from '../db/support.ts'
import { softAuthenticator } from '../support/authenticator.ts'

const ORIGIN = 'https://cms.example.com'
const NOW = new Date('2026-10-14T10:00:00.000Z')

async function site() {
  const owner = await seedOwner(env.DB, siteKey('identity'))
  const ceremony: Ceremony = { db: connect(env.DB), publicUrl: ORIGIN, now: NOW }
  return { owner, ceremony }
}

async function register(ceremony: Ceremony, secret: string, from = ORIGIN) {
  const authenticator = await softAuthenticator(ORIGIN)
  const { challengeId, options } = await registrationOptions(ceremony, secret)
  const response = await authenticator.register(options, from)
  const answer = await verifyRegistration(ceremony, {
    challengeId,
    response,
    name: 'Ada',
    label: 'Laptop',
  })
  return { authenticator, answer }
}

describe('registration', () => {
  it('adds a passkey to the owner of a setup link, once', async () => {
    const { owner, ceremony } = await site()
    const link = await createInvitation(ceremony.db, {
      site: owner.site,
      role: 'owner',
      userId: owner.actor.userId,
      now: NOW,
      days: 7,
    })

    const { answer } = await register(ceremony, link.secret)

    expect(answer.userId).toBe(owner.actor.userId)
    expect(await findSession(ceremony.db, answer.session, NOW)).toEqual({
      userId: owner.actor.userId,
      name: 'Owner',
    })
    await expect(registrationOptions(ceremony, link.secret)).rejects.toThrow(
      'This link is not valid',
    )
  })

  it('makes a new person with the role of an invitation', async () => {
    const { owner, ceremony } = await site()
    const invitation = await createInvitation(ceremony.db, {
      site: owner.site,
      role: 'author',
      userId: null,
      now: NOW,
      days: 7,
      email: `new-${crypto.randomUUID().slice(0, 8)}@example.org`,
    })

    const { answer } = await register(ceremony, invitation.secret)

    expect(answer.userId).not.toBe(owner.actor.userId)
    expect(await findSession(ceremony.db, answer.session, NOW)).toEqual({
      userId: answer.userId,
      name: 'Ada',
    })
    expect(await membershipsOf(ceremony.db, answer.userId)).toEqual([
      { site: owner.site, role: 'author' },
    ])
  })

  it('lets one person in through an invitation, even when two registrations start from it', async () => {
    const { owner, ceremony } = await site()
    const invitation = await createInvitation(ceremony.db, {
      site: owner.site,
      role: 'editor',
      userId: null,
      now: NOW,
      days: 7,
      email: `new-${crypto.randomUUID().slice(0, 8)}@example.org`,
    })
    const authenticator = await softAuthenticator(ORIGIN)
    const first = await registrationOptions(ceremony, invitation.secret)
    const second = await registrationOptions(ceremony, invitation.secret)
    const finish = async (started: typeof first) =>
      verifyRegistration(ceremony, {
        challengeId: started.challengeId,
        response: await authenticator.register(started.options, ORIGIN),
        name: 'Ada',
        label: 'Laptop',
      })

    await finish(first)

    await expect(finish(second)).rejects.toThrow('This link is not valid')
  })

  it('refuses an invitation that expired, and a passkey made for another origin', async () => {
    const { owner, ceremony } = await site()
    const expired = await createInvitation(ceremony.db, {
      site: owner.site,
      role: 'author',
      userId: null,
      now: new Date('2026-10-01T10:00:00.000Z'),
      days: 7,
      email: `new-${crypto.randomUUID().slice(0, 8)}@example.org`,
    })
    const fresh = await createInvitation(ceremony.db, {
      site: owner.site,
      role: 'author',
      userId: null,
      now: NOW,
      days: 7,
      email: `new-${crypto.randomUUID().slice(0, 8)}@example.org`,
    })

    await expect(registrationOptions(ceremony, expired.secret)).rejects.toThrow(
      'This link is not valid',
    )
    await expect(register(ceremony, fresh.secret, 'https://evil.example.com')).rejects.toThrow()
  })
})

describe('sign-in', () => {
  it('opens a session with a registered passkey, and refuses its challenge a second time', async () => {
    const { owner, ceremony } = await site()
    const link = await createInvitation(ceremony.db, {
      site: owner.site,
      role: 'owner',
      userId: owner.actor.userId,
      now: NOW,
      days: 7,
    })
    const { authenticator } = await register(ceremony, link.secret)
    const { challengeId, options } = await authenticationOptions(ceremony)
    const response = await authenticator.authenticate(options)

    const answer = await verifyAuthentication(ceremony, { challengeId, response })

    expect((await findSession(ceremony.db, answer.session, NOW))?.userId).toBe(owner.actor.userId)
    await expect(verifyAuthentication(ceremony, { challengeId, response })).rejects.toThrow(
      'The sign-in expired',
    )
  })

  it('refuses an assertion whose signature does not verify', async () => {
    const { owner, ceremony } = await site()
    const link = await createInvitation(ceremony.db, {
      site: owner.site,
      role: 'owner',
      userId: owner.actor.userId,
      now: NOW,
      days: 7,
    })
    const { authenticator } = await register(ceremony, link.secret)
    const { challengeId, options } = await authenticationOptions(ceremony)
    const response = await authenticator.authenticate(options)
    const signature = isoBase64URL.toBuffer(response.response.signature)
    signature[10] = (signature[10] ?? 0) ^ 1
    const forged = {
      ...response,
      response: { ...response.response, signature: isoBase64URL.fromBuffer(signature) },
    }

    await expect(verifyAuthentication(ceremony, { challengeId, response: forged })).rejects.toThrow(
      'The passkey could not be verified',
    )
  })

  async function registered() {
    const { owner, ceremony } = await site()
    const link = await createInvitation(ceremony.db, {
      site: owner.site,
      role: 'owner',
      userId: owner.actor.userId,
      now: NOW,
      days: 7,
    })
    const { authenticator } = await register(ceremony, link.secret)
    return { ceremony, authenticator }
  }

  it('refuses a challenge older than five minutes, and takes one of just under', async () => {
    const { ceremony, authenticator } = await registered()
    const late = await authenticationOptions(ceremony)
    const lateResponse = await authenticator.authenticate(late.options)
    const inTime = await authenticationOptions(ceremony)
    const inTimeResponse = await authenticator.authenticate(inTime.options)
    const at = (ms: number) => ({ ...ceremony, now: new Date(NOW.getTime() + ms) })

    await expect(
      verifyAuthentication(at(300_000), { challengeId: late.challengeId, response: lateResponse }),
    ).rejects.toThrow('The sign-in expired')
    await expect(
      verifyAuthentication(at(299_999), {
        challengeId: inTime.challengeId,
        response: inTimeResponse,
      }),
    ).resolves.toMatchObject({ userId: expect.stringMatching(/^usr_/) })
  })

  it('refuses a counter that went back, as a cloned authenticator gives', async () => {
    const { ceremony, authenticator } = await registered()
    const first = await authenticationOptions(ceremony)
    await verifyAuthentication(ceremony, {
      challengeId: first.challengeId,
      response: await authenticator.authenticate(first.options, ORIGIN, { counter: 5 }),
    })
    const clone = await authenticationOptions(ceremony)

    await expect(
      verifyAuthentication(ceremony, {
        challengeId: clone.challengeId,
        response: await authenticator.authenticate(clone.options, ORIGIN, { counter: 3 }),
      }),
    ).rejects.toThrow('The passkey could not be verified')
  })

  it('refuses a sign-in in which the device was touched but not unlocked', async () => {
    const { ceremony, authenticator } = await registered()
    const { challengeId, options } = await authenticationOptions(ceremony)

    await expect(
      verifyAuthentication(ceremony, {
        challengeId,
        response: await authenticator.authenticate(options, ORIGIN, { userVerified: false }),
      }),
    ).rejects.toThrow('The passkey could not be verified')
  })

  it('refuses a passkey of no one, and an assertion for another origin', async () => {
    const { owner, ceremony } = await site()
    const link = await createInvitation(ceremony.db, {
      site: owner.site,
      role: 'owner',
      userId: owner.actor.userId,
      now: NOW,
      days: 7,
    })
    const { authenticator } = await register(ceremony, link.secret)
    const stranger = await softAuthenticator(ORIGIN)

    const first = await authenticationOptions(ceremony)
    await expect(
      verifyAuthentication(ceremony, {
        challengeId: first.challengeId,
        response: await stranger.authenticate(first.options),
      }),
    ).rejects.toThrow('This passkey is not one of this Hollware')
    const second = await authenticationOptions(ceremony)
    await expect(
      verifyAuthentication(ceremony, {
        challengeId: second.challengeId,
        response: await authenticator.authenticate(second.options, 'https://evil.example.com'),
      }),
    ).rejects.toThrow('The passkey could not be verified')
  })
})

describe('acceptance', () => {
  async function person() {
    const { owner, ceremony } = await site()
    const first = await createInvitation(ceremony.db, {
      site: owner.site,
      role: 'author',
      userId: null,
      now: NOW,
      days: 7,
      email: `new-${crypto.randomUUID().slice(0, 8)}@example.org`,
    })
    const { authenticator, answer } = await register(ceremony, first.secret)
    const other = siteKey('identity-other')
    await seedOwner(env.DB, other)
    return { ceremony, authenticator, userId: answer.userId, home: owner.site, other }
  }

  it('makes a person of this Hollware a member of another site with the passkey they have, once', async () => {
    const { ceremony, authenticator, userId, home, other } = await person()
    const invited = await createInvitation(ceremony.db, {
      site: other,
      role: 'reviewer',
      userId: null,
      now: NOW,
      days: 7,
      email: `new-${crypto.randomUUID().slice(0, 8)}@example.org`,
    })
    const { challengeId, options } = await acceptanceOptions(ceremony, invited.secret)
    const response = await authenticator.authenticate(options)

    const answer = await verifyAcceptance(ceremony, { challengeId, response })

    expect([answer.userId, answer.site]).toEqual([userId, other])
    expect(await membershipsOf(ceremony.db, userId)).toEqual([
      { site: home, role: 'author' },
      { site: other, role: 'reviewer' },
    ])
    expect((await findSession(ceremony.db, answer.session, NOW))?.userId).toBe(userId)
    await expect(acceptanceOptions(ceremony, invited.secret)).rejects.toThrow(
      'This link is not valid',
    )
  })

  it('refuses a revoked invitation, a challenge of a sign-in, and a link made for someone else', async () => {
    const { ceremony, authenticator, other } = await person()
    const revoked = await createInvitation(ceremony.db, {
      site: other,
      role: 'author',
      userId: null,
      now: NOW,
      days: 7,
      email: `new-${crypto.randomUUID().slice(0, 8)}@example.org`,
    })
    await revokeInvitation(ceremony.db, { site: other, id: revoked.id, now: NOW })
    const stranger = await seedOwner(env.DB, siteKey('identity-stranger'))
    const theirs = await createInvitation(ceremony.db, {
      site: other,
      role: 'author',
      userId: stranger.actor.userId,
      now: NOW,
      days: 7,
    })
    const signIn = await authenticationOptions(ceremony)
    const fromSignIn = await authenticator.authenticate(signIn.options)
    const forThem = await acceptanceOptions(ceremony, theirs.secret)
    const asMe = await authenticator.authenticate(forThem.options)

    await expect(acceptanceOptions(ceremony, revoked.secret)).rejects.toThrow(
      'This link is not valid',
    )
    await expect(
      verifyAcceptance(ceremony, { challengeId: signIn.challengeId, response: fromSignIn }),
    ).rejects.toThrow('The sign-in expired')
    await expect(
      verifyAcceptance(ceremony, { challengeId: forThem.challengeId, response: asMe }),
    ).rejects.toThrow('This link is for another person')
  })
})

describe('an invitation Hollware mailed', () => {
  it('refuses an invitation of a new person that names no address', async () => {
    const { owner, ceremony } = await site()
    const secret = 'hw_inv_' + 'A'.repeat(43)
    await env.DB.prepare(
      "INSERT INTO invitations (id, site_id, hash, role, user_id, expires_at, used_at, created_at, updated_at) VALUES (?1, ?2, ?3, 'author', NULL, '2026-10-20T12:00:00.000Z', NULL, ?4, ?4)",
    )
      .bind(newId('inv'), owner.site, await hashSecret(secret), NOW.toISOString())
      .run()

    await expect(registrationOptions(ceremony, secret)).rejects.toThrow(
      'This invitation names no email address.',
    )
  })

  it('gives the new person its address, verified only when Hollware mailed the link', async () => {
    const { owner, ceremony } = await site()
    const address = `ada-${crypto.randomUUID().slice(0, 8)}@example.org`
    const mailed = await createInvitation(ceremony.db, {
      site: owner.site,
      role: 'editor',
      userId: null,
      now: NOW,
      days: 7,
      email: address,
    })
    const shown = await createInvitation(ceremony.db, {
      site: owner.site,
      role: 'editor',
      userId: null,
      now: NOW,
      days: 7,
      email: `bob-${address}`,
    })
    await markSent(ceremony.db, mailed.id, NOW)

    const fromMail = await register(ceremony, mailed.secret)
    const fromLink = await register(ceremony, shown.secret)
    const emails = async (id: string) =>
      env.DB.prepare('SELECT email, email_verified_at FROM users WHERE id = ?1')
        .bind(id)
        .first<{ email: string | null; email_verified_at: string | null }>()

    expect(await emails(fromMail.answer.userId)).toEqual({
      email: address,
      email_verified_at: NOW.toISOString(),
    })
    expect(await emails(fromLink.answer.userId)).toEqual({
      email: `bob-${address}`,
      email_verified_at: null,
    })
  })

  it('sends a person who has that address already to the passkey they have', async () => {
    const { owner, ceremony } = await site()
    const address = `eve-${crypto.randomUUID().slice(0, 8)}@example.org`
    const first = await createInvitation(ceremony.db, {
      site: owner.site,
      role: 'author',
      userId: null,
      now: NOW,
      days: 7,
      email: address,
    })
    await markSent(ceremony.db, first.id, NOW)
    await register(ceremony, first.secret)
    const second = await createInvitation(ceremony.db, {
      site: owner.site,
      role: 'editor',
      userId: null,
      now: NOW,
      days: 7,
      email: address,
    })

    await expect(registrationOptions(ceremony, second.secret)).rejects.toThrow(
      'This address already has an account in this Hollware.',
    )
  })
})
