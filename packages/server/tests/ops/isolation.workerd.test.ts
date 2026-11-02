import { env } from 'cloudflare:workers'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import {
  newId,
  OPERATIONS,
  siteDefinitionData,
  type OperationByName,
  type OperationName,
} from '@hollware/core'
import type * as z from 'zod'

import { contentFixture } from '../../../../tests/fixtures/content.ts'
import { createAnalyticsSources } from '../../src/analytics/sources.ts'
import { backupsIn } from '../../src/backup/run.ts'
import { createD1Store } from '../../src/db/index.ts'
import { d1Catalog, d1Uploads, r2Files } from '../../src/media/cloudflare.ts'
import { handlers } from '../../src/ops/index.ts'
import { invoke } from '../../src/ops/invoke.ts'
import type { OperationContext } from '../../src/ops/types.ts'
import type { Actor, Clock } from '../../src/ports.ts'
import { seal } from '../../src/structure/seal.ts'
import { createSecretStore, createStructureStore } from '../../src/structure/store.ts'
import { fixedClock, insertEntries } from '../db/support.ts'
import { seedSite, type SeededEntry, type SeededSite } from '../support/sites.ts'
import { agent, BINDING, blogPost, contextFor, tenantOf, warmUpComark } from './support.ts'
import { snapshotOf, START } from './world.ts'

vi.setConfig({ testTimeout: 60_000 })
beforeAll(warmUpComark, 120_000)

interface Entries {
  readonly english: SeededEntry
  readonly spanish: SeededEntry
  readonly draft: SeededEntry
}

function entriesOf(site: SeededSite): Entries {
  const [english, spanish, draft] = site.entries
  if (english === undefined || spanish === undefined || draft === undefined) {
    throw new Error('seedSite no longer seeds three entries')
  }
  return { english, spanish, draft }
}

const ONLY_THERE = { collection: 'blog', locale: 'en', slug: 'only-in-the-other-site' }

async function seedForeign(site: SeededSite): Promise<string> {
  const actor: Actor = { kind: 'token', userId: site.userId, tokenId: site.tokenId, meta: null }
  const english = { entry: newId('ent'), revision: newId('rev') }
  const now = '2026-10-13T10:00:00.000Z'
  await insertEntries(env.DB, { site: site.site, actor }, [
    {
      id: english.entry,
      slug: ONLY_THERE.slug,
      locale: 'en',
      translationGroup: 'only-there',
      updatedAt: now,
      revisions: [{ id: english.revision, tags: ['only-there-tag'] }],
      published: { revision: english.revision, sortKey: now, at: now },
    },
    {
      id: newId('ent'),
      slug: 'solo-en-el-otro-sitio',
      locale: 'es',
      translationGroup: 'only-there',
      updatedAt: now,
      revisions: [{ id: newId('rev') }],
    },
  ])
  return english.entry
}

const MASTER = 'i'.repeat(40)

const CALLER_DEFINITION = siteDefinitionData.parse({
  locales: ['es', 'en'],
  defaultLocale: 'es',
  collections: {
    blog: {
      schema: { type: 'object', properties: { title: { type: 'string' } } },
      routes: { es: '/blog/:slug/', en: '/en/blog/:slug/' },
    },
  },
})

const OTHER_DEFINITION = siteDefinitionData.parse({
  ...CALLER_DEFINITION,
  collections: {
    ...CALLER_DEFINITION.collections,
    news: {
      schema: { type: 'object', properties: { title: { type: 'string' } } },
      routes: { es: '/noticias/:slug/', en: '/en/news/:slug/' },
    },
  },
  events: { webhooks: [{ name: 'deploy', url: 'https://hooks.example.com/deploy' }] },
})

async function defineStructure(site: string, definition: unknown): Promise<void> {
  await env.DB.prepare('UPDATE sites SET definition = ?1, version = 1 WHERE id = ?2')
    .bind(JSON.stringify(definition), site)
    .run()
}

async function posthog(url: string): Promise<Response> {
  if (url.endsWith('/@current/')) return Response.json({ id: 7, name: 'Blog' })
  return Response.json({
    results: [
      ['/en/blog/edge-caching-basics/', 40],
      ['/en/blog/only-in-the-other-site/', 30],
    ],
  })
}

