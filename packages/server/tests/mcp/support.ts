import {
  siteDefinitionData,
  type OperationByName,
  type OperationName,
  type OutcomeOf,
  type ResolvedSite,
  type schemas,
  type Scope,
} from '@hollware/core'
import {
  Client,
  StreamableHTTPClientTransport,
  type ClientCapabilities,
} from '@modelcontextprotocol/client'
import type * as z from 'zod'
import type { Principal } from '../../src/auth/types.ts'
import {
  createMcpEndpoint,
  type McpCall,
  type McpEndpoint,
  type McpLogEntry,
} from '../../src/mcp/index.ts'
import type { Handlers, OperationContext, OperationHandler } from '../../src/ops/types.ts'
import type { Clock, ContentStore } from '../../src/ports.ts'

export const ENTRY_ID = 'ent_01JAB3XQ8ZK4M6N2P5R7S9T0VW'
const REVISION_ID = 'rev_01JAB3XQ8ZK4M6N2P5R7S9T0VX'

export const SITE: ResolvedSite = {
  key: 'playground',
  locales: ['en', 'es'],
  defaultLocale: 'en',
  styleGuide: null,
  collections: new Map(),
  url: null,
  cors: { origins: [] },
  events: { webhooks: [], indexNow: null },
  audit: { ipAddresses: 'off', retentionDays: null },
  backups: { enabled: true, retentionDays: 30 },
  access: { autoProvision: null },
  agents: [],
  review: { requireAgents: false },
  media: { format: 'webp', quality: 85, maxWidth: 2400, widths: [640, 1280], keepOriginals: true },
}

const unused = (): never => {
  throw new Error('a fake handler never reaches the store')
}

export const STORE: ContentStore = {
  findEntry: unused,
  findEntryById: unused,
  listEntries: unused,
  searchEntries: unused,
  findSummaries: unused,
  relatedOf: unused,
  listTranslations: unused,
  lookup: unused,
  lastPublication: unused,
  listRevisions: unused,
  findRevision: unused,
  moveEntry: unused,
  listRedirects: unused,
  sourceHeadTimes: unused,
  revisionTimes: unused,
  scheduleUnpublish: unused,
  cancelUnpublish: unused,
  unpublishOf: unused,
  dueUnpublishes: unused,
  createEntry: unused,
  appendRevision: unused,
  publish: unused,
  publishGroup: unused,
  schedule: unused,
  dueSchedules: unused,
  cancelSchedule: unused,
  unpublish: unused,
  trashEntry: unused,
  restoreEntry: unused,
  requestReview: unused,
  findReview: unused,
  listReviews: unused,
  requestChanges: unused,
  rejectReview: unused,
  commentReview: unused,
  reviewComments: unused,
  reviewAgentRuns: unused,
  markAgentRun: unused,
  reviewItems: unused,
  revisionMarkdown: unused,
  approveReview: unused,
}

export const CLOCK: Clock = { now: () => new Date('2026-10-12T12:00:00.000Z') }

export const ALL_SCOPES: readonly Scope[] = [
  'content:read',
  'content:write',
  'content:publish',
  'schema:admin',
  'site:owner',
  'review:read',
  'review:comment',
]

export function tokenPrincipal(scopes: readonly Scope[] = ALL_SCOPES): Principal {
  return {
    kind: 'token',
    userId: 'usr_01JAB3XQ8ZK4M6N2P5R7S9T0VA',
    tokenId: 'tok_01JAB3XQ8ZK4M6N2P5R7S9T0VB',
    site: 'playground',
    scopes,
  }
}

export function oauthPrincipal(scopes: readonly Scope[] = ALL_SCOPES): Principal {
  return {
    kind: 'oauth',
    userId: 'usr_01JAB3XQ8ZK4M6N2P5R7S9T0VA',
    clientId: 'https://client.example/oauth/metadata.json',
    site: 'playground',
    scopes,
  }
}

export function makeCall(overrides: { principal?: Principal; requestId?: string } = {}): McpCall {
  return {
    principal: overrides.principal ?? tokenPrincipal(),
    requestId: overrides.requestId ?? 'req_test_1',
    context: { site: SITE, store: STORE, clock: CLOCK },
  }
}

type Verdict = z.output<typeof schemas.verdict>
type Violation = z.output<typeof schemas.violation>
type EntrySummary = z.output<typeof schemas.entrySummary>
type Entry = z.output<typeof schemas.entry>

const VERDICT_OK: Verdict = {
  ok: true,
  phase: 'write',
  errors: [],
  warnings: [],
  contractsHash: 'hash-1',
}

const ERROR: Violation = {
  contract: 'required-description',
  severity: 'error',
  path: '/frontmatter/description',
  message: 'The description is missing.',
  fix: 'Add a description of at most 160 characters.',
}

const VERDICT_FAILED: Verdict = { ...VERDICT_OK, ok: false, errors: [ERROR] }

