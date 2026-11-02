import { listBackups as listBackupsSpec } from '@hollware/core'
import { env } from 'cloudflare:workers'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { backupKey, backUpSite, type Backup } from '../../src/backup/run.ts'
import { listBackups } from '../../src/ops/backups.ts'
import { backupsIn } from '../../src/backup/run.ts'
import { handlers } from '../../src/ops/index.ts'
import { seedToken } from '../auth/support.ts'
import { callRaw, textOf } from '../mcp/support.ts'
import { boot, restoreLogs, SITE_KEY } from '../http/support.ts'
import { warmUpComark } from '../ops/support.ts'
import { createPost, newWorld, publishPost } from '../ops/world.ts'

vi.setConfig({ testTimeout: 60_000 })
beforeAll(warmUpComark, 120_000)
afterEach(() => {
  restoreLogs()
})

const at = (iso: string) => new Date(iso)

describe('the daily backup', () => {
  it('is made once a day after its hour, with every entry, and keeps 30 days', async () => {
    const world = await newWorld(env.DB, 'backup')
    const site = world.tenant.key
    const en = await createPost(world, { slug: 'kept', group: 'kept' })
    await createPost(world, { slug: 'guardado', locale: 'es', group: 'kept' })
    const live = await publishPost(world, en)
    await world.agent.updateDraft({
      id: en.id,
      version: live.version,
      markdown:
        '---\ntitle: Changed\ndescription: d\ndate: 2026-10-01\ntags: [a]\ntranslationGroup: kept\n---\nChanged.\n',
    })
    await env.MEDIA.put(backupKey(site, '2026-09-01'), '{}')
    await env.MEDIA.put(backupKey(site, '2026-09-20'), '{}')

    const early = await backUpSite(
      env.DB,
      env.MEDIA,
      world.tenant.site,
      at('2026-10-18T02:59:00.000Z'),
    )
    const made = await backUpSite(
      env.DB,
      env.MEDIA,
      world.tenant.site,
      at('2026-10-18T03:00:00.000Z'),
    )
    const again = await backUpSite(
      env.DB,
      env.MEDIA,
      world.tenant.site,
      at('2026-10-18T09:00:00.000Z'),
    )

    expect([early, made, again]).toEqual(['not_yet', 'made', 'done'])
    const object = await env.MEDIA.get(backupKey(site, '2026-10-18'))
    const backup: Backup = JSON.parse((await object?.text()) ?? '{}')
    expect([backup.hollware, backup.site, backup.at]).toEqual([
      'backup/2',
      site,
      '2026-10-18T03:00:00.000Z',
    ])
    expect(
      backup.entries.map((entry) => [
        entry.locale,
        entry.slug,
        entry.markdown.includes('Changed'),
        entry.published === null,
      ]),
    ).toEqual([
      ['en', 'kept', true, false],
      ['es', 'guardado', false, true],
    ])
    expect(await env.MEDIA.head(backupKey(site, '2026-09-01'))).toBeNull()
    expect(await env.MEDIA.head(backupKey(site, '2026-09-20'))).not.toBeNull()
  })

  it("follows the site's setting: its retention, and none when it turns them off", async () => {
    const world = await newWorld(env.DB, 'backup-setting')
    const site = world.tenant.site
    const week = { ...site, backups: { enabled: true, retentionDays: 7 } }
    const off = { ...site, backups: { enabled: false, retentionDays: 7 } }
    await env.MEDIA.put(backupKey(site.key, '2026-10-10'), '{}')
    await env.MEDIA.put(backupKey(site.key, '2026-10-12'), '{}')
    const dates = async () =>
      (await env.MEDIA.list({ prefix: `backups/${site.key}/` })).objects.map((object) =>
        object.key.slice(-15, -5),
      )

    const made = await backUpSite(env.DB, env.MEDIA, week, at('2026-10-18T03:00:00.000Z'))
    const kept = await dates()
    const none = await backUpSite(env.DB, env.MEDIA, off, at('2026-10-20T04:00:00.000Z'))
    const later = await dates()
    const dropped = await backUpSite(env.DB, env.MEDIA, off, at('2026-10-21T03:02:00.000Z'))

    expect([made, none, dropped]).toEqual(['made', 'off', 'off'])
    expect(kept).toEqual(['2026-10-12', '2026-10-18'])
    expect(later).toEqual(['2026-10-12', '2026-10-18'])
    expect(await dates()).toEqual(['2026-10-18'])
  })

  it('is listed newest first, and is unavailable without the bucket', async () => {
    const world = await newWorld(env.DB, 'backup-list')
    await backUpSite(env.DB, env.MEDIA, world.tenant.site, at('2026-10-16T05:00:00.000Z'))
    await backUpSite(env.DB, env.MEDIA, world.tenant.site, at('2026-10-17T05:00:00.000Z'))

    const listed = await listBackups({}, { ...world.context(), backups: backupsIn(env.MEDIA) })
    const none = await listBackups({}, { ...world.context(), backups: null })

    expect(listed.backups?.map((backup) => backup.date)).toEqual(['2026-10-17', '2026-10-16'])
    expect(none.outcome).toBe('unavailable')
  })
})