function withPorts(context: OperationContext, clock: Clock): OperationContext {
  const now = () => clock.now()
  return {
    ...context,
    site: { ...context.site, url: 'https://blog.example.com' },
    structure: {
      store: createStructureStore(env.DB, now),
      changed: async () => {},
      secrets: {
        make: async (site, name) => {
          await createSecretStore(env.DB, now).write(
            site,
            name,
            await seal(MASTER, 'whsec_made', { site, name }),
          )
          return 'whsec_made'
        },
      },
    },
    media: {
      files: r2Files(env.MEDIA),
      images: null,
      catalog: d1Catalog(env.DB),
      uploads: d1Uploads(env.DB),
      baseUrl: 'https://cms.example.com/assets/',
      download: () => Promise.reject(new Error('no network in this test')),
    },
    analytics: createAnalyticsSources({
      db: env.DB,
      master: MASTER,
      fetch: posthog,
      cache: null,
      now,
    }),
    backups: backupsIn(env.MEDIA),
  }
}

function spec<Name extends OperationName>(name: Name): OperationByName<Name> {
  const found = OPERATIONS.find(
    (operation): operation is OperationByName<Name> => operation.name === name,
  )
  if (found === undefined) throw new Error(`no operation ${name}`)
  return found
}

async function run<Input extends z.ZodType, Output extends z.ZodType>(
  spec: { readonly name: OperationName; readonly input: Input; readonly output: Output },
  raw: z.input<Input>,
  context: OperationContext,
): Promise<z.output<Output>> {
  const operation = OPERATIONS.find((candidate) => candidate.name === spec.name)
  if (operation === undefined) throw new Error(`no operation ${spec.name}`)
  return spec.output.parse(await invoke(handlers, operation, spec.input.parse(raw), context))
}

async function seedPair(callerIs: 'home' | 'stranger') {
  const suffix = crypto.randomUUID()
  const home = await seedSite(env.DB, `home-${suffix}`)
  const stranger = await seedSite(env.DB, `stranger-${suffix}`)
  const [mine, theirs] = callerIs === 'home' ? [home, stranger] : [stranger, home]
  const time = fixedClock(START)
  const store = createD1Store(env.DB, { clock: time.clock })
  const options = { clock: time.clock }
  const callerTenant = tenantOf(mine.site, mine.userId, mine.tokenId)
  const otherTenant = tenantOf(theirs.site, theirs.userId, theirs.tokenId)
  const otherOnly = await seedForeign(theirs)
  await defineStructure(mine.site, CALLER_DEFINITION)
  await defineStructure(theirs.site, OTHER_DEFINITION)

  return {
    time,
    ports: {
      caller: withPorts(contextFor(callerTenant, store, options), time.clock),
      other: withPorts(contextFor(otherTenant, store, options), time.clock),
    },
    caller: agent(contextFor(callerTenant, store, options)),
    reader: agent(
      contextFor(callerTenant, store, { ...options, view: 'published', principal: BINDING }),
    ),
    mine: entriesOf(mine),
    theirs: entriesOf(theirs),
    callerSite: mine.site,
    otherSite: theirs.site,
    otherOnly,
    otherAgent: agent(contextFor(otherTenant, store, options)),
  }
}

const COVERED_ABOVE = {
  describe_site: 'describes its own site',
  list_entries: 'lists, in both views, only its own entries, and by tag, locale and page',
  get_entry: 'finds its own entry by its key, and no entry that only the other site has',
  get_translations:
    'gives the translations of its own group, and none for a group that only the other site has',
  create_draft:
    'creates an entry under a key that only the other site has, and is refused only by its own entries',
  update_draft:
    'answers not_found to a change of an entry of the other site, and changes nothing there',
  publish: 'answers not_found to a change of an entry of the other site, and changes nothing there',
  unpublish:
    'answers not_found to a change of an entry of the other site, and changes nothing there',
  validate:
    'checks a file against its own entries: the links and the translations of the other site do not count',
} as const satisfies Partial<Record<OperationName, string>>

type Pair = Awaited<ReturnType<typeof seedPair>>

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><rect width="4" height="4"/></svg>'

const CREDENTIAL = 'phx_the_personal_key_of_the_test_0123456789'