export const WARNING_TITLE: Violation = {
  contract: 'seo-title-length',
  severity: 'warning',
  path: '/frontmatter/title',
  message: 'The title has 72 characters.',
  fix: 'Shorten it to 60 characters or fewer.',
}

export const WARNING_ALT: Violation = {
  contract: 'image-alt',
  severity: 'warning',
  path: '/body',
  message: 'An image has no alternative text.',
  fix: 'Describe the image between the brackets.',
  line: 12,
}

export const VERDICT_WARNED: Verdict = {
  ok: true,
  phase: 'publish',
  errors: [],
  warnings: [WARNING_TITLE, WARNING_ALT],
  contractsHash: 'hash-1',
}

export const SUMMARY: EntrySummary = {
  id: ENTRY_ID,
  collection: 'blog',
  locale: 'en',
  slug: 'hello-world',
  translationGroup: 'hello',
  status: 'draft',
  version: 1,
  frontmatter: { title: 'Hello world' },
  tags: ['news'],
  hasUnpublishedChanges: false,
  publishedAt: null,
  scheduledAt: null,
  deletedAt: null,
  updatedAt: '2026-10-12T12:00:00.000Z',
}

export const ENTRY: Entry = {
  ...SUMMARY,
  revision: REVISION_ID,
  unpublishAt: null,
  verdict: VERDICT_OK,
  lastPublication: null,
  markdown: '---\ntitle: Hello world\n---\nHello.',
}

const CONFLICT = { currentVersion: 2, headRevision: REVISION_ID }

const HISTORY_REVISION = {
  id: REVISION_ID,
  entryId: ENTRY_ID,
  createdAt: '2026-10-18T00:00:00.000Z',
  author: 'usr_01JAB3XQ8ZK4M6N2P5R7S9T0VW',
  authorName: 'Ada',
  via: 'token',
  client: 'claude-code 2.1.0',
  title: 'Edge caching',
  wordCount: 120,
  errors: 0,
  warnings: 1,
  head: true,
  live: false,
  published: false,
} as const

export const REVIEW_ID = 'rvw_01JAB3XQ8ZK4M6N2P5R7S9T0VX'

const REVIEW = {
  id: REVIEW_ID,
  entryId: ENTRY_ID,
  revision: REVISION_ID,
  status: 'pending',
  requestedBy: 'usr_01JAB3XQ8ZK4M6N2P5R7S9T0VA',
  requestedByName: 'Ada',
  requestedAt: '2026-10-12T12:00:00.000Z',
  decidedBy: null,
  decidedAt: null,
  note: null,
} as const

type OutputOf<Name extends OperationName> = z.output<OperationByName<Name>['output']>

type Canned = {
  readonly [Name in OperationName]: Readonly<
    Record<OutcomeOf<OperationByName<Name>['output']>, OutputOf<Name>>
  >
}

const STRUCTURE = siteDefinitionData.parse({
  locales: ['en'],
  defaultLocale: 'en',
  collections: {
    blog: {
      schema: { type: 'object', properties: { title: { type: 'string' } } },
      routes: { en: '/blog/:slug/' },
    },
  },
})

const PROBLEM = {
  path: 'sites.acme.collections.blog.schema',
  message: 'the schema of the frontmatter is not of an object',
  fix: 'Give a JSON Schema with "type": "object" and the fields under "properties".',
}

const STRUCTURE_CHANGES: Canned['update_site'] = {
  updated: { outcome: 'updated', version: 3 },
  unchanged: { outcome: 'unchanged', version: 2 },
  invalid: { outcome: 'invalid', problems: [PROBLEM] },
  needs_confirmation: {
    outcome: 'needs_confirmation',
    impact: { removedCollections: [{ name: 'blog', entries: 3 }], removedLocales: [], refused: [] },
  },
  conflict: { outcome: 'conflict', currentVersion: 4 },
}

const ASSET = {
  id: 'ast_0123456789abcdef0123456789',
  reference: 'asset:ast_0123456789abcdef0123456789',
  url: 'https://cms.example.com/assets/ast_0123456789abcdef0123456789',
  format: 'image/webp' as const,
  width: 1200,
  height: 630,
  bytes: 48211,
  widths: [640],
  srcset:
    'https://cms.example.com/assets/ast_0123456789abcdef0123456789/640 640w, https://cms.example.com/assets/ast_0123456789abcdef0123456789 1200w',
  originalFormat: 'image/png' as const,
  originalBytes: 312009,
  alt: 'A diagram of the pipeline',
  filename: 'pipeline.png',
  createdAt: '2026-10-18T00:00:00.000Z',
}

const MARKDOWN = '---\ntitle: Hello world\n---\nHello.'

