import { env } from 'cloudflare:workers'
import { afterEach, describe, expect, it, vi } from 'vitest'

import manifest from '../../package.json' with { type: 'json' }
import { seedToken } from '../auth/support.ts'
import { newRevision } from '../db/support.ts'
import { callRaw, CANNED, connect, ENTRY_ID, INPUTS, rpc } from '../mcp/support.ts'
import { boot, captureLogs, restoreLogs, onlyCall, SITE_KEY } from './support.ts'

const REQUEST_ID = '9d2c1b7e-6a4f-4e0b-8c35-1f7a2b6d4e90'
const LATER = '2026-11-11T12:00:00.000Z'

const TOOLS = [
  'approve_review',
  'comment_review',
  'connect_analytics',
  'content_stats',
  'create_draft',
  'create_site',
  'delete_entry',
  'delete_site',
  'describe_site',
  'disconnect_analytics',
  'get_analytics',
  'get_asset',
  'get_entry',
  'get_review',
  'get_revision',
  'get_structure',
  'get_translations',
  'list_assets',
  'list_backups',
  'list_entries',
  'list_redirects',
  'list_reviews',
  'list_revisions',
  'make_webhook_secret',
  'move_entry',
  'publish',
  'reject_review',
  'request_changes',
  'request_review',
  'restore_entry',
  'restore_revision',
  'restore_site',
  'schedule_unpublish',
  'search',
  'set_collection',
  'unpublish',
  'update_asset',
  'update_draft',
  'update_site',
  'upload_asset',
  'validate',
]

afterEach(() => {
  vi.restoreAllMocks()
  restoreLogs()
})

describe('an SDK client through the Worker', () => {
  it.each(['2026', '2025'] as const)(
    'lists the tools and calls one, in the %s era, and the server says who it is',
    async (era) => {
      const seeded = await seedToken(env.DB, SITE_KEY, { expiresAt: LATER })
      const worker = boot()
      const { client } = await connect(worker.endpoint(seeded.token), { era })

      const { tools } = await client.listTools()
      const described = await client.callTool({ name: 'describe_site', arguments: {} })

      expect(tools.map((tool) => tool.name)).toEqual(TOOLS)
      expect(described.structuredContent).toEqual(CANNED.describe_site.ok)
      expect(client.getServerVersion()).toEqual({
        name: 'hollware',
        title: 'Hollware',
        version: manifest.version,
      })
      await client.close()
      await worker.settle()
    },
  )
})

describe('what the handler gets from the gateway', () => {
  it('is the principal of the token, the site of the config, the head, and the clock and id of the request', async () => {
    const seeded = await seedToken(env.DB, SITE_KEY, { expiresAt: LATER })
    const worker = boot()
    vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce(REQUEST_ID)

    const answer = await callRaw(
      worker.endpoint(seeded.token),
      'modern',
      'get_entry',
      INPUTS.get_entry,
    )
    await worker.settle()

    expect(answer.status).toBe(200)
    expect(answer.result.structuredContent).toEqual(CANNED.get_entry.ok)
    const { tool, input, context } = onlyCall(worker.seen)
    expect(tool).toBe('get_entry')
    expect(input).toEqual({
      collection: 'blog',
      locale: 'en',
      slug: 'hello-world',
      formats: ['markdown'],
      published: false,
      related: false,
      references: false,
    })
    expect(context.principal).toEqual({
      kind: 'token',
      userId: seeded.userId,
      tokenId: seeded.tokenId,
      site: 'gateway-tests',
      scopes: [
        'content:read',
        'content:write',
        'content:publish',
        'schema:admin',
        'site:owner',
        'review:read',
        'review:comment',
      ],
    })
    expect(context.view).toBe('head')
    expect(context.requestId).toBe(REQUEST_ID)
    expect(context.client).toEqual({ name: 'raw-client', version: '0.0.0' })
    expect(context.clock).toBe(worker.clock)
    expect(context.site.key).toBe('gateway-tests')
    expect(context.site.locales).toEqual(['en', 'es'])
    expect(context.site.defaultLocale).toBe('en')
    expect(context.site.styleGuide).toBe('Plain words, short sentences.')
    expect([...context.site.collections.keys()]).toEqual(['blog'])
  })

  it('reads the primary database, never a replica session, so an agent reads what it just wrote', async () => {
    const seeded = await seedToken(env.DB, SITE_KEY, { expiresAt: LATER })
    const worker = boot({
      overrides: {
        get_entry: async (_input, context) => {
          await context.store.findEntryById(context.site.key, ENTRY_ID, context.view)
          return CANNED.get_entry.not_found
        },
      },
    })

    await callRaw(worker.endpoint(seeded.token), 'modern', 'get_entry', INPUTS.get_entry)
    await worker.settle()

    expect(worker.sessions).toEqual([])
    expect(worker.queries.every((query) => query.via === 'primary')).toBe(true)
    expect(worker.queries.some((query) => query.sql.includes('from "entries"'))).toBe(true)
  })

  it('gives the store the clock of the Worker, so that what an agent writes is stamped with it', async () => {
    const seeded = await seedToken(env.DB, SITE_KEY, { expiresAt: LATER })
    const slug = `clock-${crypto.randomUUID()}`
    const worker = boot({
      overrides: {
        create_draft: async (input, context) => {
          if (context.principal.kind !== 'token') throw new Error('a token was expected')
          const { userId, tokenId } = context.principal
          await context.store.createEntry(context.site.key, {
            collection: input.collection,
            locale: input.locale,
            slug: input.slug,
            translationGroup: null,
            revision: newRevision({ kind: 'token', userId, tokenId, meta: null }),
          })
          return CANNED.create_draft.saved
        },
      },
    })

    const answer = await callRaw(worker.endpoint(seeded.token), 'modern', 'create_draft', {
      ...INPUTS.create_draft,
      slug,
    })
    await worker.settle()

    expect(answer.status).toBe(200)
    const row = await env.DB.prepare(
      'SELECT created_at, updated_at FROM entries WHERE site_id = ?1 AND slug = ?2',
    )
      .bind(SITE_KEY, slug)
      .first()
    expect(row).toEqual({
      created_at: '2026-10-13T12:00:00.000Z',
      updated_at: '2026-10-13T12:00:00.000Z',
    })
  })

  it('is logged as one JSON line per call, with the id of the request', async () => {
    const logs = captureLogs()
    const seeded = await seedToken(env.DB, SITE_KEY, { expiresAt: LATER })
    const worker = boot()
    vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce(REQUEST_ID)

    await callRaw(worker.endpoint(seeded.token), 'modern', 'describe_site', {})
    await worker.settle()

    expect(logs.entries()).toEqual([
      {
        kind: 'call',
        requestId: REQUEST_ID,
        tool: 'describe_site',
        outcome: 'ok',
        errorCode: null,
        isError: false,
        durationMs: expect.any(Number),
        detail: null,
      },
    ])
    expect(logs.lines().every((line) => line.startsWith('{') && !line.includes('\n'))).toBe(true)
  })
})