async function theirAsset(pair: Pair): Promise<string> {
  const uploaded = await run(
    spec('upload_asset'),
    { filename: 'square.svg', alt: 'A black square', data: btoa(SVG) },
    pair.ports.other,
  )
  if (uploaded.asset === undefined) throw new Error(JSON.stringify(uploaded))
  return uploaded.asset.id
}

async function reviewIn(context: OperationContext, draft: SeededEntry): Promise<string> {
  await run(
    spec('create_draft'),
    {
      collection: 'blog',
      locale: 'es',
      slug: 'del-borrador-a-publicado',
      markdown: contentFixture('blog/es/del-borrador-a-publicado.md'),
    },
    context,
  )
  const asked = await run(spec('request_review'), { id: draft.id, version: 1 }, context)
  if (asked.review === undefined) throw new Error(JSON.stringify(asked))
  return asked.review.id
}

const theirReview = (pair: Pair) => reviewIn(pair.ports.other, pair.theirs.draft)

async function theirPendingReviews(pair: Pair) {
  const listed = await run(spec('list_reviews'), {}, pair.ports.other)
  return listed.reviews.map((review) => ({ id: review.id, comments: review.comments.length }))
}

async function siteRow(site: string) {
  return env.DB.prepare('SELECT version, definition, deleted_at FROM sites WHERE id = ?1')
    .bind(site)
    .first()
}

async function rowsOf(table: string, site: string) {
  return env.DB.prepare(`SELECT count(*) AS n FROM ${table} WHERE site_id = ?1`)
    .bind(site)
    .first<number>('n')
}

async function unchangedThere(pair: Pair, write: () => Promise<unknown>) {
  const before = await snapshotOf(env.DB, pair.otherSite)
  await write()
  expect(await snapshotOf(env.DB, pair.otherSite)).toEqual(before)
}