export const CANNED: Canned = {
  approve_review: {
    published: {
      outcome: 'published',
      review: { ...REVIEW, status: 'approved' },
      entry: { ...SUMMARY, status: 'published', version: 2 },
    },
    blocked: { outcome: 'blocked', review: REVIEW, entry: SUMMARY, verdict: VERDICT_FAILED },
    agents_pending: {
      outcome: 'agents_pending',
      review: REVIEW,
      agents: [{ name: 'reviewer', status: 'queued', required: true }],
    },
    needs_acknowledgement: {
      outcome: 'needs_acknowledgement',
      review: REVIEW,
      entry: SUMMARY,
      verdict: VERDICT_WARNED,
    },
    conflict: {
      outcome: 'conflict',
      review: REVIEW,
      conflict: { currentVersion: 3, headRevision: REVISION_ID },
      failedEntry: ENTRY_ID,
    },
    not_pending: { outcome: 'not_pending', review: { ...REVIEW, status: 'cancelled' } },
    not_found: { outcome: 'not_found' },
  },
  create_draft: {
    saved: { outcome: 'saved', entry: SUMMARY, verdict: VERDICT_OK },
    refused: { outcome: 'refused', verdict: VERDICT_FAILED },
    in_trash: {
      outcome: 'in_trash',
      entry: { ...SUMMARY, version: 2, deletedAt: '2026-10-12T12:00:00.000Z' },
    },
  },
  describe_site: {
    ok: {
      outcome: 'ok',
      site: {
        key: 'playground',
        locales: ['en', 'es'],
        defaultLocale: 'en',
        url: null,
        styleGuide: null,
        collections: [],
      },
    },
  },
  comment_review: {
    commented: {
      outcome: 'commented',
      comment: {
        id: 'rvc_01JAB3XQ8ZK4M6N2P5R7S9T0VZ',
        author: 'usr_01JAB3XQ8ZK4M6N2P5R7S9T0VA',
        authorName: 'Ada',
        authorKind: 'person',
        client: null,
        body: 'Add an example.',
        at: '2026-10-13T11:00:00.000Z',
        entryId: null,
        lines: null,
      },
    },
    not_pending: { outcome: 'not_pending' },
    not_found: { outcome: 'not_found' },
  },
  content_stats: {
    ok: {
      outcome: 'ok',
      since: '2026-09-15T10:00:00.000Z',
      pages: [
        { path: '/blog/hello-world/', views: 42, entry: SUMMARY },
        { path: '/', views: 7, entry: null },
      ],
    },
    unavailable: { outcome: 'unavailable' },
  },
  get_analytics: {
    connected: {
      outcome: 'connected',
      provider: 'posthog',
      settings: { host: 'https://us.posthog.com', projectId: 521024 },
      connectedAt: '2026-10-21T10:00:00.000Z',
      checkedAt: '2026-10-21T10:00:00.000Z',
    },
    not_connected: { outcome: 'not_connected' },
  },
  connect_analytics: {
    connected: {
      outcome: 'connected',
      settings: { host: 'https://us.posthog.com', projectId: 521024 },
      views: 380,
      paths: 24,
    },
    refused: {
      outcome: 'refused',
      message: 'API key does not have the required scope.',
      fix: 'Give the key the scope Query: read.',
    },
    unreachable: { outcome: 'unreachable', message: 'PostHog did not answer.', fix: 'Try again.' },
    invalid: { outcome: 'invalid', message: 'GA4 needs the property.', fix: 'Pass it.' },
    unavailable: { outcome: 'unavailable' },
  },
  disconnect_analytics: {
    disconnected: { outcome: 'disconnected' },
    not_connected: { outcome: 'not_connected' },
  },
  get_review: {
    ok: {
      outcome: 'ok',
      review: { ...REVIEW, comments: [], agents: [] },
      items: [
        {
          entry: SUMMARY,
          action: 'publish',
          excluded: false,
          published: null,
          proposed: MARKDOWN,
          diff: '@@ -0,0 +1,4 @@\n+---\n+title: Hello world\n+---\n+Hello.\n',
        },
      ],
    },
    not_found: { outcome: 'not_found' },
  },
  get_entry: {
    ok: { outcome: 'ok', entry: ENTRY },
    not_found: { outcome: 'not_found' },
  },
  get_translations: {
    ok: { outcome: 'ok', entries: [SUMMARY] },
    not_found: { outcome: 'not_found' },
  },
  list_entries: {
    ok: { outcome: 'ok', entries: [SUMMARY], nextCursor: null },
  },
  search: {
    ok: {
      outcome: 'ok',
      mode: 'fulltext',
      results: [{ entry: SUMMARY, snippet: 'the [words] found', score: 1.5 }],
    },
  },
  list_reviews: {
    ok: {
      outcome: 'ok',
      reviews: [
        {
          ...REVIEW,
          entry: SUMMARY,
          comments: [
            {
              id: 'rvc_01JAB3XQ8ZK4M6N2P5R7S9T0VZ',
              author: 'usr_01JAB3XQ8ZK4M6N2P5R7S9T0VA',
              authorName: 'Ada',
              authorKind: 'person',
              client: 'hollware-agents',
              body: 'The second section needs an example.',
              at: '2026-10-13T11:00:00.000Z',
              entryId: null,
              lines: null,
            },
          ],
          items: 1,
          agents: [{ name: 'reviewer', status: 'commented', required: true }],
        },
      ],
    },
  },
  publish: {
    published: { outcome: 'published', entry: { ...SUMMARY, status: 'published', version: 2 } },
    scheduled: { outcome: 'scheduled', entry: { ...SUMMARY, status: 'scheduled', version: 2 } },
    blocked: { outcome: 'blocked', entry: SUMMARY, verdict: VERDICT_FAILED },
    needs_acknowledgement: {
      outcome: 'needs_acknowledgement',
      entry: SUMMARY,
      verdict: VERDICT_WARNED,
    },
    pending_review: {
      outcome: 'pending_review',
      entry: SUMMARY,
      verdict: VERDICT_OK,
      review: REVIEW,
    },
    conflict: { outcome: 'conflict', conflict: CONFLICT },
    not_found: { outcome: 'not_found' },
  },
  request_review: {
    pending_review: {
      outcome: 'pending_review',
      entry: SUMMARY,
      verdict: VERDICT_OK,
      review: REVIEW,
    },
    blocked: { outcome: 'blocked', entry: SUMMARY, verdict: VERDICT_FAILED },
    needs_acknowledgement: {
      outcome: 'needs_acknowledgement',
      entry: SUMMARY,
      verdict: VERDICT_OK,
    },
    conflict: { outcome: 'conflict', conflict: { currentVersion: 2, headRevision: REVISION_ID } },
    not_found: { outcome: 'not_found' },
  },
  request_changes: {
    changes_requested: {
      outcome: 'changes_requested',
      review: { ...REVIEW, status: 'changes_requested', note: 'Cite a source.' },
    },
    not_pending: { outcome: 'not_pending', review: { ...REVIEW, status: 'approved' } },
    not_found: { outcome: 'not_found' },
  },
  reject_review: {
    rejected: {
      outcome: 'rejected',
      review: { ...REVIEW, status: 'rejected', note: 'Not for this site.' },
    },
    not_pending: { outcome: 'not_pending', review: { ...REVIEW, status: 'approved' } },
    not_found: { outcome: 'not_found' },
  },
  unpublish: {
    unpublished: { outcome: 'unpublished', entry: SUMMARY },
    not_found: { outcome: 'not_found' },
  },
  update_draft: {
    saved: { outcome: 'saved', entry: { ...SUMMARY, version: 2 }, verdict: VERDICT_OK },
    unchanged: { outcome: 'unchanged', entry: SUMMARY },
    conflict: { outcome: 'conflict', conflict: CONFLICT },
    not_found: { outcome: 'not_found' },
    refused: { outcome: 'refused', verdict: VERDICT_FAILED },
  },
  validate: {
    ok: { outcome: 'ok', verdict: VERDICT_OK },
  },
  create_site: {
    created: { outcome: 'created', version: 1 },
    taken: { outcome: 'taken' },
    invalid: { outcome: 'invalid', problems: [PROBLEM] },
  },
  delete_entry: {
    trashed: {
      outcome: 'trashed',
      entry: { ...SUMMARY, version: 2, deletedAt: '2026-10-12T12:00:00.000Z' },
    },
    published: { outcome: 'published', entry: { ...SUMMARY, status: 'published', version: 2 } },
    conflict: { outcome: 'conflict', conflict: { currentVersion: 2, headRevision: REVISION_ID } },
    not_found: { outcome: 'not_found' },
  },
  restore_entry: {
    restored: { outcome: 'restored', entry: { ...SUMMARY, version: 3 } },
    not_trashed: { outcome: 'not_trashed', entry: SUMMARY },
    not_found: { outcome: 'not_found' },
  },
  delete_site: {
    trashed: { outcome: 'trashed' },
    needs_confirmation: { outcome: 'needs_confirmation', entries: 3 },
    not_found: { outcome: 'not_found' },
  },
  upload_asset: {
    created: { outcome: 'created', asset: ASSET },
    exists: { outcome: 'exists', asset: ASSET },
    refused: { outcome: 'refused', problem: { message: 'Not an image.', fix: 'Send one.' } },
    unavailable: { outcome: 'unavailable', problem: { message: 'No bucket.', fix: 'Bind one.' } },
  },
  list_assets: { ok: { outcome: 'ok', assets: [ASSET], nextCursor: null } },
  get_asset: { ok: { outcome: 'ok', asset: ASSET }, not_found: { outcome: 'not_found' } },
  update_asset: {
    updated: { outcome: 'updated', asset: ASSET },
    unchanged: { outcome: 'unchanged', asset: ASSET },
    not_found: { outcome: 'not_found' },
  },
  list_backups: {
    ok: { outcome: 'ok', backups: [{ date: '2026-10-18', bytes: 2048 }] },
    unavailable: { outcome: 'unavailable' },
  },
  move_entry: {
    moved: { outcome: 'moved', entry: { ...SUMMARY, slug: 'hello-again', version: 2 } },
    unchanged: { outcome: 'unchanged', entry: SUMMARY },
    taken: { outcome: 'taken' },
    conflict: { outcome: 'conflict', conflict: CONFLICT },
    not_found: { outcome: 'not_found' },
  },
  list_redirects: {
    ok: {
      outcome: 'ok',
      redirects: [
        {
          collection: 'blog',
          locale: 'en',
          from: 'hello-world',
          to: 'hello-again',
          fromPath: '/en/blog/hello-world/',
          toPath: '/en/blog/hello-again/',
          entryId: ENTRY_ID,
        },
      ],
      nextCursor: null,
    },
  },
  schedule_unpublish: {
    scheduled: { outcome: 'scheduled', entry: SUMMARY, unpublishAt: '2026-11-01T00:00:00.000Z' },
    unpublished: { outcome: 'unpublished', entry: SUMMARY },
    cancelled: { outcome: 'cancelled', entry: SUMMARY, unpublishAt: null },
    not_published: { outcome: 'not_published', entry: SUMMARY },
    not_found: { outcome: 'not_found' },
  },
  list_revisions: {
    ok: { outcome: 'ok', revisions: [HISTORY_REVISION], nextCursor: null },
    not_found: { outcome: 'not_found' },
  },
  get_revision: {
    ok: {
      outcome: 'ok',
      revision: { ...HISTORY_REVISION, markdown: '---\ntitle: Hello world\n---\nHello.' },
    },
    not_found: { outcome: 'not_found' },
  },
  restore_revision: {
    saved: { outcome: 'saved', entry: { ...SUMMARY, version: 2 }, verdict: VERDICT_OK },
    unchanged: { outcome: 'unchanged', entry: SUMMARY },
    conflict: { outcome: 'conflict', conflict: CONFLICT },
    not_found: { outcome: 'not_found' },
    refused: { outcome: 'refused', verdict: VERDICT_FAILED },
  },
  make_webhook_secret: {
    made: { outcome: 'made', secret: `whsec_${'a'.repeat(64)}` },
    not_found: { outcome: 'not_found' },
    unavailable: { outcome: 'unavailable' },
  },
  get_structure: {
    ok: { outcome: 'ok', site: 'acme', version: 2, definition: STRUCTURE, catalog: [] },
  },
  restore_site: {
    restored: { outcome: 'restored' },
    not_found: { outcome: 'not_found' },
  },
  set_collection: STRUCTURE_CHANGES,
  update_site: STRUCTURE_CHANGES,
}

