import { generatePersonalToken, generateReadToken } from '@hollware/core'
import { env } from 'cloudflare:workers'
import { describe, expect, it, vi } from 'vitest'

import { checkPersonalToken, recordTokenUse, type TokenCheck } from '../../src/auth/token.ts'
import { newSite, readUse, seedToken } from './support.ts'

const NOW = new Date('2026-10-12T18:30:00.000Z')

function at(site: string, now: Date = NOW) {
  return { sites: new Set([site]), now }
}

async function settle(check: TokenCheck): Promise<void> {
  if (check.ok && check.touch !== null) await check.touch
}

describe('checkPersonalToken: who the token is', () => {
  it('accepts a token of its site, with its own scopes narrowed to what the role of its user allows', async () => {
    const site = newSite()
    const seeded = await seedToken(env.DB, site, {
      scopes: ['content:write', 'content:read'],
      expiresAt: '2026-11-11T18:30:00.000Z',
    })

    const check = await checkPersonalToken(env.DB, seeded.token, at(site))

    expect(check).toEqual({
      ok: true,
      principal: {
        kind: 'token',
        userId: seeded.userId,
        tokenId: seeded.tokenId,
        site,
        scopes: ['content:read', 'content:write', 'review:read', 'review:comment'],
      },
      touch: expect.any(Promise),
    })
    await settle(check)
  })

  it('accepts a token that never expires', async () => {
    const site = newSite()
    const seeded = await seedToken(env.DB, site, { expiresAt: null })

    const check = await checkPersonalToken(env.DB, seeded.token, at(site))

    expect(check).toMatchObject({ ok: true, principal: { tokenId: seeded.tokenId } })
    await settle(check)
  })

  it('refuses a token nobody made as unknown', async () => {
    const site = newSite()
    await seedToken(env.DB, site)

    expect(await checkPersonalToken(env.DB, generatePersonalToken(), at(site))).toEqual({
      ok: false,
      reason: 'unknown',
    })
  })

  it('refuses a string without the shape of a token as unknown, even one whose hash is stored', async () => {
    const site = newSite()
    const secret = `not-a-token-${crypto.randomUUID()}`
    await seedToken(env.DB, site, { secret })

    expect(await checkPersonalToken(env.DB, secret, at(site))).toEqual({
      ok: false,
      reason: 'unknown',
    })
  })

  it('treats a token of another site as unknown, exactly like a token nobody made', async () => {
    const home = newSite()
    const stranger = newSite()
    const mine = await seedToken(env.DB, home)
    const theirs = await seedToken(env.DB, stranger)

    const asked = await checkPersonalToken(env.DB, theirs.token, at(home))

    expect(asked).toEqual({ ok: false, reason: 'unknown' })
    expect(asked).toEqual(await checkPersonalToken(env.DB, generatePersonalToken(), at(home)))
    expect(await readUse(env.DB, theirs.tokenId)).toMatchObject({ last_used_at: null })
    const own = await checkPersonalToken(env.DB, mine.token, at(home))
    expect(own).toMatchObject({ ok: true, principal: { site: home, tokenId: mine.tokenId } })
    const theirOwn = await checkPersonalToken(env.DB, theirs.token, at(stranger))
    expect(theirOwn).toMatchObject({ ok: true, principal: { site: stranger } })
    await settle(own)
    await settle(theirOwn)
  })
})

describe('checkPersonalToken: read tokens', () => {
  it('accepts a read token as a read principal that may only read, whatever its row holds', async () => {
    const site = newSite()
    const seeded = await seedToken(env.DB, site, {
      read: true,
      scopes: ['content:read', 'content:write', 'content:publish'],
    })

    const check = await checkPersonalToken(env.DB, seeded.token, at(site))

    expect(check).toEqual({
      ok: true,
      principal: {
        kind: 'read',
        userId: seeded.userId,
        tokenId: seeded.tokenId,
        site,
        scopes: ['content:read'],
      },
      touch: expect.any(Promise),
    })
    await settle(check)
  })

  it('refuses a token whose prefix is not the kind of its row, as unknown', async () => {
    const site = newSite()
    const personalAsRead = await seedToken(env.DB, site, {
      read: true,
      secret: generatePersonalToken(),
    })
    const readAsPersonal = await seedToken(env.DB, site, { secret: generateReadToken() })

    const answers = [
      await checkPersonalToken(env.DB, personalAsRead.token, at(site)),
      await checkPersonalToken(env.DB, readAsPersonal.token, at(site)),
    ]

    expect(answers).toEqual([
      { ok: false, reason: 'unknown' },
      { ok: false, reason: 'unknown' },
    ])
  })
})