const STRANGER: {
  readonly [Name in Exclude<OperationName, keyof typeof COVERED_ABOVE>]: (
    pair: Pair,
  ) => Promise<void>
} = {
  approve_review: async (pair) => {
    const review = await theirReview(pair)

    await unchangedThere(pair, async () => {
      expect(await run(spec('approve_review'), { id: review }, pair.ports.caller)).toEqual({
        outcome: 'not_found',
      })
    })
    expect(await theirPendingReviews(pair)).toEqual([{ id: review, comments: 0 }])
  },
  comment_review: async (pair) => {
    const review = await theirReview(pair)

    const answer = await run(
      spec('comment_review'),
      { id: review, body: 'Looks good.' },
      pair.ports.caller,
    )

    expect(answer).toEqual({ outcome: 'not_found' })
    expect(await theirPendingReviews(pair)).toEqual([{ id: review, comments: 0 }])
  },
  request_changes: async (pair) => {
    const review = await theirReview(pair)

    const answer = await run(
      spec('request_changes'),
      { id: review, note: 'Shorter.' },
      pair.ports.caller,
    )

    expect(answer).toEqual({ outcome: 'not_found' })
    expect(await theirPendingReviews(pair)).toEqual([{ id: review, comments: 0 }])
  },
  reject_review: async (pair) => {
    const review = await theirReview(pair)

    const answer = await run(
      spec('reject_review'),
      { id: review, reason: 'Off topic.' },
      pair.ports.caller,
    )

    expect(answer).toEqual({ outcome: 'not_found' })
    expect(await theirPendingReviews(pair)).toEqual([{ id: review, comments: 0 }])
  },
  get_review: async (pair) => {
    const review = await theirReview(pair)

    const answer = await run(spec('get_review'), { id: review }, pair.ports.caller)
    const grouped = await run(
      spec('request_review'),
      {
        id: pair.mine.draft.id,
        version: 1,
        unpublish: [{ id: pair.theirs.english.id, version: 1 }],
      },
      pair.ports.caller,
    )

    expect(answer).toEqual({ outcome: 'not_found' })
    expect(grouped).toMatchObject({ outcome: 'not_found', failedEntry: pair.theirs.english.id })
    expect(await theirPendingReviews(pair)).toEqual([{ id: review, comments: 0 }])
  },
  list_reviews: async (pair) => {
    const own = await reviewIn(pair.ports.caller, pair.mine.draft)
    pair.time.set('2026-10-14T10:00:00.000Z')
    const review = await theirReview(pair)

    const answer = await run(spec('list_reviews'), { limit: 1 }, pair.ports.caller)

    expect(answer.reviews.map((listed) => listed.id)).toEqual([own])
    expect(await theirPendingReviews(pair)).toEqual([{ id: review, comments: 0 }])
  },
  request_review: async (pair) => {
    await unchangedThere(pair, async () => {
      expect(
        await run(
          spec('request_review'),
          { id: pair.theirs.draft.id, version: 1 },
          pair.ports.caller,
        ),
      ).toEqual({ outcome: 'not_found' })
    })
    expect(await theirPendingReviews(pair)).toEqual([])
  },
  get_analytics: async (pair) => {
    await run(
      spec('connect_analytics'),
      { provider: 'posthog', credential: CREDENTIAL },
      pair.ports.other,
    )

    expect(await run(spec('get_analytics'), {}, pair.ports.caller)).toEqual({
      outcome: 'not_connected',
    })
  },
  connect_analytics: async (pair) => {
    await run(
      spec('connect_analytics'),
      { provider: 'posthog', credential: CREDENTIAL },
      pair.ports.other,
    )
    const before = await run(spec('get_analytics'), {}, pair.ports.other)
    pair.time.set('2026-10-14T10:00:00.000Z')

    const answer = await run(
      spec('connect_analytics'),
      { provider: 'posthog', credential: CREDENTIAL },
      pair.ports.caller,
    )

    expect(answer.outcome).toBe('connected')
    expect(await run(spec('get_analytics'), {}, pair.ports.other)).toEqual(before)
    expect(before).toMatchObject({ outcome: 'connected', connectedAt: START })
  },
  disconnect_analytics: async (pair) => {
    await run(
      spec('connect_analytics'),
      { provider: 'posthog', credential: CREDENTIAL },
      pair.ports.other,
    )

    const answer = await run(spec('disconnect_analytics'), {}, pair.ports.caller)

    expect(answer).toEqual({ outcome: 'not_connected' })
    expect((await run(spec('get_analytics'), {}, pair.ports.other)).outcome).toBe('connected')
  },
  content_stats: async (pair) => {
    await run(
      spec('connect_analytics'),
      { provider: 'posthog', credential: CREDENTIAL },
      pair.ports.caller,
    )

    const answer = await run(spec('content_stats'), {}, pair.ports.caller)

    expect(answer.pages?.map((page) => [page.path, page.entry?.id ?? null])).toEqual([
      ['/en/blog/edge-caching-basics', pair.mine.english.id],
      ['/en/blog/only-in-the-other-site', null],
    ])
  },
  get_structure: async (pair) => {
    const answer = await run(spec('get_structure'), {}, pair.ports.caller)

    expect([answer.site, answer.version, Object.keys(answer.definition.collections)]).toEqual([
      pair.callerSite,
      1,
      ['blog'],
    ])
    expect(answer.definition.events.webhooks).toEqual([])
  },
  update_site: async (pair) => {
    const before = await siteRow(pair.otherSite)

    const answer = await run(
      spec('update_site'),
      { version: 1, definition: { ...CALLER_DEFINITION, styleGuide: 'Short.' }, confirm: false },
      pair.ports.caller,
    )

    expect(answer).toEqual({ outcome: 'updated', version: 2 })
    expect(await siteRow(pair.otherSite)).toEqual(before)
  },
  set_collection: async (pair) => {
    const before = await siteRow(pair.otherSite)
    const news = OTHER_DEFINITION.collections['news']
    if (news === undefined) throw new Error('the other definition has no news')

    const answer = await run(
      spec('set_collection'),
      { version: 1, name: 'pages', collection: news, confirm: false },
      pair.ports.caller,
    )

    expect(answer).toEqual({ outcome: 'updated', version: 2 })
    expect(await siteRow(pair.otherSite)).toEqual(before)
  },
  create_site: async (pair) => {
    const before = await siteRow(pair.otherSite)

    const answer = await run(
      spec('create_site'),
      { key: pair.otherSite, definition: CALLER_DEFINITION },
      pair.ports.caller,
    )

    expect(answer).toEqual({ outcome: 'taken' })
    expect(await siteRow(pair.otherSite)).toEqual(before)
  },
  delete_site: async (pair) => {
    const before = await siteRow(pair.otherSite)

    const answer = await run(
      spec('delete_site'),
      { key: pair.otherSite, confirm: true },
      pair.ports.caller,
    )

    expect(answer).toEqual({ outcome: 'not_found' })
    expect(await siteRow(pair.otherSite)).toEqual(before)
  },
  restore_site: async (pair) => {
    await env.DB.prepare('UPDATE sites SET deleted_at = ?1 WHERE id = ?2')
      .bind(START, pair.otherSite)
      .run()
    const before = await siteRow(pair.otherSite)

    const answer = await run(spec('restore_site'), { key: pair.otherSite }, pair.ports.caller)

    expect(answer).toEqual({ outcome: 'not_found' })
    expect(await siteRow(pair.otherSite)).toEqual(before)
  },
  make_webhook_secret: async (pair) => {
    const answer = await run(spec('make_webhook_secret'), { webhook: 'deploy' }, pair.ports.caller)

    expect(answer).toEqual({ outcome: 'not_found' })
    expect([
      await rowsOf('site_secrets', pair.callerSite),
      await rowsOf('site_secrets', pair.otherSite),
    ]).toEqual([0, 0])
  },
  list_backups: async (pair) => {
    await env.MEDIA.put(`backups/${pair.otherSite}/2026-10-12.json`, '{}')

    const answer = await run(spec('list_backups'), {}, pair.ports.caller)

    expect(answer).toEqual({ outcome: 'ok', backups: [] })
    expect(await run(spec('list_backups'), {}, pair.ports.other)).toEqual({
      outcome: 'ok',
      backups: [{ date: '2026-10-12', bytes: 2 }],
    })
  },
  upload_asset: async (pair) => {
    const theirs = await theirAsset(pair)

    const answer = await run(
      spec('upload_asset'),
      { filename: 'square.svg', alt: 'A square of my own', data: btoa(SVG) },
      pair.ports.caller,
    )

    expect(answer.outcome).toBe('created')
    expect(answer.asset?.id).not.toBe(theirs)
    expect([
      await rowsOf('assets', pair.callerSite),
      await rowsOf('assets', pair.otherSite),
    ]).toEqual([1, 1])
  },
  get_asset: async (pair) => {
    const theirs = await theirAsset(pair)

    expect(await run(spec('get_asset'), { id: theirs }, pair.ports.caller)).toEqual({
      outcome: 'not_found',
    })
  },
  update_asset: async (pair) => {
    const theirs = await theirAsset(pair)

    const answer = await run(
      spec('update_asset'),
      { id: theirs, alt: 'Not yours' },
      pair.ports.caller,
    )

    expect(answer).toEqual({ outcome: 'not_found' })
    expect((await run(spec('get_asset'), { id: theirs }, pair.ports.other)).asset?.alt).toBe(
      'A black square',
    )
  },
  list_assets: async (pair) => {
    await theirAsset(pair)

    expect(await run(spec('list_assets'), {}, pair.ports.caller)).toEqual({
      outcome: 'ok',
      assets: [],
      nextCursor: null,
    })
  },
  list_revisions: async (pair) => {
    expect(
      await run(spec('list_revisions'), { id: pair.theirs.english.id }, pair.ports.caller),
    ).toEqual({
      outcome: 'not_found',
    })
  },
  get_revision: async (pair) => {
    expect(
      await run(spec('get_revision'), { id: pair.theirs.english.revisionId }, pair.ports.caller),
    ).toEqual({ outcome: 'not_found' })
  },
  restore_revision: async (pair) => {
    await unchangedThere(pair, async () => {
      expect(
        await run(
          spec('restore_revision'),
          { id: pair.theirs.english.id, version: 1, revision: pair.theirs.english.revisionId },
          pair.ports.caller,
        ),
      ).toEqual({ outcome: 'not_found' })
      expect(
        await run(
          spec('restore_revision'),
          { id: pair.mine.english.id, version: 1, revision: pair.theirs.english.revisionId },
          pair.ports.caller,
        ),
      ).toEqual({ outcome: 'not_found' })
    })
  },
  move_entry: async (pair) => {
    await unchangedThere(pair, async () => {
      expect(
        await run(
          spec('move_entry'),
          { id: pair.theirs.english.id, version: 1, slug: 'moved-away' },
          pair.ports.caller,
        ),
      ).toEqual({ outcome: 'not_found' })
    })
  },
  list_redirects: async (pair) => {
    const moved = await run(
      spec('move_entry'),
      { id: pair.theirs.english.id, version: 1, slug: 'moved-away' },
      pair.ports.other,
    )

    const answer = await run(spec('list_redirects'), {}, pair.ports.caller)

    expect(moved.outcome).toBe('moved')
    expect(answer).toEqual({ outcome: 'ok', redirects: [], nextCursor: null })
  },
  schedule_unpublish: async (pair) => {
    const answer = await run(
      spec('schedule_unpublish'),
      { id: pair.theirs.english.id, unpublishAt: '2026-10-14T10:00:00.000Z' },
      pair.ports.caller,
    )

    expect(answer).toEqual({ outcome: 'not_found' })
    expect(await rowsOf('unpublishes', pair.otherSite)).toBe(0)
  },
  delete_entry: async (pair) => {
    await unchangedThere(pair, async () => {
      expect(
        await run(
          spec('delete_entry'),
          { id: pair.theirs.draft.id, version: 1 },
          pair.ports.caller,
        ),
      ).toEqual({ outcome: 'not_found' })
    })
  },
  restore_entry: async (pair) => {
    const trashed = await run(
      spec('delete_entry'),
      { id: pair.theirs.draft.id, version: 1 },
      pair.ports.other,
    )

    await unchangedThere(pair, async () => {
      expect(
        await run(spec('restore_entry'), { id: pair.theirs.draft.id }, pair.ports.caller),
      ).toEqual({
        outcome: 'not_found',
      })
    })
    expect(trashed.outcome).toBe('trashed')
  },
  search: async (pair) => {
    const note = async (context: OperationContext, slug: string, markdown: string) => {
      const created = await run(
        spec('create_draft'),
        { collection: 'notes', locale: 'en', slug, markdown },
        context,
      )
      if (created.entry === undefined) throw new Error(JSON.stringify(created))
      await run(spec('publish'), { id: created.entry.id, version: created.entry.version }, context)
    }
    await note(
      pair.ports.caller,
      'harbour',
      '---\ntitle: Harbour notes\n---\n\nA lighthouse by the harbour.\n',
    )
    await note(
      pair.ports.other,
      'lights',
      '---\ntitle: Lighthouse\n---\n\nLighthouse, lighthouse.\n',
    )

    const mine = await run(spec('search'), { query: 'lighthouse', limit: 1 }, pair.ports.caller)
    const theirs = await run(spec('search'), { query: 'lighthouse', limit: 1 }, pair.ports.other)

    expect(mine.results.map((result) => result.entry.slug)).toEqual(['harbour'])
    expect(theirs.results.map((result) => result.entry.slug)).toEqual(['lights'])
  },
}