export function cannedOutput(tool: OperationName, outcome: string): unknown {
  return Object.entries(CANNED[tool]).find(([name]) => name === outcome)?.[1]
}

export const INPUTS: { readonly [Name in OperationName]: z.input<OperationByName<Name>['input']> } =
  {
    approve_review: { id: REVIEW_ID },
    comment_review: { id: REVIEW_ID, body: 'Add an example.' },
    connect_analytics: { provider: 'posthog', credential: 'phx_test_key' },
    content_stats: {},
    create_draft: { collection: 'blog', locale: 'en', slug: 'hello-world', markdown: MARKDOWN },
    describe_site: {},
    disconnect_analytics: {},
    get_analytics: {},
    get_entry: { collection: 'blog', locale: 'en', slug: 'hello-world' },
    get_review: { id: REVIEW_ID },
    get_translations: { collection: 'blog', translationGroup: 'hello' },
    list_entries: { collection: 'blog' },
    search: { query: 'words' },
    list_reviews: {},
    publish: { id: ENTRY_ID, version: 1 },
    request_changes: { id: REVIEW_ID, note: 'Cite a source.' },
    reject_review: { id: REVIEW_ID, reason: 'Not for this site.' },
    request_review: { id: ENTRY_ID, version: 1 },
    unpublish: { id: ENTRY_ID },
    update_draft: { id: ENTRY_ID, version: 1, markdown: MARKDOWN },
    validate: { collection: 'blog', locale: 'en', slug: 'hello-world', markdown: MARKDOWN },
    create_site: { key: 'notes', definition: STRUCTURE },
    delete_site: { key: 'notes' },
    delete_entry: { id: ENTRY_ID, version: 1 },
    restore_entry: { id: ENTRY_ID },
    get_structure: {},
    make_webhook_secret: { webhook: 'newsletter' },
    upload_asset: {
      filename: 'pipeline.png',
      alt: 'A diagram of the pipeline',
      data: 'iVBORw0KGgo=',
    },
    list_assets: {},
    get_asset: { id: 'ast_0123456789abcdef0123456789' },
    update_asset: { id: 'ast_0123456789abcdef0123456789', alt: 'A diagram' },
    list_revisions: { id: ENTRY_ID },
    schedule_unpublish: { id: ENTRY_ID, unpublishAt: '2026-11-01T00:00:00.000Z' },
    move_entry: { id: ENTRY_ID, version: 1, slug: 'hello-again' },
    list_backups: {},
    list_redirects: {},
    get_revision: { id: REVISION_ID },
    restore_revision: { id: ENTRY_ID, version: 1, revision: REVISION_ID },
    restore_site: { key: 'notes' },
    set_collection: { version: 2, name: 'blog', collection: null },
    update_site: { version: 2, definition: STRUCTURE },
  }