describe('checkPersonalToken: a token that stopped working', () => {
  it.each([
    ['a date in the past', '2026-10-10T08:00:00.000Z'],
    [
      'a date that has not come yet, as a clock that runs ahead would write',
      '2026-10-12T18:32:00.000Z',
    ],
    ['a text nobody can read as a date', 'yesterday'],
    ['an empty text', ''],
  ])('refuses a token revoked with %s, and never records it as used', async (_label, revokedAt) => {
    const site = newSite()
    const seeded = await seedToken(env.DB, site, { revokedAt })

    expect(await checkPersonalToken(env.DB, seeded.token, at(site))).toEqual({
      ok: false,
      reason: 'revoked',
    })
    expect(await readUse(env.DB, seeded.tokenId)).toMatchObject({ last_used_at: null })
  })

  it('says revoked, and not expired, of a token that is both', async () => {
    const site = newSite()
    const seeded = await seedToken(env.DB, site, {
      revokedAt: '2026-10-10T08:00:00.000Z',
      expiresAt: '2026-10-11T00:00:00.000Z',
    })

    expect(await checkPersonalToken(env.DB, seeded.token, at(site))).toEqual({
      ok: false,
      reason: 'revoked',
    })
  })

  it.each([
    ['a millisecond after now', '2026-10-12T18:30:00.001Z', 'ok'],
    ['the instant of now', '2026-10-12T18:30:00.000Z', 'expired'],
    ['a millisecond before now', '2026-10-12T18:29:59.999Z', 'expired'],
    ['the instant of now, without milliseconds', '2026-10-12T18:30:00Z', 'expired'],
    ['a millisecond after now, with a +02:00 offset', '2026-10-12T20:30:00.001+02:00', 'ok'],
    ['the instant of now, with a +02:00 offset', '2026-10-12T20:30:00+02:00', 'expired'],
    ['a text that is not a date', 'soon', 'expired'],
    ['a text that is empty', '', 'expired'],
  ])('reads an expiry of %s (%s) as %s', async (_label, expiresAt, expected) => {
    const site = newSite()
    const seeded = await seedToken(env.DB, site, { expiresAt })

    const check = await checkPersonalToken(env.DB, seeded.token, at(site))

    if (expected === 'ok') {
      expect(check).toMatchObject({ ok: true, principal: { tokenId: seeded.tokenId } })
    } else {
      expect(check).toEqual({ ok: false, reason: 'expired' })
      expect(await readUse(env.DB, seeded.tokenId)).toMatchObject({ last_used_at: null })
    }
    await settle(check)
  })
})

describe('checkPersonalToken: the scopes of the role', () => {
  it.each<['editor' | 'author', string[]]>([
    [
      'editor',
      ['content:read', 'content:write', 'content:publish', 'review:read', 'review:comment'],
    ],
    ['author', ['content:read', 'content:write', 'review:read', 'review:comment']],
  ])(
    'accepts the token of a user whose role is %s, with every scope, and leaves it what the role allows',
    async (role, scopes) => {
      const site = newSite()
      const seeded = await seedToken(env.DB, site, { role })

      const check = await checkPersonalToken(env.DB, seeded.token, at(site))

      expect(check).toMatchObject({
        ok: true,
        principal: { kind: 'token', tokenId: seeded.tokenId, scopes },
      })
      await settle(check)
    },
  )

  it('reads the role at every request: demoting the owner takes the scopes away at once', async () => {
    const site = newSite()
    const seeded = await seedToken(env.DB, site)

    const before = await checkPersonalToken(env.DB, seeded.token, at(site))
    await env.DB.prepare("UPDATE members SET role = 'author' WHERE user_id = ?1")
      .bind(seeded.userId)
      .run()
    const after = await checkPersonalToken(env.DB, seeded.token, at(site))

    expect(before).toMatchObject({
      ok: true,
      principal: {
        scopes: [
          'content:read',
          'content:write',
          'content:publish',
          'schema:admin',
          'site:owner',
          'review:read',
          'review:comment',
        ],
      },
    })
    expect(after).toMatchObject({
      ok: true,
      principal: { scopes: ['content:read', 'content:write', 'review:read', 'review:comment'] },
    })
    await settle(before)
    await settle(after)
  })
})

