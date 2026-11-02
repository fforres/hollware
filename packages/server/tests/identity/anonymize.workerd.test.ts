import { FORMER_PERSON, newId } from '@hollware/core'
import { env } from 'cloudflare:workers'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { anonymizePerson, formerPeople } from '../../src/identity/anonymize.ts'
import { removeMember } from '../../src/identity/people.ts'
import { agent, ALL_SCOPES, blogPost, warmUpComark } from '../ops/support.ts'
import { newWorld, type World } from '../ops/world.ts'

vi.setConfig({ testTimeout: 60_000 })
beforeAll(warmUpComark, 120_000)

const NOW = '2026-10-28T10:00:00.000Z'

const TRACES = {
  revisions: 'SELECT count(*) FROM revisions WHERE site_id = ?1 AND actor_user_id = ?2',
  publications: 'SELECT count(*) FROM publications WHERE site_id = ?1 AND actor_user_id = ?2',
  schedules: 'SELECT count(*) FROM schedules WHERE site_id = ?1 AND actor_user_id = ?2',
  unpublishes: 'SELECT count(*) FROM unpublishes WHERE site_id = ?1 AND actor_user_id = ?2',
  requested: 'SELECT count(*) FROM reviews WHERE site_id = ?1 AND requested_by = ?2',
  decided: 'SELECT count(*) FROM reviews WHERE site_id = ?1 AND decided_by = ?2',
  comments: 'SELECT count(*) FROM review_comments WHERE site_id = ?1 AND author_id = ?2',
  changes: 'SELECT count(*) FROM site_changes WHERE site_id = ?1 AND actor_user_id = ?2',
  acted: 'SELECT count(*) FROM audit_log WHERE site_id = ?1 AND actor_user_id = ?2',
  named:
    "SELECT count(*) FROM audit_log WHERE site_id = ?1 AND target_type = 'user' AND target_id = ?2",
  assets: 'SELECT count(*) FROM assets WHERE site_id = ?1 AND created_by = ?2',
  purges: 'SELECT count(*) FROM entry_purges WHERE site_id = ?1 AND purged_by = ?2',
  tokens: 'SELECT count(*) FROM tokens WHERE site_id = ?1 AND user_id = ?2',
  invitations: 'SELECT count(*) FROM invitations WHERE site_id = ?1 AND user_id = ?2',
}

async function tracesOf(site: string, userId: string): Promise<Record<string, number>> {
  const counts = await env.DB.batch<Record<string, number>>(
    Object.values(TRACES).map((sql) =>
      env.DB.prepare(sql.replace('count(*)', 'count(*) AS n')).bind(site, userId),
    ),
  )
  return Object.fromEntries(
    Object.keys(TRACES).map((name, index) => [name, counts[index]?.results[0]?.['n'] ?? -1]),
  )
}

async function seedPerson(name: string, worlds: readonly World[]) {
  const userId = newId('usr')
  const sites = worlds.map((world) => world.tenant.key)
  const tokens = sites.map(() => newId('tok'))
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO users (id, name, role, email, email_verified_at, created_at, updated_at) VALUES (?1, ?2, 'editor', ?4, ?3, ?3, ?3)",
    ).bind(userId, name, NOW, `${userId.toLowerCase()}@example.org`),
    env.DB.prepare(
      "INSERT INTO identities (id, user_id, provider, subject, email, created_at, updated_at) VALUES (?1, ?2, 'google', ?2, 'x@example.org', ?3, ?3)",
    ).bind(newId('idn'), userId, NOW),
    ...sites.flatMap((site, index) => [
      env.DB.prepare(
        "INSERT INTO members (id, site_id, user_id, role, created_at, updated_at) VALUES (?1, ?2, ?3, 'editor', ?4, ?4)",
      ).bind(newId('mbr'), site, userId, NOW),
      env.DB.prepare(
        `INSERT INTO tokens (id, site_id, user_id, label, hash, scopes, created_at, updated_at)
          VALUES (?1, ?2, ?3, 'At home', ?4, '["content:write"]', ?5, ?5)`,
      ).bind(tokens[index], site, userId, crypto.randomUUID(), NOW),
      env.DB.prepare(
        `INSERT INTO invitations (id, site_id, hash, role, user_id, expires_at, used_at, created_at, updated_at)
          VALUES (?1, ?2, ?3, 'editor', ?4, ?5, ?5, ?5, ?5)`,
      ).bind(newId('inv'), site, crypto.randomUUID(), userId, NOW),
    ]),
    env.DB.prepare(
      `INSERT INTO passkeys (id, user_id, credential_id, public_key, counter, transports, label, created_at, updated_at)
        VALUES (?1, ?2, ?3, 'key', 0, '[]', 'Laptop', ?4, ?4)`,
    ).bind(newId('pky'), userId, crypto.randomUUID(), NOW),
    env.DB.prepare(
      'INSERT INTO sessions (id, user_id, hash, expires_at, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4, ?4)',
    ).bind(newId('ses'), userId, crypto.randomUUID(), NOW),
  ])
  const as = (world: World) =>
    agent(
      world.context({
        principal: {
          kind: 'token',
          userId,
          tokenId: tokens[worlds.indexOf(world)] ?? '',
          site: world.tenant.key,
          scopes: ALL_SCOPES,
        },
        client: { name: 'Claude Code', version: '2.1' },
      }),
    )
  return { userId, as }
}