describe('a token without the scope of the tool', () => {
  it('is refused with 403 and the endpoint challenge, and the handler never runs', async () => {
    const logs = captureLogs()
    const seeded = await seedToken(env.DB, SITE_KEY, {
      scopes: ['content:read'],
      expiresAt: LATER,
    })
    const worker = boot()
    vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce(REQUEST_ID)

    const answer = await callRaw(
      worker.endpoint(seeded.token),
      'modern',
      'create_draft',
      INPUTS.create_draft,
    )
    await worker.settle()

    expect(answer.status).toBe(403)
    expect(answer.headers.get('www-authenticate')).toBe(
      'Bearer error="insufficient_scope", error_description="create_draft requires: content:write", scope="content:write", resource_metadata="https://hollware.test/.well-known/oauth-protected-resource/mcp"',
    )
    expect(answer.message).toEqual({
      error: 'insufficient_scope',
      error_description: 'create_draft requires: content:write',
    })
    expect(worker.seen).toEqual([])
    expect(logs.entries()).toEqual([
      {
        kind: 'call',
        requestId: REQUEST_ID,
        tool: 'create_draft',
        outcome: null,
        errorCode: 'insufficient_scope',
        isError: true,
        durationMs: 0,
        detail: null,
      },
    ])
  })

  it('still reads: the scopes of the token are the ones it carries', async () => {
    const seeded = await seedToken(env.DB, SITE_KEY, {
      scopes: ['content:read'],
      expiresAt: LATER,
    })
    const worker = boot()

    const answer = await callRaw(
      worker.endpoint(seeded.token),
      'modern',
      'list_entries',
      INPUTS.list_entries,
    )
    await worker.settle()

    expect(answer.status).toBe(200)
    expect(answer.result.structuredContent).toEqual(CANNED.list_entries.ok)
    expect(onlyCall(worker.seen).context.principal).toMatchObject({
      scopes: ['content:read', 'review:read'],
    })
  })
})

describe('the request that reaches the endpoint', () => {
  it.each(['GET', 'DELETE', 'PUT', 'PATCH'])(
    'is served for %s too: /mcp has every method, and the endpoint decides',
    async (method) => {
      const seeded = await seedToken(env.DB, SITE_KEY, { expiresAt: LATER })
      const worker = boot()

      const response = await worker.send('/mcp', { method, token: seeded.token })
      await worker.settle()

      expect(response.status).toBe(405)
      expect(await response.json()).toEqual({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Method not allowed.' },
        id: null,
      })
    },
  )

  it('keeps its Mcp-Method header as the client wrote it, so that a header that disagrees with the body is refused', async () => {
    const seeded = await seedToken(env.DB, SITE_KEY, { expiresAt: LATER })
    const worker = boot()

    const answer = await rpc(
      worker.endpoint(seeded.token),
      'modern',
      'tools/call',
      { name: 'describe_site', arguments: {} },
      { headers: { 'mcp-method': 'tools/list' } },
    )
    await worker.settle()

    expect(answer.status).toBe(400)
    expect(answer.message).toMatchObject({ error: { code: -32020 } })
    expect(worker.seen).toEqual([])
  })

  it('keeps its Mcp-Name header as the client wrote it', async () => {
    const seeded = await seedToken(env.DB, SITE_KEY, { expiresAt: LATER })
    const worker = boot()

    const answer = await rpc(
      worker.endpoint(seeded.token),
      'modern',
      'tools/call',
      { name: 'describe_site', arguments: {} },
      { headers: { 'mcp-name': 'get_entry' } },
    )
    await worker.settle()

    expect(answer.status).toBe(400)
    expect(answer.message).toMatchObject({ error: { code: -32020 } })
    expect(worker.seen).toEqual([])
  })
})