describe('checkPersonalToken: last_used_at', () => {
  it('is written on the first use, with updated_at', async () => {
    const site = newSite()
    const seeded = await seedToken(env.DB, site)

    const check = await checkPersonalToken(env.DB, seeded.token, at(site))

    expect(check).toMatchObject({ ok: true, touch: expect.any(Promise) })
    await settle(check)
    expect(await readUse(env.DB, seeded.tokenId)).toEqual({
      last_used_at: '2026-10-12T18:30:00.000Z',
      updated_at: '2026-10-12T18:30:00.000Z',
    })
  })

  it('is written once an hour: not again within it, and again after it', async () => {
    const site = newSite()
    const seeded = await seedToken(env.DB, site)
    const checkAt = (iso: string) =>
      checkPersonalToken(env.DB, seeded.token, { sites: new Set([site]), now: new Date(iso) })
    const lastUsed = async () => (await readUse(env.DB, seeded.tokenId))?.last_used_at

    const first = await checkAt('2026-10-12T18:30:00.000Z')
    expect(first).toMatchObject({ ok: true, touch: expect.any(Promise) })
    await settle(first)
    expect(await lastUsed()).toBe('2026-10-12T18:30:00.000Z')

    for (const iso of ['2026-10-12T19:29:59.999Z', '2026-10-12T19:30:00.000Z']) {
      const within = await checkAt(iso)
      expect(within).toMatchObject({ ok: true, touch: null })
      expect(await lastUsed()).toBe('2026-10-12T18:30:00.000Z')
    }

    const after = await checkAt('2026-10-12T19:30:00.001Z')
    expect(after).toMatchObject({ ok: true, touch: expect.any(Promise) })
    await settle(after)
    expect(await lastUsed()).toBe('2026-10-12T19:30:00.001Z')
    const next = await checkAt('2026-10-12T19:31:00.000Z')
    expect(next).toMatchObject({ ok: true, touch: null })
    expect(await lastUsed()).toBe('2026-10-12T19:30:00.001Z')
  })

  it('never rejects when the write fails, and the token is accepted all the same', async () => {
    const site = newSite()
    const seeded = await seedToken(env.DB, site)
    const trigger = `refuse_touch_${crypto.randomUUID().replaceAll('-', '')}`
    await env.DB.prepare(
      `CREATE TRIGGER ${trigger} BEFORE UPDATE ON tokens WHEN OLD.id = '${seeded.tokenId}'
        BEGIN SELECT RAISE(ABORT, 'test: the update is refused'); END`,
    ).run()
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const check = await checkPersonalToken(env.DB, seeded.token, at(site))

      expect(check).toMatchObject({ ok: true, touch: expect.any(Promise) })
      if (check.ok) await expect(check.touch).resolves.toBeUndefined()
      expect(logged).toHaveBeenCalledTimes(1)
      expect(logged.mock.calls[0]?.[0]).toBe('hollware: could not record the last use of a token')
      expect(String(logged.mock.calls[0]?.[1])).toContain('test: the update is refused')
      expect(await readUse(env.DB, seeded.tokenId)).toEqual({
        last_used_at: null,
        updated_at: '2026-10-01T00:00:00.000Z',
      })
    } finally {
      logged.mockRestore()
      await env.DB.prepare(`DROP TRIGGER ${trigger}`).run()
    }
  })
})

describe('recordTokenUse', () => {
  it('writes only when last_used_at is missing or older than an hour, and only the token of its site', async () => {
    const site = newSite()
    const seeded = await seedToken(env.DB, site)
    const record = (iso: string, forSite: string = site) =>
      recordTokenUse(env.DB, { id: seeded.tokenId, site: forSite }, new Date(iso))

    await record('2026-10-12T18:30:00.000Z')
    const written = {
      last_used_at: '2026-10-12T18:30:00.000Z',
      updated_at: '2026-10-12T18:30:00.000Z',
    }
    expect(await readUse(env.DB, seeded.tokenId)).toEqual(written)

    await record('2026-10-12T19:29:59.999Z')
    expect(await readUse(env.DB, seeded.tokenId)).toEqual(written)
    await record('2026-10-12T19:30:00.000Z')
    expect(await readUse(env.DB, seeded.tokenId)).toEqual(written)

    await record('2026-10-12T21:00:00.000Z', `other-${site}`)
    expect(await readUse(env.DB, seeded.tokenId)).toEqual(written)

    await record('2026-10-12T19:30:00.001Z')
    expect(await readUse(env.DB, seeded.tokenId)).toEqual({
      last_used_at: '2026-10-12T19:30:00.001Z',
      updated_at: '2026-10-12T19:30:00.001Z',
    })
  })
})