describe('a site rebuilt from its backup', () => {
  it('gets back every entry as it was, and the backup keeps the redirects and the images', async () => {
    const world = await newWorld(env.DB, 'backup-source')
    const post = await createPost(world, { slug: 'moved-post', group: 'moved' })
    await createPost(world, { slug: 'movido', locale: 'es', group: 'moved' })
    const live = await publishPost(world, post)
    const moved = await world.agent.moveEntry({
      id: post.id,
      version: live.version,
      slug: 'renamed-post',
    })
    if (moved.entry === undefined) throw new Error(JSON.stringify(moved))
    await world.agent.updateDraft({
      id: post.id,
      version: moved.entry.version,
      markdown:
        '---\ntitle: Edited\ndescription: d\ndate: 2026-10-01\ntags: [a]\ntranslationGroup: moved\n---\nEdited after the publish.\n',
    })
    await createPost(world, { slug: 'un-borrador', locale: 'es', group: 'draft' })
    const asset = `ast_${'a'.repeat(26)}`
    await env.DB.prepare(
      `INSERT INTO assets (id, site_id, sha256, format, width, height, bytes, widths, original_format, original_bytes, alt, filename, created_by, created_at, updated_at)
       VALUES (?1, ?2, ?3, 'image/webp', 640, 480, 1234, '[640]', 'image/png', 2345, 'A diagram', 'diagram.png', ?4, ?5, ?5)`,
    )
      .bind(
        asset,
        world.tenant.key,
        'b'.repeat(64),
        world.tenant.userId,
        '2026-10-02T00:00:00.000Z',
      )
      .run()

    const definition = { locales: ['en', 'es'], defaultLocale: 'en', collections: {} }
    await env.DB.prepare('UPDATE sites SET definition = ?1 WHERE id = ?2')
      .bind(JSON.stringify(definition), world.tenant.key)
      .run()

    await backUpSite(env.DB, env.BACKUPS, world.tenant.site, at('2026-10-18T03:00:00.000Z'))
    const object = await env.BACKUPS.get(backupKey(world.tenant.key, '2026-10-18'))
    const backup: Backup = JSON.parse((await object?.text()) ?? '{}')
    const rebuilt = await newWorld(env.DB, 'backup-rebuilt')
    const drafts = []
    for (const entry of backup.entries) {
      const draft = await rebuilt.agent.createDraft({
        collection: entry.collection,
        locale: entry.locale,
        slug: entry.slug,
        markdown: entry.published ?? entry.markdown,
      })
      if (draft.entry !== undefined) drafts.push({ entry, draft: draft.entry })
    }
    for (const { entry, draft } of drafts) {
      if (entry.status !== 'published') continue
      const published = await publishPost(rebuilt, draft)
      if (entry.published !== null) {
        await rebuilt.agent.updateDraft({
          id: published.id,
          version: published.version,
          markdown: entry.markdown,
        })
      }
    }
    const contentOf = async (of: typeof world) => {
      const listed = await of.agent.listEntries({ collection: 'blog', limit: 50 })
      const rows = await Promise.all(
        (listed.entries ?? []).map(async (summary) => {
          const where = { collection: 'blog', locale: summary.locale, slug: summary.slug }
          const head = await of.agent.getEntry({ ...where, formats: ['markdown'] })
          const live = await of.reader.getEntry({ ...where, formats: ['markdown'] })
          return [
            summary.locale,
            summary.slug,
            summary.status,
            head.entry?.markdown,
            live.entry?.markdown ?? null,
          ]
        }),
      )
      return rows.sort((a, b) => `${a[0]}/${a[1]}`.localeCompare(`${b[0]}/${b[1]}`))
    }

    expect(backup.definition).toEqual(definition)
    expect(await contentOf(rebuilt)).toEqual(await contentOf(world))
    expect(backup.redirects).toEqual([
      {
        collection: 'blog',
        locale: 'en',
        from: 'moved-post',
        to: 'renamed-post',
        fromPath: '/en/blog/moved-post/',
        toPath: '/en/blog/renamed-post/',
        entryId: post.id,
      },
    ])
    expect(backup.assets).toEqual([
      {
        id: asset,
        sha256: 'b'.repeat(64),
        format: 'image/webp',
        width: 640,
        height: 480,
        bytes: 1234,
        widths: [640],
        originalFormat: 'image/png',
        originalBytes: 2345,
        alt: 'A diagram',
        filename: 'diagram.png',
        createdAt: '2026-10-02T00:00:00.000Z',
      },
    ])
  })
})

