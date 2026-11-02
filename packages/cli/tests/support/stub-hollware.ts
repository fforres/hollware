import {
  createDraft,
  describeSite,
  getEntry,
  listEntries,
  OPERATIONS,
  publish,
  updateDraft,
  validate,
  type Scope,
  commentReview,
  getReview,
  requestReview,
  unifiedDiff,
  unpublish,
  getAsset,
  listBackups,
  listRedirects,
  connectAnalytics,
  disconnectAnalytics,
  getAnalytics,
  uploadAsset,
  withImplied,
} from '@hollware/core'
import {
  createMcpHandler,
  McpServer,
  type CallToolResult,
  type RegisteredTool,
} from '@modelcontextprotocol/server'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

export const STUB_TIME = '2026-10-12T12:00:00.000Z'

export const COMARK_BREAK = '<<comark-break>>'

export interface StubViolation {
  contract: string
  severity: 'error' | 'warning'
  path: string
  message: string
  fix: string
}

export interface StubFile {
  collection: string
  locale: string
  slug: string
  markdown: string
}

export interface StubEntry {
  id: string
  collection: string
  locale: string
  slug: string
  version: number
  revisions: string[]
  published: number | null
  deletedAt?: string | null
  written?: ReturnType<typeof writtenVerdict>
  frontmatter?: Record<string, unknown>
  automatic?: Record<string, unknown>
  updatedAt?: string
}

export interface StubReview {
  id: string
  status: 'pending' | 'cancelled' | 'approved'
  items: {
    entryId: string
    action: 'publish' | 'unpublish'
    base: string | null
    proposed: string | null
  }[]
  comments: { body: string; entryId: string | null; lines: { from: number; to: number } | null }[]
  acknowledged: { contract: string; path: string }[]
}

function writtenVerdict(verdict: {
  ok: boolean
  phase: 'write' | 'publish'
  errors: StubViolation[]
  warnings: StubViolation[]
  contractsHash: string
}) {
  return verdict
}

export interface RecordedCall {
  tool: string
  args: Record<string, unknown>
}

export interface StubOptions {
  token: string
  scopes?: readonly Scope[]
  maxBytes?: number
  findings?: (file: StubFile) => { errors?: StubViolation[]; warnings?: StubViolation[] }
  without?: readonly string[]
  toolError?: (call: RecordedCall) => string | undefined
  before?: (call: RecordedCall, entries: Map<string, StubEntry>) => void
  respond?: (request: Request) => Response | undefined
  site?: { key: string; locales: string[]; collections: string[] }
  declared?: Record<string, { components?: string[]; routes?: Record<string, string> }>
  pageSize?: number
  redirects?: { from: string; to: string; fromPath: string | null; toPath: string | null }[]
  backups?: { date: string; bytes: number }[]
  analytics?: (args: Record<string, unknown>) => { outcome: string; [field: string]: unknown }
  refuseUploads?: { message: string; fix: string }
}

export interface StubAsset {
  id: string
  format: 'image/webp' | 'image/png' | 'image/svg+xml'
  originalFormat: 'image/png' | 'image/jpeg' | 'image/svg+xml'
  served: Uint8Array
  original: Uint8Array
  alt: string
  filename: string
}

export interface StubServer {
  url: string
  entries: Map<string, StubEntry>
  assets: Map<string, StubAsset>
  reviews: Map<string, StubReview>
  calls: RecordedCall[]
  authorizations: (string | null)[]
  close: () => Promise<void>
}

const BOM = String.fromCharCode(0xfeff)
const FRONTMATTER = new RegExp(`^${BOM}?---\\r?\\n[\\s\\S]*?\\r?\\n---`)
const REFUSALS = ['size-limit', 'frontmatter-syntax', 'comark-parse']

function violation(contract: string, path: string, message: string, fix: string): StubViolation {
  return { contract, severity: 'error', path, message, fix }
}