export interface Seen {
  readonly tool: OperationName
  readonly input: unknown
  readonly context: OperationContext
}

export type Overrides = { [Name in OperationName]?: Handlers[Name] }

function pick<Output>(canned: Readonly<Record<string, Output>>, outcome: string): Output {
  const found = Object.entries(canned).find(([name]) => name === outcome)
  if (found === undefined) throw new Error(`no canned output for the outcome ${outcome}`)
  return found[1]
}

export function fakeHandlers(
  overrides: Overrides = {},
  outcomes: { readonly [Name in OperationName]?: string } = {},
): { handlers: Handlers; seen: Seen[] } {
  const seen: Seen[] = []
  const record =
    <Name extends OperationName>(
      tool: Name,
      handler: OperationHandler<Name>,
    ): OperationHandler<Name> =>
    async (input, context) => {
      seen.push({ tool, input, context })
      return handler(input, context)
    }
  const handlers: Handlers = {
    approve_review: record(
      'approve_review',
      overrides.approve_review ??
        (async () => pick(CANNED.approve_review, outcomes.approve_review ?? 'published')),
    ),
    comment_review: record(
      'comment_review',
      overrides.comment_review ??
        (async () => pick(CANNED.comment_review, outcomes.comment_review ?? 'commented')),
    ),
    connect_analytics: record(
      'connect_analytics',
      overrides.connect_analytics ??
        (async () => pick(CANNED.connect_analytics, outcomes.connect_analytics ?? 'connected')),
    ),
    disconnect_analytics: record(
      'disconnect_analytics',
      overrides.disconnect_analytics ??
        (async () =>
          pick(CANNED.disconnect_analytics, outcomes.disconnect_analytics ?? 'disconnected')),
    ),
    get_analytics: record(
      'get_analytics',
      overrides.get_analytics ??
        (async () => pick(CANNED.get_analytics, outcomes.get_analytics ?? 'connected')),
    ),
    content_stats: record(
      'content_stats',
      overrides.content_stats ??
        (async () => pick(CANNED.content_stats, outcomes.content_stats ?? 'ok')),
    ),
    create_draft: record(
      'create_draft',
      overrides.create_draft ??
        (async () => pick(CANNED.create_draft, outcomes.create_draft ?? 'saved')),
    ),
    describe_site: record(
      'describe_site',
      overrides.describe_site ??
        (async () => pick(CANNED.describe_site, outcomes.describe_site ?? 'ok')),
    ),
    get_review: record(
      'get_review',
      overrides.get_review ?? (async () => pick(CANNED.get_review, outcomes.get_review ?? 'ok')),
    ),
    get_entry: record(
      'get_entry',
      overrides.get_entry ?? (async () => pick(CANNED.get_entry, outcomes.get_entry ?? 'ok')),
    ),
    get_translations: record(
      'get_translations',
      overrides.get_translations ??
        (async () => pick(CANNED.get_translations, outcomes.get_translations ?? 'ok')),
    ),
    list_entries: record(
      'list_entries',
      overrides.list_entries ??
        (async () => pick(CANNED.list_entries, outcomes.list_entries ?? 'ok')),
    ),
    search: record(
      'search',
      overrides.search ?? (async () => pick(CANNED.search, outcomes.search ?? 'ok')),
    ),
    list_reviews: record(
      'list_reviews',
      overrides.list_reviews ??
        (async () => pick(CANNED.list_reviews, outcomes.list_reviews ?? 'ok')),
    ),
    request_review: record(
      'request_review',
      overrides.request_review ??
        (async () => pick(CANNED.request_review, outcomes.request_review ?? 'pending_review')),
    ),
    request_changes: record(
      'request_changes',
      overrides.request_changes ??
        (async () => pick(CANNED.request_changes, outcomes.request_changes ?? 'changes_requested')),
    ),
    reject_review: record(
      'reject_review',
      overrides.reject_review ??
        (async () => pick(CANNED.reject_review, outcomes.reject_review ?? 'rejected')),
    ),
    publish: record(
      'publish',
      overrides.publish ?? (async () => pick(CANNED.publish, outcomes.publish ?? 'published')),
    ),
    unpublish: record(
      'unpublish',
      overrides.unpublish ??
        (async () => pick(CANNED.unpublish, outcomes.unpublish ?? 'unpublished')),
    ),
    update_draft: record(
      'update_draft',
      overrides.update_draft ??
        (async () => pick(CANNED.update_draft, outcomes.update_draft ?? 'saved')),
    ),
    validate: record(
      'validate',
      overrides.validate ?? (async () => pick(CANNED.validate, outcomes.validate ?? 'ok')),
    ),
    create_site: record(
      'create_site',
      overrides.create_site ??
        (async () => pick(CANNED.create_site, outcomes.create_site ?? 'created')),
    ),
    delete_entry: record(
      'delete_entry',
      overrides.delete_entry ??
        (async () => pick(CANNED.delete_entry, outcomes.delete_entry ?? 'trashed')),
    ),
    restore_entry: record(
      'restore_entry',
      overrides.restore_entry ??
        (async () => pick(CANNED.restore_entry, outcomes.restore_entry ?? 'restored')),
    ),
    delete_site: record(
      'delete_site',
      overrides.delete_site ??
        (async () => pick(CANNED.delete_site, outcomes.delete_site ?? 'trashed')),
    ),
    upload_asset: record(
      'upload_asset',
      overrides.upload_asset ??
        (async () => pick(CANNED.upload_asset, outcomes.upload_asset ?? 'created')),
    ),
    list_assets: record(
      'list_assets',
      overrides.list_assets ?? (async () => pick(CANNED.list_assets, outcomes.list_assets ?? 'ok')),
    ),
    get_asset: record(
      'get_asset',
      overrides.get_asset ?? (async () => pick(CANNED.get_asset, outcomes.get_asset ?? 'ok')),
    ),
    update_asset: record(
      'update_asset',
      overrides.update_asset ??
        (async () => pick(CANNED.update_asset, outcomes.update_asset ?? 'updated')),
    ),
    list_backups: record(
      'list_backups',
      overrides.list_backups ??
        (async () => pick(CANNED.list_backups, outcomes.list_backups ?? 'ok')),
    ),
    move_entry: record(
      'move_entry',
      overrides.move_entry ?? (async () => pick(CANNED.move_entry, outcomes.move_entry ?? 'moved')),
    ),
    list_redirects: record(
      'list_redirects',
      overrides.list_redirects ??
        (async () => pick(CANNED.list_redirects, outcomes.list_redirects ?? 'ok')),
    ),
    schedule_unpublish: record(
      'schedule_unpublish',
      overrides.schedule_unpublish ??
        (async () => pick(CANNED.schedule_unpublish, outcomes.schedule_unpublish ?? 'scheduled')),
    ),
    list_revisions: record(
      'list_revisions',
      overrides.list_revisions ??
        (async () => pick(CANNED.list_revisions, outcomes.list_revisions ?? 'ok')),
    ),
    get_revision: record(
      'get_revision',
      overrides.get_revision ??
        (async () => pick(CANNED.get_revision, outcomes.get_revision ?? 'ok')),
    ),
    restore_revision: record(
      'restore_revision',
      overrides.restore_revision ??
        (async () => pick(CANNED.restore_revision, outcomes.restore_revision ?? 'saved')),
    ),
    make_webhook_secret: record(
      'make_webhook_secret',
      overrides.make_webhook_secret ??
        (async () => pick(CANNED.make_webhook_secret, outcomes.make_webhook_secret ?? 'made')),
    ),
    get_structure: record(
      'get_structure',
      overrides.get_structure ??
        (async () => pick(CANNED.get_structure, outcomes.get_structure ?? 'ok')),
    ),
    restore_site: record(
      'restore_site',
      overrides.restore_site ??
        (async () => pick(CANNED.restore_site, outcomes.restore_site ?? 'restored')),
    ),
    set_collection: record(
      'set_collection',
      overrides.set_collection ??
        (async () => pick(CANNED.set_collection, outcomes.set_collection ?? 'updated')),
    ),
    update_site: record(
      'update_site',
      overrides.update_site ??
        (async () => pick(CANNED.update_site, outcomes.update_site ?? 'updated')),
    ),
  }
  return { handlers, seen }
}