describe('list_backups', () => {
  it('lists the backups of BACKUPS over MCP and over /v1/ops, and those of MEDIA without it', async () => {
    const owner = await seedToken(env.DB, SITE_KEY, { expiresAt: '2026-12-01T00:00:00.000Z' })
    await env.BACKUPS.put(backupKey(SITE_KEY, '2026-10-20'), '{}')
    await env.MEDIA.put(backupKey(SITE_KEY, '2026-10-19'), '{}')
    const both = boot({ handlers, bindings: { MEDIA: env.MEDIA, BACKUPS: env.BACKUPS } })
    const alone = boot({ handlers, bindings: { MEDIA: env.MEDIA } })
    const overOps = async (worker: typeof both) =>
      (
        await (
          await worker.send('/v1/ops/list_backups', {
            method: 'POST',
            token: owner.token,
            headers: { 'content-type': 'application/json' },
            body: '{}',
          })
        ).json<{ backups: { date: string }[] }>()
      ).backups.map((backup) => backup.date)
    const overMcp = async (worker: typeof both) => {
      const answer = await callRaw(worker.endpoint(owner.token), 'modern', 'list_backups', {})
      const listed = listBackupsSpec.output.parse(textOf(answer.result))
      return (listed.backups ?? []).map((backup) => backup.date)
    }

    expect(await overMcp(both)).toEqual(['2026-10-20'])
    expect(await overOps(both)).toEqual(['2026-10-20'])
    expect(await overMcp(alone)).toEqual(['2026-10-19'])
  })
})

describe('GET /v1/backups/<date>', () => {
  it('serves a backup to an owner of the site, and to no one else, from BACKUPS before MEDIA', async () => {
    const owner = await seedToken(env.DB, SITE_KEY, { expiresAt: '2026-12-01T00:00:00.000Z' })
    const writer = await seedToken(env.DB, SITE_KEY, {
      expiresAt: '2026-12-01T00:00:00.000Z',
      scopes: ['content:read', 'content:write', 'content:publish', 'schema:admin'],
    })
    await env.BACKUPS.put(backupKey(SITE_KEY, '2026-10-18'), '{"hollware":"backup/2"}')
    await env.MEDIA.put(backupKey(SITE_KEY, '2026-10-18'), '{"in":"media"}')
    const worker = boot({ bindings: { MEDIA: env.MEDIA, BACKUPS: env.BACKUPS } })
    const alone = boot({ bindings: { MEDIA: env.MEDIA } })

    const mine = await worker.send('/v1/backups/2026-10-18', { token: owner.token })
    const missing = await worker.send('/v1/backups/2026-10-19', { token: owner.token })
    const none = await worker.send('/v1/backups/2026-10-18')
    const unscoped = await worker.send('/v1/backups/2026-10-18', { token: writer.token })
    const fromMedia = await alone.send('/v1/backups/2026-10-18', { token: owner.token })

    expect([mine.status, missing.status, none.status, unscoped.status]).toEqual([
      200, 404, 401, 403,
    ])
    expect([await mine.text(), await fromMedia.text()]).toEqual([
      '{"hollware":"backup/2"}',
      '{"in":"media"}',
    ])
    expect(mine.headers.get('cache-control')).toBe('private, no-store')
    expect(unscoped.headers.get('www-authenticate')).toContain('scope="site:owner"')
  })
})