async function leaves(site: string, owner: string, userId: string) {
  await removeMember(env.DB, { site, userId, owners: true })
  await env.DB.prepare(
    `INSERT INTO audit_log (id, site_id, action, outcome, actor_kind, actor_user_id, target_type, target_id, created_at, updated_at)
      VALUES (?1, ?2, 'member.remove', 'ok', 'user', ?3, 'user', ?4, ?5, ?5)`,
  )
    .bind(newId('aud'), site, owner, userId, NOW)
    .run()
}

const post = (title: string, group: string) =>
  blogPost({ title, date: '2026-10-01', tags: '\n  - cloudflare', translationGroup: group })

describe('the anonymization of a former member', () => {
  it('names the former person wherever the site named them, keeps what they did, and forgets them once no site keeps them', async () => {
    const world = await newWorld(env.DB, 'anonymize')
    const site = world.tenant.key
    const owner = world.tenant.userId
    const ana = await seedPerson('Ana Former', [world])
    const as = ana.as(world)
    const created = await as.createDraft({
      collection: 'blog',
      locale: 'en',
      slug: 'by-ana',
      markdown: post('By Ana', 'by-ana'),
    })
    await as.createDraft({
      collection: 'blog',
      locale: 'es',
      slug: 'de-ana',
      markdown: post('De Ana', 'by-ana'),
    })
    const published = await as.publish({
      id: created.entry?.id ?? '',
      version: created.entry?.version ?? 0,
    })
    const updated = await as.updateDraft({
      id: created.entry?.id ?? '',
      version: published.entry?.version ?? 0,
      markdown: post('By Ana, again', 'by-ana'),
    })
    const asked = await as.requestReview({
      id: created.entry?.id ?? '',
      version: updated.entry?.version ?? 0,
    })
    await as.commentReview({ id: asked.review?.id ?? '', body: 'Ana comments.' })
    const theirs = await world.agent.createDraft({
      collection: 'blog',
      locale: 'en',
      slug: 'by-the-owner',
      markdown: post('By the owner', 'by-the-owner'),
    })
    await world.agent.createDraft({
      collection: 'blog',
      locale: 'es',
      slug: 'del-dueno',
      markdown: post('Del dueño', 'by-the-owner'),
    })
    const toDecide = await world.agent.requestReview({
      id: theirs.entry?.id ?? '',
      version: theirs.entry?.version ?? 0,
    })
    await as.rejectReview({ id: toDecide.review?.id ?? '', reason: 'Not yet.' })
    const entry = created.entry?.id ?? ''
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO schedules (id, site_id, entry_id, scheduled_at, version, acknowledged, actor_kind, actor_user_id, actor_token_id, actor_meta, created_at, updated_at)
          VALUES (?1, ?2, ?3, ?4, 1, '[]', 'user', ?5, NULL, '{"name":"Claude Code"}', ?4, ?4)`,
      ).bind(newId('sch'), site, entry, NOW, ana.userId),
      env.DB.prepare(
        `INSERT INTO unpublishes (id, site_id, entry_id, unpublish_at, actor_kind, actor_user_id, actor_token_id, actor_meta, created_at, updated_at)
          VALUES (?1, ?2, ?3, ?4, 'user', ?5, NULL, '{"name":"Claude Code"}', ?4, ?4)`,
      ).bind(newId('unp'), site, entry, NOW, ana.userId),
      env.DB.prepare(
        `INSERT INTO site_changes (id, site_id, version, actor_user_id, actor_meta, created_at, updated_at)
          VALUES (?1, ?2, 7, ?3, '{"name":"Claude Code"}', ?4, ?4)`,
      ).bind(newId('sit'), site, ana.userId, NOW),
      env.DB.prepare(
        `INSERT INTO audit_log (id, site_id, action, outcome, actor_kind, actor_user_id, actor_meta, detail, ip_hash, created_at, updated_at)
          VALUES (?1, ?2, 'token.create', 'ok', 'user', ?3, '{"name":"Claude Code"}', '{"kind":"personal","label":"Ana at home"}', 'a-hash', ?4, ?4)`,
      ).bind(newId('aud'), site, ana.userId, NOW),
      env.DB.prepare(
        `INSERT INTO assets (id, site_id, sha256, format, width, height, bytes, widths, original_format, original_bytes, alt, filename, created_by, created_at, updated_at)
          VALUES (?1, ?2, ?3, 'image/webp', 640, 480, 1234, '[640]', 'image/png', 2345, 'A diagram', 'diagram.png', ?4, ?5, ?5)`,
      ).bind(newId('ast'), site, 'd'.repeat(64), ana.userId, NOW),
      env.DB.prepare(
        "INSERT INTO entry_purges (id, site_id, entry_id, purged_by, created_at, updated_at) VALUES (?1, ?2, 'ent_gone', ?3, ?4, ?4)",
      ).bind(newId('prg'), site, ana.userId, NOW),
    ])
    const markdown = () =>
      env.DB.prepare(
        'SELECT markdown, actor_user_id, actor_token_id, actor_meta FROM revisions WHERE site_id = ?1 AND entry_id = ?2 ORDER BY created_at, id',
      )
        .bind(site, entry)
        .all()
    const requestedBy = () =>
      env.DB.prepare(
        "SELECT kind, json_extract(payload, '$.review.requestedBy') AS requestedBy FROM outbox WHERE site_id = ?1 AND kind LIKE 'review.%' ORDER BY kind, json_extract(payload, '$.review.id') = ?2 DESC",
      )
        .bind(site, asked.review?.id ?? '')
        .all()
    const before = await tracesOf(site, ana.userId)
    const written = (await markdown()).results.map((row) => row['markdown'])
    const named = await requestedBy()

    const asMember = await anonymizePerson(env.DB, { site, userId: ana.userId, now: NOW })
    const whileMember = await tracesOf(site, ana.userId)
    const listedWhileMember = await formerPeople(env.DB, site)
    await leaves(site, owner, ana.userId)
    const listed = await formerPeople(env.DB, site)
    const outcome = await anonymizePerson(env.DB, { site, userId: ana.userId, now: NOW })
    const again = await anonymizePerson(env.DB, { site, userId: ana.userId, now: NOW })

    expect(before).toEqual({
      revisions: 3,
      publications: 1,
      schedules: 1,
      unpublishes: 1,
      requested: 1,
      decided: 1,
      comments: 1,
      changes: 1,
      acted: 1,
      named: 0,
      assets: 1,
      purges: 1,
      tokens: 1,
      invitations: 1,
    })
    expect(named.results).toEqual([
      { kind: 'review.decided', requestedBy: 'Owner' },
      { kind: 'review.requested', requestedBy: 'Ana Former' },
      { kind: 'review.requested', requestedBy: 'Owner' },
    ])
    expect([asMember, whileMember, listedWhileMember]).toEqual(['member', before, []])
    expect(listed).toEqual([{ id: ana.userId, name: 'Ana Former' }])
    expect([outcome, again]).toEqual(['gone', 'not_found'])
    expect(await tracesOf(site, ana.userId)).toEqual(
      Object.fromEntries(Object.keys(TRACES).map((name) => [name, 0])),
    )
    expect(await tracesOf(site, FORMER_PERSON)).toEqual({
      ...before,
      named: 1,
      tokens: 0,
      invitations: 0,
    })
    expect((await markdown()).results).toEqual(
      written.map((text) => ({
        markdown: text,
        actor_user_id: FORMER_PERSON,
        actor_token_id: null,
        actor_meta: null,
      })),
    )
    expect((await requestedBy()).results).toEqual([
      { kind: 'review.decided', requestedBy: 'Owner' },
      { kind: 'review.requested', requestedBy: null },
      { kind: 'review.requested', requestedBy: 'Owner' },
    ])
    expect(
      await env.DB.prepare(
        `SELECT (SELECT detail FROM audit_log WHERE site_id = ?1 AND action = 'token.create') AS detail,
                (SELECT count(*) FROM audit_log WHERE site_id = ?1 AND (ip_hash IS NOT NULL OR actor_meta IS NOT NULL) AND actor_user_id = ?3) AS identifying,
                (SELECT count(*) FROM reviews WHERE site_id = ?1 AND requested_meta IS NOT NULL AND requested_by = ?3) AS requestedMeta,
                (SELECT count(*) FROM review_comments WHERE site_id = ?1 AND author_meta IS NOT NULL) AS commentMeta,
                (SELECT count(*) FROM site_changes WHERE site_id = ?1 AND actor_meta IS NOT NULL) AS changeMeta,
                (SELECT count(*) FROM users WHERE id = ?2) AS users,
                (SELECT count(*) FROM passkeys WHERE user_id = ?2) AS passkeys,
                (SELECT count(*) FROM sessions WHERE user_id = ?2) AS sessions,
                (SELECT count(*) FROM identities WHERE user_id = ?2) AS identities,
                (SELECT name FROM users WHERE id = ?3) AS former,
                (SELECT count(*) FROM anonymizations) AS open`,
      )
        .bind(site, ana.userId, FORMER_PERSON)
        .first(),
    ).toEqual({
      detail: '{"kind":"personal"}',
      identifying: 0,
      requestedMeta: 0,
      commentMeta: 0,
      changeMeta: 0,
      users: 0,
      passkeys: 0,
      sessions: 0,
      identities: 0,
      former: 'Former member',
      open: 0,
    })
    expect(await formerPeople(env.DB, site)).toEqual([])
  })

  it('keeps a person another site still has, and nothing of that site changes', async () => {
    const world = await newWorld(env.DB, 'anonymize-here')
    const elsewhere = await newWorld(env.DB, 'anonymize-there')
    const site = world.tenant.key
    const other = elsewhere.tenant.key
    const bea = await seedPerson('Bea Both', [world, elsewhere])
    await bea.as(world).createDraft({
      collection: 'blog',
      locale: 'en',
      slug: 'by-bea-here',
      markdown: post('By Bea here', 'by-bea-here'),
    })
    await bea.as(elsewhere).createDraft({
      collection: 'blog',
      locale: 'en',
      slug: 'by-bea-there',
      markdown: post('By Bea there', 'by-bea-there'),
    })
    await leaves(site, world.tenant.userId, bea.userId)
    const there = await tracesOf(other, bea.userId)

    const outcome = await anonymizePerson(env.DB, { site, userId: bea.userId, now: NOW })
    const elsewhereOutcome = await anonymizePerson(env.DB, {
      site: other,
      userId: bea.userId,
      now: NOW,
    })

    expect([outcome, elsewhereOutcome]).toEqual(['anonymized', 'member'])
    expect(await tracesOf(site, bea.userId)).toEqual(
      Object.fromEntries(Object.keys(TRACES).map((name) => [name, 0])),
    )
    expect(await tracesOf(other, bea.userId)).toEqual(there)
    expect(there).toMatchObject({ revisions: 1, tokens: 1, invitations: 1 })
    expect(
      await env.DB.prepare(
        `SELECT (SELECT name FROM users WHERE id = ?1) AS name,
                (SELECT email IS NOT NULL FROM users WHERE id = ?1) AS email,
                (SELECT count(*) FROM passkeys WHERE user_id = ?1) AS passkeys,
                (SELECT count(*) FROM sessions WHERE user_id = ?1) AS sessions,
                (SELECT count(*) FROM identities WHERE user_id = ?1) AS identities`,
      )
        .bind(bea.userId)
        .first(),
    ).toEqual({ name: 'Bea Both', email: 1, passkeys: 1, sessions: 1, identities: 1 })
  })

  it('keeps a person another site has as a member, or whom its activity log names, as actor or as target', async () => {
    const world = await newWorld(env.DB, 'anonymize-logged')
    const elsewhere = await newWorld(env.DB, 'anonymize-logging')
    const site = world.tenant.key
    const cleo = await seedPerson('Cleo Logged', [world])
    const dan = await seedPerson('Dan Named', [world])
    const fay = await seedPerson('Fay Member', [world])
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO audit_log (id, site_id, action, outcome, actor_kind, actor_user_id, created_at, updated_at) VALUES (?1, ?2, 'publish', 'ok', 'user', ?3, ?4, ?4)",
      ).bind(newId('aud'), elsewhere.tenant.key, cleo.userId, NOW),
      env.DB.prepare(
        "INSERT INTO audit_log (id, site_id, action, outcome, actor_kind, target_type, target_id, created_at, updated_at) VALUES (?1, ?2, 'member.role', 'ok', 'user', 'user', ?3, ?4, ?4)",
      ).bind(newId('aud'), elsewhere.tenant.key, dan.userId, NOW),
      env.DB.prepare(
        "INSERT INTO members (id, site_id, user_id, role, created_at, updated_at) VALUES (?1, ?2, ?3, 'author', ?4, ?4)",
      ).bind(newId('mbr'), elsewhere.tenant.key, fay.userId, NOW),
    ])
    await leaves(site, world.tenant.userId, cleo.userId)
    await leaves(site, world.tenant.userId, dan.userId)
    await leaves(site, world.tenant.userId, fay.userId)

    expect([
      await anonymizePerson(env.DB, { site, userId: cleo.userId, now: NOW }),
      await anonymizePerson(env.DB, { site, userId: dan.userId, now: NOW }),
      await anonymizePerson(env.DB, { site, userId: fay.userId, now: NOW }),
    ]).toEqual(['anonymized', 'anonymized', 'anonymized'])
    expect(
      (
        await env.DB.prepare('SELECT name FROM users WHERE id IN (?1, ?2, ?3) ORDER BY name')
          .bind(cleo.userId, dan.userId, fay.userId)
          .all()
      ).results,
    ).toEqual([{ name: 'Cleo Logged' }, { name: 'Dan Named' }, { name: 'Fay Member' }])
  })

  it('leaves alone a person who came back, and one the log names but who never left', async () => {
    const world = await newWorld(env.DB, 'anonymize-back')
    const site = world.tenant.key
    const owner = world.tenant.userId
    const eve = await seedPerson('Eve Back', [world])
    const zed = await seedPerson('Zed Stranger', [])
    await leaves(site, owner, eve.userId)
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO members (id, site_id, user_id, role, created_at, updated_at) VALUES (?1, ?2, ?3, 'author', ?4, ?4)",
      ).bind(newId('mbr'), site, eve.userId, NOW),
      ...(
        [
          ['member.remove', 'failed', 'user'],
          ['member.role', 'ok', 'user'],
          ['member.remove', 'ok', 'invitation'],
        ] as const
      ).map(([action, outcome, type]) =>
        env.DB.prepare(
          'INSERT INTO audit_log (id, site_id, action, outcome, actor_kind, actor_user_id, target_type, target_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)',
        ).bind(newId('aud'), site, action, outcome, 'user', owner, type, zed.userId, NOW),
      ),
    ])
    const before = await tracesOf(site, eve.userId)

    expect(await formerPeople(env.DB, site)).toEqual([])
    expect([
      await anonymizePerson(env.DB, { site, userId: eve.userId, now: NOW }),
      await anonymizePerson(env.DB, { site, userId: zed.userId, now: NOW }),
    ]).toEqual(['member', 'not_found'])
    expect(await tracesOf(site, eve.userId)).toEqual(before)
    expect(before).toMatchObject({ tokens: 1, invitations: 1, named: 1 })
  })
})