export function endpointWith(
  overrides: Overrides = {},
  options: {
    timeoutMs?: number
    openWorldTimeoutMs?: number
    log?: (entry: McpLogEntry) => void
    outcomes?: { readonly [Name in OperationName]?: string }
  } = {},
) {
  const { handlers, seen } = fakeHandlers(overrides, options.outcomes)
  const logs: McpLogEntry[] = []
  const endpoint = createMcpEndpoint({
    handlers,
    serverInfo: { name: 'hollware', version: '0.0.0' },
    log: options.log ?? ((entry) => void logs.push(entry)),
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    ...(options.openWorldTimeoutMs === undefined
      ? {}
      : { openWorldTimeoutMs: options.openWorldTimeoutMs }),
  })
  return { endpoint, seen, logs }
}

export interface Exchange {
  readonly method: string
  readonly body: { readonly method?: string; readonly params?: unknown } | null
  readonly status: number
  readonly headers: Record<string, string>
  readonly text: string
}

export interface ConnectOptions {
  readonly era: '2026' | '2025'
  readonly principal?: Principal
  readonly capabilities?: ClientCapabilities
  readonly elicit?: (message: string) => {
    action: 'accept' | 'decline' | 'cancel'
    content?: Record<string, boolean>
  }
}

export async function connect(endpoint: McpEndpoint, options: ConnectOptions) {
  const exchanges: Exchange[] = []
  let requests = 0
  const client = new Client(
    { name: 'probe', version: '9.9.9' },
    {
      ...(options.capabilities === undefined ? {} : { capabilities: options.capabilities }),
      ...(options.era === '2026' ? { versionNegotiation: { mode: { pin: '2026-07-28' } } } : {}),
    },
  )
  if (options.elicit !== undefined) {
    const answer = options.elicit
    client.setRequestHandler('elicitation/create', (request) => answer(request.params.message))
  }
  await client.connect(
    new StreamableHTTPClientTransport(new URL('https://hollware.test/mcp'), {
      fetch: async (input, init) => {
        requests += 1
        const request = new Request(input, init)
        const sent = request.method === 'POST' ? await request.clone().text() : ''
        const response = await endpoint.fetch(
          request,
          makeCall({
            requestId: `req_client_${requests}`,
            ...(options.principal === undefined ? {} : { principal: options.principal }),
          }),
        )
        exchanges.push({
          method: request.method,
          body: sent === '' ? null : JSON.parse(sent),
          status: response.status,
          headers: Object.fromEntries(response.headers),
          text: await response.clone().text(),
        })
        return response
      },
    }),
  )
  return { client, exchanges }
}