describe.each(['home', 'stranger'] as const)(
  'with the rows of a second site, as the %s site',
  (callerIs) => {
    it(COVERED_ABOVE.describe_site, async () => {
      const { caller, callerSite } = await seedPair(callerIs)

      expect((await caller.describeSite()).site.key).toBe(callerSite)
    })

    it(COVERED_ABOVE.list_entries, async () => {
      const { caller, reader, mine, otherAgent } = await seedPair(callerIs)

      const head = await caller.listEntries({ collection: 'blog' })
      const published = await reader.listEntries({ collection: 'blog' })
      const tagged = await caller.listEntries({ collection: 'blog', tag: 'cms' })
      const spanish = await reader.listEntries({ collection: 'blog', locale: 'es' })
      const exact = await reader.listEntries({ collection: 'blog', limit: 2 })
      const foreignTag = await caller.listEntries({ collection: 'blog', tag: 'only-there-tag' })
      const foreignTagLive = await reader.listEntries({ collection: 'blog', tag: 'only-there-tag' })
      const theirTag = await otherAgent.listEntries({ collection: 'blog', tag: 'only-there-tag' })

      const ids = (page: { entries: { id: string }[] }) =>
        page.entries.map((entry) => entry.id).toSorted()
      expect(ids(head)).toEqual([mine.english.id, mine.spanish.id, mine.draft.id].toSorted())
      expect(ids(published)).toEqual([mine.english.id, mine.spanish.id].toSorted())
      expect(ids(tagged)).toEqual([mine.english.id, mine.spanish.id, mine.draft.id].toSorted())
      expect(ids(spanish)).toEqual([mine.spanish.id])
      expect([head.nextCursor, published.nextCursor, exact.nextCursor]).toEqual([null, null, null])
      expect(exact.entries).toHaveLength(2)
      expect(foreignTag).toEqual({ outcome: 'ok', entries: [], nextCursor: null })
      expect(foreignTagLive).toEqual({ outcome: 'ok', entries: [], nextCursor: null })
      expect(theirTag.entries.map((entry) => entry.slug)).toEqual(['only-in-the-other-site'])
    })

    it(COVERED_ABOVE.get_entry, async () => {
      const { caller, reader, mine } = await seedPair(callerIs)
      const key = (entry: SeededEntry) => ({
        collection: entry.collection,
        locale: entry.locale,
        slug: entry.slug,
      })

      const own = await caller.getEntry(key(mine.english))
      const ownLive = await reader.getEntry(key(mine.english))
      const foreign = await caller.getEntry(ONLY_THERE)
      const foreignLive = await reader.getEntry(ONLY_THERE)

      expect(own.entry?.id).toBe(mine.english.id)
      expect(ownLive.entry?.id).toBe(mine.english.id)
      expect(own.entry?.lastPublication?.revision).toBe(mine.english.revisionId)
      expect(foreign).toEqual({ outcome: 'not_found' })
      expect(foreignLive).toEqual({ outcome: 'not_found' })
    })

    it(COVERED_ABOVE.get_translations, async () => {
      const { caller, reader, mine } = await seedPair(callerIs)

      const own = await caller.getTranslations({
        collection: 'blog',
        translationGroup: 'edge-caching',
      })
      const live = await reader.getTranslations({
        collection: 'blog',
        translationGroup: 'edge-caching',
      })
      const foreign = await caller.getTranslations({
        collection: 'blog',
        translationGroup: 'only-there',
      })

      expect(own.entries?.map((entry) => entry.id)).toEqual([mine.english.id, mine.spanish.id])
      expect(live.entries?.map((entry) => entry.id)).toEqual([mine.english.id, mine.spanish.id])
      expect(foreign).toEqual({ outcome: 'not_found' })
    })

    it(COVERED_ABOVE.create_draft, async () => {
      const { caller, mine, otherSite } = await seedPair(callerIs)
      const before = await snapshotOf(env.DB, otherSite)
      const create = (slug: string, locale: string, group: string) =>
        caller.createDraft({
          collection: 'blog',
          locale,
          slug,
          markdown: blogPost({ translationGroup: group }),
        })

      const sameSlug = await create(ONLY_THERE.slug, 'en', 'a-group-of-its-own')
      const sameGroup = await create('another-slug', 'en', 'only-there')
      const slugTaken = await create(mine.english.slug, 'en', 'a-group-of-its-own')
      const groupTaken = await create('a-third-slug', 'en', 'edge-caching')

      expect([sameSlug.outcome, sameGroup.outcome]).toEqual(['saved', 'saved'])
      expect(slugTaken.verdict?.errors).toEqual([
        expect.objectContaining({
          contract: 'unique-slug',
          message: `Another entry of this collection and locale, ${mine.english.id}, already has this slug.`,
        }),
      ])
      expect(groupTaken.verdict?.errors).toEqual([
        expect.objectContaining({
          contract: 'unique-translation',
          message: `Another entry of this collection and locale, ${mine.english.id}, already belongs to this translation group.`,
        }),
      ])
      expect(await snapshotOf(env.DB, otherSite)).toEqual(before)
    })

    it(COVERED_ABOVE.update_draft, async () => {
      const { caller, mine, theirs, otherOnly, otherSite } = await seedPair(callerIs)
      const before = await snapshotOf(env.DB, otherSite)
      const markdown = contentFixture('blog/en/from-draft-to-published.md')
      const foreign = [theirs.english.id, theirs.spanish.id, theirs.draft.id, otherOnly]

      for (const id of foreign) {
        expect(
          await caller.updateDraft({ id, version: 1, markdown: `${markdown}\nMore text.\n` }),
        ).toEqual({
          outcome: 'not_found',
        })
        expect(await caller.updateDraft({ id, version: 1, markdown })).toEqual({
          outcome: 'not_found',
        })
        expect(await caller.publish({ id, version: 1 })).toEqual({ outcome: 'not_found' })
        expect(await caller.unpublish({ id })).toEqual({ outcome: 'not_found' })
      }

      expect(await snapshotOf(env.DB, otherSite)).toEqual(before)
      expect((await caller.updateDraft({ id: mine.draft.id, version: 1, markdown })).outcome).toBe(
        'unchanged',
      )
      expect((await caller.unpublish({ id: mine.english.id })).outcome).toBe('unpublished')
      expect(await snapshotOf(env.DB, otherSite)).toEqual(before)
    })

    it('writes and publishes its own entries under keys that the other site has too, and leaves the other site as it was', async () => {
      const { caller, reader, mine, otherSite } = await seedPair(callerIs)
      const before = await snapshotOf(env.DB, otherSite)
      const english = contentFixture('blog/en/from-draft-to-published.md')

      const sibling = await caller.createDraft({
        collection: 'blog',
        locale: 'es',
        slug: 'del-borrador-a-publicado',
        markdown: contentFixture('blog/es/del-borrador-a-publicado.md'),
      })
      const edited = await caller.updateDraft({
        id: mine.draft.id,
        version: 1,
        markdown: `${english}\nMore text.\n`,
      })
      const published = await caller.publish({ id: mine.draft.id, version: 2 })

      expect([sibling.outcome, edited.outcome, published.outcome]).toEqual([
        'saved',
        'saved',
        'published',
      ])
      expect(published.entry).toMatchObject({ id: mine.draft.id, version: 3, status: 'published' })
      const live = await reader.getEntry({
        collection: 'blog',
        locale: 'en',
        slug: 'from-draft-to-published',
      })
      expect(live.entry?.id).toBe(mine.draft.id)
      expect(await snapshotOf(env.DB, otherSite)).toEqual(before)
    })

    it('takes down only its own entries: the ones of the other site stay published', async () => {
      const { caller, reader, mine, otherAgent } = await seedPair(callerIs)

      await caller.unpublish({ id: mine.english.id })
      await caller.unpublish({ id: mine.spanish.id })

      expect((await reader.listEntries({ collection: 'blog' })).entries).toEqual([])
      const theirs = await otherAgent.getTranslations({
        collection: 'blog',
        translationGroup: 'edge-caching',
      })
      expect(theirs.entries?.map((entry) => entry.status)).toEqual(['published', 'published'])
    })

    it(COVERED_ABOVE.validate, async () => {
      const { caller, mine } = await seedPair(callerIs)
      const checks = async (group: string, locale: string, body: string) =>
        (
          await caller.validate({
            collection: 'blog',
            locale,
            slug: 'a-post-to-check',
            markdown: blogPost({ translationGroup: group }, body),
          })
        ).verdict.errors.map((error) => [error.contract, error.message])

      const own = await checks('guide', 'en', '\nSee [a post](/en/blog/edge-caching-basics/).\n')
      const foreign = await checks(
        'guide',
        'en',
        '\nSee [a post](/en/blog/only-in-the-other-site/).\n',
      )
      const pairOwn = await checks('edge-caching', 'es', '\nText.\n')
      const pairForeign = await checks('only-there', 'es', '\nText.\n')

      expect(mine.english.slug).toBe('edge-caching-basics')
      expect(own).toEqual([
        ['translation-pair', 'The es version of the translation group "guide" does not exist.'],
      ])
      expect(foreign).toEqual([
        ['translation-pair', 'The es version of the translation group "guide" does not exist.'],
        [
          'internal-links-resolve',
          'The link "/en/blog/only-in-the-other-site/" points at the entry blog/en/only-in-the-other-site, which does not exist.',
        ],
      ])
      expect(pairOwn).toEqual([])
      expect(pairForeign).toEqual([
        [
          'translation-pair',
          'The en version of the translation group "only-there" does not exist.',
        ],
      ])
    })

    for (const [name, stranger] of Object.entries(STRANGER)) {
      it(`${name} reaches no row of the other site`, async () => {
        await stranger(await seedPair(callerIs))
      })
    }
  },
)

describe('the cases of a stranger', () => {
  it('cover every operation of the registry: an operation without one fails here', () => {
    expect([...Object.keys(COVERED_ABOVE), ...Object.keys(STRANGER)].toSorted()).toEqual(
      OPERATIONS.map((operation) => operation.name).toSorted(),
    )
  })
})