function revisionId(entry: StubEntry): string {
  return revisionAt(entry.revisions.length - 1)
}

function revisionAt(index: number): string {
  return `rev_${String(index + 1).padStart(26, '0')}`
}

export function startStub(options: StubOptions): Promise<StubServer> {
  const entries = new Map<string, StubEntry>()
  const assets = new Map<string, StubAsset>()
  const reviews = new Map<string, StubReview>()
  let origin = ''
  const assetView = (asset: StubAsset) => ({
    id: asset.id,
    reference: `asset:${asset.id}`,
    url: `${origin}/assets/${site.key}/${asset.id}`,
    format: asset.format,
    width: null,
    height: null,
    bytes: asset.served.length,
    originalFormat: asset.originalFormat,
    originalBytes: asset.original.length,
    alt: asset.alt,
    filename: asset.filename,
    createdAt: '2026-10-13T10:00:00.000Z',
  })
  const calls: RecordedCall[] = []
  let connection: { outcome: string; [field: string]: unknown } | null = null
  const authorizations: (string | null)[] = []
  const granted = withImplied(
    options.scopes ?? [
      'content:read',
      'content:write',
      'content:publish',
      'schema:admin',
      'site:owner',
    ],
  )
  let nextId = 0
  const site = options.site ?? { key: 'blog', locales: ['en', 'es'], collections: ['blog'] }

  const key = (file: Pick<StubFile, 'collection' | 'locale' | 'slug'>): string =>
    `${file.collection}/${file.locale}/${file.slug}`

  function violationsOf(file: StubFile): { errors: StubViolation[]; warnings: StubViolation[] } {
    const errors: StubViolation[] = []
    if (Buffer.byteLength(file.markdown) > (options.maxBytes ?? 8192)) {
      errors.push(
        violation(
          'size-limit',
          '/body',
          'The file is larger than the collection allows.',
          'Split it into several entries.',
        ),
      )
    }
    if (!FRONTMATTER.test(file.markdown)) {
      errors.push(
        violation(
          'frontmatter-syntax',
          '/frontmatter',
          'The frontmatter does not parse.',
          'Start the file with a YAML block between two --- lines.',
        ),
      )
    }
    if (file.markdown.includes(COMARK_BREAK)) {
      errors.push(
        violation('comark-parse', '/body', 'The body does not parse.', `Remove ${COMARK_BREAK}.`),
      )
    }
    const extra = options.findings?.(file) ?? {}
    return { errors: [...errors, ...(extra.errors ?? [])], warnings: extra.warnings ?? [] }
  }

  function verdictOf(file: StubFile, phase: 'write' | 'publish') {
    const { errors, warnings } = violationsOf(file)
    return { ok: errors.length === 0, phase, errors, warnings, contractsHash: 'stub' }
  }

  function summaryOf(entry: StubEntry) {
    return {
      id: entry.id,
      collection: entry.collection,
      locale: entry.locale,
      slug: entry.slug,
      translationGroup: null,
      status: entry.published === null ? ('draft' as const) : ('published' as const),
      version: entry.version,
      frontmatter: entry.frontmatter ?? {},
      tags: [],
      hasUnpublishedChanges: entry.published !== entry.revisions.length - 1,
      publishedAt: entry.published === null ? null : STUB_TIME,
      scheduledAt: null,
      deletedAt: entry.deletedAt ?? null,
      updatedAt: entry.updatedAt ?? STUB_TIME,
    }
  }

  function fileOf(entry: StubEntry, markdown: string): StubFile {
    return { collection: entry.collection, locale: entry.locale, slug: entry.slug, markdown }
  }

  function byId(id: string): StubEntry | undefined {
    return [...entries.values()].find((entry) => entry.id === id)
  }

  const reply = (
    outcomes: Record<string, { isError: boolean }>,
    output: { outcome: string; [field: string]: unknown },
  ): CallToolResult => ({
    content: [{ type: 'text', text: JSON.stringify(output) }],
    structuredContent: output,
    ...(outcomes[output.outcome]?.isError === true ? { isError: true } : {}),
  })

  const guarded =
    <Args extends Record<string, unknown>>(tool: string, handler: (args: Args) => CallToolResult) =>
    (args: Args): CallToolResult => {
      const call: RecordedCall = { tool, args }
      calls.push(call)
      const failure = options.toolError?.(call)
      if (failure !== undefined) {
        return { content: [{ type: 'text', text: failure }], isError: true }
      }
      options.before?.(call, entries)
      return handler(args)
    }

  function buildServer(): McpServer {
    const server = new McpServer({ name: 'stub-hollware', version: '0.0.0' })
    const keep = (name: string, tool: RegisteredTool): void => {
      if (options.without?.includes(name) === true) tool.remove()
    }
    const describe = (spec: { title: string; description: string }) => ({
      title: spec.title,
      description: spec.description,
    })

    keep(
      getEntry.name,
      server.registerTool(
        getEntry.name,
        { ...describe(getEntry), inputSchema: getEntry.input, outputSchema: getEntry.output },
        guarded(getEntry.name, (args) => {
          const entry = entries.get(key(args))
          if (entry === undefined) return reply(getEntry.outcomes, { outcome: 'not_found' })
          if (args.published && entry.published === null) {
            return reply(getEntry.outcomes, { outcome: 'not_found' })
          }
          const markdown =
            (args.published ? entry.revisions[entry.published ?? -1] : entry.revisions.at(-1)) ?? ''
          return reply(getEntry.outcomes, {
            outcome: 'ok',
            entry: {
              ...summaryOf(entry),
              revision: args.published ? revisionAt(entry.published ?? 0) : revisionId(entry),
              verdict: verdictOf(fileOf(entry, markdown), 'write'),
              lastPublication: null,
              unpublishAt: null,
              ...(entry.automatic === undefined ? {} : { automatic: entry.automatic }),
              markdown,
            },
          })
        }),
      ),
    )

    const backups = options.backups
    if (backups !== undefined) {
      server.registerTool(
        listBackups.name,
        {
          ...describe(listBackups),
          inputSchema: listBackups.input,
          outputSchema: listBackups.output,
        },
        guarded(listBackups.name, () => reply(listBackups.outcomes, { outcome: 'ok', backups })),
      )
    }

    const analytics = options.analytics
    if (analytics !== undefined) {
      server.registerTool(
        getAnalytics.name,
        {
          ...describe(getAnalytics),
          inputSchema: getAnalytics.input,
          outputSchema: getAnalytics.output,
        },
        guarded(getAnalytics.name, () =>
          reply(
            getAnalytics.outcomes,
            connection === null ? { outcome: 'not_connected' } : connection,
          ),
        ),
      )
      server.registerTool(
        connectAnalytics.name,
        {
          ...describe(connectAnalytics),
          inputSchema: connectAnalytics.input,
          outputSchema: connectAnalytics.output,
        },
        guarded(connectAnalytics.name, (args) => {
          const answer = analytics(args)
          if (answer['outcome'] === 'connected') {
            connection = {
              outcome: 'connected',
              provider: args['provider'],
              settings: answer['settings'] ?? {},
              connectedAt: '2026-10-22T10:00:00.000Z',
            }
          }
          return reply(connectAnalytics.outcomes, answer)
        }),
      )
      server.registerTool(
        disconnectAnalytics.name,
        {
          ...describe(disconnectAnalytics),
          inputSchema: disconnectAnalytics.input,
          outputSchema: disconnectAnalytics.output,
        },
        guarded(disconnectAnalytics.name, () => {
          const outcome = connection === null ? 'not_connected' : 'disconnected'
          connection = null
          return reply(disconnectAnalytics.outcomes, { outcome })
        }),
      )
    }

    const redirects = options.redirects
    if (redirects !== undefined) {
      server.registerTool(
        listRedirects.name,
        {
          ...describe(listRedirects),
          inputSchema: listRedirects.input,
          outputSchema: listRedirects.output,
        },
        guarded(listRedirects.name, () =>
          reply(listRedirects.outcomes, {
            outcome: 'ok',
            redirects: redirects.map((redirect) => ({
              ...redirect,
              collection: 'blog',
              locale: 'en',
              entryId: 'ent_01JAB3XQ8ZK4M6N2P5R7S9T0VW',
            })),
            nextCursor: null,
          }),
        ),
      )
    }

    keep(
      getAsset.name,
      server.registerTool(
        getAsset.name,
        { ...describe(getAsset), inputSchema: getAsset.input, outputSchema: getAsset.output },
        guarded(getAsset.name, (args) => {
          const asset = assets.get(args.id)
          return asset === undefined
            ? reply(getAsset.outcomes, { outcome: 'not_found' })
            : reply(getAsset.outcomes, { outcome: 'ok', asset: assetView(asset) })
        }),
      ),
    )

    keep(
      uploadAsset.name,
      server.registerTool(
        uploadAsset.name,
        {
          ...describe(uploadAsset),
          inputSchema: uploadAsset.input,
          outputSchema: uploadAsset.output,
        },
        guarded(uploadAsset.name, (args) => {
          if (options.refuseUploads !== undefined) {
            return reply(uploadAsset.outcomes, {
              outcome: 'refused',
              problem: options.refuseUploads,
            })
          }
          const original = new Uint8Array(Buffer.from(args.data ?? '', 'base64'))
          const bytes = createHash('sha256').update(original).digest('hex')
          const id = `ast_${createHash('sha256').update(`${site.key}:${bytes}`).digest('hex').slice(0, 26)}`
          const found = assets.get(id)
          if (found !== undefined)
            return reply(uploadAsset.outcomes, { outcome: 'exists', asset: assetView(found) })
          const asset: StubAsset = {
            id,
            format: 'image/webp',
            originalFormat: 'image/png',
            served: new TextEncoder().encode(`webp of ${args.filename}`),
            original,
            alt: args.alt,
            filename: args.filename,
          }
          assets.set(id, asset)
          return reply(uploadAsset.outcomes, { outcome: 'created', asset: assetView(asset) })
        }),
      ),
    )

    keep(
      describeSite.name,
      server.registerTool(
        describeSite.name,
        {
          ...describe(describeSite),
          inputSchema: describeSite.input,
          outputSchema: describeSite.output,
        },
        guarded(describeSite.name, () =>
          reply(describeSite.outcomes, {
            outcome: 'ok',
            site: {
              key: site.key,
              locales: site.locales,
              defaultLocale: site.locales[0] ?? 'en',
              url: null,
              styleGuide: null,
              collections: site.collections.map((name) => ({
                name,
                schema: {},
                routes: options.declared?.[name]?.routes ?? {},
                translationGroupField: null,
                tagsField: null,
                sortByField: null,
                components: (options.declared?.[name]?.components ?? []).map((component) => ({
                  name: component,
                  description: null,
                  example: null,
                  props: {},
                })),
                contracts: [],
                maxMarkdownBytes: options.maxBytes ?? 8192,
                styleGuide: null,
              })),
            },
          }),
        ),
      ),
    )

    keep(
      listEntries.name,
      server.registerTool(
        listEntries.name,
        {
          ...describe(listEntries),
          inputSchema: listEntries.input,
          outputSchema: listEntries.output,
        },
        guarded(listEntries.name, (args) => {
          const matching = [...entries.values()]
            .reverse()
            .filter(
              (entry) =>
                entry.collection === args.collection &&
                (args.locale === undefined || entry.locale === args.locale) &&
                (args.status === undefined || summaryOf(entry).status === args.status) &&
                (args.changedSince === undefined ||
                  (entry.updatedAt ?? STUB_TIME) >= new Date(args.changedSince).toISOString()) &&
                (args.trashed === true) === ((entry.deletedAt ?? null) !== null),
            )
          const start = args.cursor === undefined ? 0 : Number(args.cursor)
          const end = start + Math.min(args.limit, options.pageSize ?? args.limit)
          return reply(listEntries.outcomes, {
            outcome: 'ok',
            entries: matching.slice(start, end).map(summaryOf),
            nextCursor: end < matching.length ? String(end) : null,
          })
        }),
      ),
    )

    keep(
      createDraft.name,
      server.registerTool(
        createDraft.name,
        {
          ...describe(createDraft),
          inputSchema: createDraft.input,
          outputSchema: createDraft.output,
        },
        guarded(createDraft.name, (args) => {
          const verdict = verdictOf(args, 'write')
          if (verdict.errors.some((found) => REFUSALS.includes(found.contract))) {
            return reply(createDraft.outcomes, { outcome: 'refused', verdict })
          }
          if (entries.has(key(args))) {
            const taken = violation(
              'slug-taken',
              '/slug',
              'The slug is taken.',
              'Choose another slug.',
            )
            return reply(createDraft.outcomes, {
              outcome: 'refused',
              verdict: { ...verdict, ok: false, errors: [taken] },
            })
          }
          nextId += 1
          const entry: StubEntry = {
            id: `ent_${String(nextId).padStart(26, '0')}`,
            collection: args.collection,
            locale: args.locale,
            slug: args.slug,
            version: 1,
            revisions: [args.markdown],
            published: null,
            written: verdict,
          }
          entries.set(key(args), entry)
          return reply(createDraft.outcomes, { outcome: 'saved', entry: summaryOf(entry), verdict })
        }),
      ),
    )

    keep(
      updateDraft.name,
      server.registerTool(
        updateDraft.name,
        {
          ...describe(updateDraft),
          inputSchema: updateDraft.input,
          outputSchema: updateDraft.output,
        },
        guarded(updateDraft.name, (args) => {
          const entry = byId(args.id)
          if (entry === undefined) return reply(updateDraft.outcomes, { outcome: 'not_found' })
          if (entry.version !== args.version) {
            return reply(updateDraft.outcomes, {
              outcome: 'conflict',
              conflict: { currentVersion: entry.version, headRevision: revisionId(entry) },
            })
          }
          const verdict = verdictOf(fileOf(entry, args.markdown), 'write')
          if (verdict.errors.some((found) => REFUSALS.includes(found.contract))) {
            return reply(updateDraft.outcomes, { outcome: 'refused', verdict })
          }
          if (entry.revisions.at(-1) === args.markdown) {
            return reply(updateDraft.outcomes, {
              outcome: 'unchanged',
              entry: summaryOf(entry),
              verdict: entry.written ?? verdict,
            })
          }
          entry.revisions.push(args.markdown)
          entry.version += 1
          entry.written = verdict
          for (const review of reviews.values()) {
            if (
              review.status === 'pending' &&
              review.items.some((item) => item.entryId === entry.id)
            ) {
              review.status = 'cancelled'
            }
          }
          return reply(updateDraft.outcomes, { outcome: 'saved', entry: summaryOf(entry), verdict })
        }),
      ),
    )

    keep(
      validate.name,
      server.registerTool(
        validate.name,
        { ...describe(validate), inputSchema: validate.input, outputSchema: validate.output },
        guarded(validate.name, (args) =>
          reply(validate.outcomes, { outcome: 'ok', verdict: verdictOf(args, 'publish') }),
        ),
      ),
    )

    keep(
      publish.name,
      server.registerTool(
        publish.name,
        { ...describe(publish), inputSchema: publish.input, outputSchema: publish.output },
        guarded(publish.name, (args) => {
          const reviewOnly = !granted.includes('content:publish')
          if (reviewOnly && (args.group.length > 0 || args.publishAt !== undefined)) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'Without content:publish, publish asks for a review of one entry, now: not of a group, and not at a time.',
                },
              ],
              isError: true,
            }
          }
          const members = [{ id: args.id, version: args.version }, ...args.group]
          const named = args.group.length > 0
          const checked = []
          for (const member of members) {
            const failedEntry = named ? { failedEntry: member.id } : {}
            const entry = byId(member.id)
            if (entry === undefined) {
              return reply(publish.outcomes, { outcome: 'not_found', ...failedEntry })
            }
            if (entry.version !== member.version) {
              return reply(publish.outcomes, {
                outcome: 'conflict',
                conflict: { currentVersion: entry.version, headRevision: revisionId(entry) },
                ...failedEntry,
              })
            }
            const verdict = verdictOf(fileOf(entry, entry.revisions.at(-1) ?? ''), 'publish')
            if (verdict.errors.length > 0) {
              return reply(publish.outcomes, {
                outcome: 'blocked',
                entry: summaryOf(entry),
                verdict,
                ...failedEntry,
              })
            }
            checked.push({ entry, verdict, failedEntry })
          }
          for (const { entry, verdict, failedEntry } of checked) {
            const unacknowledged = verdict.warnings.filter(
              (warning) =>
                !args.acknowledgeWarnings.some(
                  (ack) => ack.contract === warning.contract && ack.path === warning.path,
                ),
            )
            if (unacknowledged.length > 0) {
              return reply(publish.outcomes, {
                outcome: 'needs_acknowledgement',
                entry: summaryOf(entry),
                verdict,
                ...failedEntry,
              })
            }
          }
          const [asked] = checked
          if (reviewOnly && asked !== undefined) {
            return reply(publish.outcomes, {
              outcome: 'pending_review',
              entry: summaryOf(asked.entry),
              verdict: asked.verdict,
              review: {
                id: 'rvw_01JAB3XQ8ZK4M6N2P5R7S9T0VX',
                entryId: asked.entry.id,
                revision: revisionId(asked.entry),
                status: 'pending',
                requestedBy: 'usr_01JAB3XQ8ZK4M6N2P5R7S9T0VA',
                requestedByName: null,
                requestedAt: STUB_TIME,
                decidedBy: null,
                decidedAt: null,
                note: null,
              },
            })
          }
          for (const { entry } of checked) {
            entry.published = entry.revisions.length - 1
            entry.version += 1
          }
          const [first] = checked
          if (first === undefined) throw new Error('a publish without an entry')
          return reply(publish.outcomes, {
            outcome: 'published',
            entry: summaryOf(first.entry),
            verdict: first.verdict,
          })
        }),
      ),
    )
    const reviewView = (review: StubReview) => ({
      id: review.id,
      entryId: review.items[0]?.entryId ?? '',
      revision: 'rev_00000000000000000000000001',
      status: review.status,
      requestedBy: 'usr_01JAB3XQ8ZK4M6N2P5R7S9T0VA',
      requestedByName: null,
      requestedAt: STUB_TIME,
      decidedBy: null,
      decidedAt: null,
      note: null,
    })

    keep(
      requestReview.name,
      server.registerTool(
        requestReview.name,
        {
          ...describe(requestReview),
          inputSchema: requestReview.input,
          outputSchema: requestReview.output,
        },
        guarded(requestReview.name, (args) => {
          const asked = [
            ...[{ id: args.id, version: args.version }, ...args.group].map((member) => ({
              ...member,
              action: 'publish' as const,
            })),
            ...args.unpublish.map((member) => ({ ...member, action: 'unpublish' as const })),
          ]
          const items: StubReview['items'] = []
          for (const member of asked) {
            const entry = byId(member.id)
            if (entry === undefined) {
              return reply(requestReview.outcomes, { outcome: 'not_found', failedEntry: member.id })
            }
            if (entry.version !== member.version) {
              return reply(requestReview.outcomes, {
                outcome: 'conflict',
                conflict: { currentVersion: entry.version, headRevision: revisionId(entry) },
                failedEntry: member.id,
              })
            }
            const held = [...reviews.values()].find(
              (review) =>
                review.status === 'pending' &&
                review.items.some((item) => item.entryId === member.id),
            )
            if (held !== undefined) {
              return reply(requestReview.outcomes, {
                outcome: 'conflict',
                review: reviewView(held),
                failedEntry: member.id,
              })
            }
            const base =
              entry.published === null ? null : (entry.revisions[entry.published] ?? null)
            items.push({
              entryId: entry.id,
              action: member.action,
              base,
              proposed: member.action === 'publish' ? (entry.revisions.at(-1) ?? null) : null,
            })
          }
          const review: StubReview = {
            id: `rvw_${String(reviews.size + 1).padStart(26, '0')}`,
            status: 'pending',
            items,
            comments: [],
            acknowledged: args.acknowledgeWarnings,
          }
          reviews.set(review.id, review)
          const first = byId(args.id)
          return reply(requestReview.outcomes, {
            outcome: 'pending_review',
            ...(first === undefined ? {} : { entry: summaryOf(first) }),
            review: reviewView(review),
          })
        }),
      ),
    )

    const commentView = (comment: StubReview['comments'][number], index: number) => ({
      id: `cmt_${index + 1}`,
      author: 'usr_01JAB3XQ8ZK4M6N2P5R7S9T0VA',
      authorName: null,
      authorKind: 'person' as const,
      client: 'hollware-cli',
      body: comment.body,
      at: STUB_TIME,
      entryId: comment.entryId,
      lines: comment.lines,
    })

    keep(
      getReview.name,
      server.registerTool(
        getReview.name,
        { ...describe(getReview), inputSchema: getReview.input, outputSchema: getReview.output },
        guarded(getReview.name, (args) => {
          const review = reviews.get(args.id)
          if (review === undefined) return reply(getReview.outcomes, { outcome: 'not_found' })
          return reply(getReview.outcomes, {
            outcome: 'ok',
            review: {
              ...reviewView(review),
              comments: review.comments.map(commentView),
              agents: [],
            },
            items: review.items.flatMap((item) => {
              const entry = byId(item.entryId)
              return entry === undefined
                ? []
                : [
                    {
                      entry: summaryOf(entry),
                      action: item.action,
                      excluded: false,
                      published: item.base,
                      proposed: item.proposed,
                      diff: unifiedDiff(item.base ?? '', item.proposed ?? ''),
                    },
                  ]
            }),
          })
        }),
      ),
    )

    keep(
      commentReview.name,
      server.registerTool(
        commentReview.name,
        {
          ...describe(commentReview),
          inputSchema: commentReview.input,
          outputSchema: commentReview.output,
        },
        guarded(commentReview.name, (args) => {
          const review = reviews.get(args.id)
          if (review === undefined) return reply(commentReview.outcomes, { outcome: 'not_found' })
          if (review.status !== 'pending') {
            return reply(commentReview.outcomes, { outcome: 'not_pending' })
          }
          const comment = {
            body: args.body,
            entryId: args.entryId ?? null,
            lines: args.lines ?? null,
          }
          review.comments.push(comment)
          return reply(commentReview.outcomes, {
            outcome: 'commented',
            comment: commentView(comment, review.comments.length - 1),
          })
        }),
      ),
    )

    keep(
      unpublish.name,
      server.registerTool(
        unpublish.name,
        { ...describe(unpublish), inputSchema: unpublish.input, outputSchema: unpublish.output },
        guarded(unpublish.name, (args) => {
          const entry = byId(args.id)
          if (entry === undefined) return reply(unpublish.outcomes, { outcome: 'not_found' })
          if (entry.published !== null) {
            entry.published = null
            entry.version += 1
          }
          return reply(unpublish.outcomes, { outcome: 'unpublished', entry: summaryOf(entry) })
        }),
      ),
    )
    return server
  }

  const handler = createMcpHandler(() => buildServer())

  async function handle(request: Request): Promise<Response> {
    authorizations.push(request.headers.get('authorization'))
    const custom = options.respond?.(request)
    if (custom !== undefined) return custom
    const path = new URL(request.url).pathname
    const served = /^\/assets\/[^/]+\/(ast_[0-9a-f]{26})$/.exec(path)
    if (served !== null) {
      const asset = assets.get(served[1] ?? '')
      return asset === undefined
        ? new Response('{}', { status: 404 })
        : new Response(asset.served, { headers: { 'content-type': asset.format } })
    }
    if (request.headers.get('authorization') !== `Bearer ${options.token}`) {
      return new Response(JSON.stringify({ error: 'invalid_token' }), {
        status: 401,
        headers: {
          'content-type': 'application/json',
          'www-authenticate': 'Bearer realm="hollware"',
        },
      })
    }
    const original = /^\/v1\/assets\/(ast_[0-9a-f]{26})\/original$/.exec(path)
    if (original !== null) {
      const asset = assets.get(original[1] ?? '')
      return asset === undefined
        ? new Response('{}', { status: 404 })
        : new Response(asset.original, { headers: { 'content-type': asset.originalFormat } })
    }
    const missing = (await scopesNeeded(request)).filter((scope) => !granted.includes(scope))
    if (missing.length > 0) {
      return new Response(JSON.stringify({ error: 'insufficient_scope' }), {
        status: 403,
        headers: {
          'content-type': 'application/json',
          'www-authenticate': `Bearer error="insufficient_scope", scope="${missing.join(' ')}"`,
        },
      })
    }
    return handler.fetch(request)
  }

  const http = createServer((incoming, outgoing) => {
    void forward(incoming, outgoing)
  })

  async function forward(incoming: IncomingMessage, outgoing: ServerResponse): Promise<void> {
    const chunks: Buffer[] = []
    for await (const chunk of incoming) chunks.push(Buffer.from(chunk))
    const method = incoming.method ?? 'GET'
    const headers = new Headers()
    for (const [name, value] of Object.entries(incoming.headers)) {
      if (typeof value === 'string') headers.set(name, value)
    }
    const request = new Request(`http://${incoming.headers.host}${incoming.url ?? '/'}`, {
      method,
      headers,
      ...(method === 'GET' || method === 'HEAD' ? {} : { body: Buffer.concat(chunks) }),
    })
    const response = await handle(request)
    outgoing.writeHead(response.status, Object.fromEntries(response.headers))
    if (response.body !== null) {
      for await (const chunk of response.body) outgoing.write(chunk)
    }
    outgoing.end()
  }

  return new Promise((resolve) => {
    http.listen(0, '127.0.0.1', () => {
      const address = http.address()
      if (address === null || typeof address === 'string') throw new Error('the stub has no port')
      origin = `http://127.0.0.1:${address.port}`
      resolve({
        url: origin,
        entries,
        assets,
        reviews,
        calls,
        authorizations,
        close: async () => {
          await handler.close()
          http.closeAllConnections()
          await new Promise<void>((done) => http.close(() => done()))
        },
      })
    })
  })
}

async function scopesNeeded(request: Request): Promise<readonly Scope[]> {
  if (request.method !== 'POST') return []
  try {
    const body: unknown = await request.clone().json()
    if (typeof body !== 'object' || body === null || !('method' in body)) return []
    if (body.method !== 'tools/call') return []
    const params = 'params' in body ? body.params : undefined
    const name =
      typeof params === 'object' && params !== null && 'name' in params ? params.name : undefined
    return OPERATIONS.find((spec) => spec.name === name)?.scopes ?? []
  } catch {
    return []
  }
}