export interface RawOptions {
  readonly call?: McpCall
  readonly headers?: Record<string, string>
  readonly capabilities?: Record<string, unknown>
  readonly clientInfo?: Record<string, unknown>
  readonly inputResponses?: Record<string, unknown>
  readonly requestState?: string
}

export interface Raw {
  readonly status: number
  readonly headers: Headers
  readonly text: string
  readonly message: Record<string, unknown>
  readonly result: Record<string, unknown>
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {}
}

export async function rpc(
  endpoint: McpEndpoint,
  era: 'modern' | 'legacy',
  method: string,
  params: Record<string, unknown> = {},
  options: RawOptions = {},
): Promise<Raw> {
  const modern = era === 'modern'
  const body = {
    jsonrpc: '2.0',
    id: 1,
    method,
    params: {
      ...params,
      ...(options.inputResponses === undefined ? {} : { inputResponses: options.inputResponses }),
      ...(options.requestState === undefined ? {} : { requestState: options.requestState }),
      ...(modern
        ? {
            _meta: {
              'io.modelcontextprotocol/protocolVersion': '2026-07-28',
              'io.modelcontextprotocol/clientInfo': options.clientInfo ?? {
                name: 'raw-client',
                version: '0.0.0',
              },
              'io.modelcontextprotocol/clientCapabilities': options.capabilities ?? {},
            },
          }
        : {}),
    },
  }
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    'mcp-protocol-version': modern ? '2026-07-28' : '2025-11-25',
    ...(modern ? { 'mcp-method': method } : {}),
    ...(modern && typeof params.name === 'string' ? { 'mcp-name': params.name } : {}),
    ...options.headers,
  }
  const response = await endpoint.fetch(
    new Request('https://hollware.test/mcp', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }),
    options.call ?? makeCall(),
  )
  const text = await response.text()
  const json = response.headers.get('content-type')?.startsWith('text/event-stream')
    ? text
        .split('\n')
        .filter((line) => line.startsWith('data: '))
        .map((line) => line.slice('data: '.length))
        .join('')
    : text
  const message = asRecord(JSON.parse(json))
  return {
    status: response.status,
    headers: response.headers,
    text,
    message,
    result: asRecord(message.result),
  }
}

export function callRaw(
  endpoint: McpEndpoint,
  era: 'modern' | 'legacy',
  tool: OperationName,
  args: unknown,
  options: RawOptions = {},
): Promise<Raw> {
  return rpc(endpoint, era, 'tools/call', { name: tool, arguments: args }, options)
}

export function textOf(result: Record<string, unknown>): unknown {
  const content = result.content
  if (!Array.isArray(content)) throw new Error('the result has no content')
  const first = asRecord(content[0])
  if (typeof first.text !== 'string') throw new Error('the first block is not text')
  return JSON.parse(first.text)
}
