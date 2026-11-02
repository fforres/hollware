import type {
  describeSite,
  getEntry,
  getTranslations,
  HollwareConfig,
  listEntries,
  Navigation,
  OperationByName,
  OperationName,
  search,
  listRedirects,
} from '@hollware/core'
import type { WorkerEntrypoint } from 'cloudflare:workers'
import type * as z from 'zod'
import { createHollwareWith } from './compose.ts'
import type { EventDelivery, EventQueue } from './events/run.ts'
import { handlers } from './ops/index.ts'

export const name = '@hollware/server'

export { type Handlers, type OperationContext, type OperationHandler } from './ops/types.ts'
export type { Principal } from './auth/types.ts'
export { MAX_ROW_BYTES, OPEN_WORLD_TIMEOUT_MS } from './limits.ts'
export type * from './ports.ts'
export type { EventMessage } from './events/run.ts'

/** The bindings and variables of the Worker, as its `wrangler.jsonc` declares them. */
export interface HollwareEnv {
  /** The D1 database, with the migrations of this package applied. */
  readonly DB: D1Database
  /**
   * The public URL of the Worker, such as `https://cms.example.com`. It is the only Host and
   * Origin the Worker answers; without it, every request fails.
   */
  readonly HOLLWARE_PUBLIC_URL: string
  /**
   * The key that seals the secrets Hollware makes for the structure, such as those that sign
   * webhooks: at least 32 characters, which `hollware deploy` makes when it is missing.
   */
  readonly HOLLWARE_SECRET?: string
  /**
   * The KV namespace of the OAuth server: its clients, grants and tokens, all by hash.
   * Personal tokens work without it; OAuth does not.
   */
  readonly OAUTH_KV: KVNamespace
  /**
   * A Workers Rate Limiting binding (`ratelimits` in wrangler.jsonc): with it, the routes anyone
   * may call without a token (sign-in and passkeys, OAuth's token and registration)
   * answer 429 past its limit, per address and route.
   * Without it, nothing is limited.
   */
  readonly HOLLWARE_RATE_LIMIT?: RateLimiter
  /** The static assets of the Worker, which hold the admin at `/admin/`; without them, no admin. */
  readonly ASSETS?: Fetcher
  /** The Queue of publication events; without it, the cron trigger delivers them. */
  readonly EVENTS?: EventQueue
  /**
   * Workers AI and a Vectorize index (v0.5): with both, every published entry is embedded and
   * `search` can be semantic; without either, search is full text only.
   */
  readonly AI?: Ai
  /** `wrangler types` names a Vectorize binding `VectorizeIndex`; either works. */
  readonly VECTORIZE?: Vectorize | VectorizeIndex
  /** The embedding model of Workers AI, `@cf/baai/bge-m3` when not set; its index must match it. */
  readonly HOLLWARE_EMBEDDING_MODEL?: string
  /**
   * The images of the sites: the R2 bucket that keeps them and, optionally, the Images
   * binding that converts each once when it arrives. Without the bucket, upload_asset answers
   * unavailable; without the binding, every file is kept as it came.
   */
  readonly MEDIA?: R2Bucket
  readonly IMAGES?: ImagesBinding
  /** The R2 bucket of the daily backups, apart from the images; without it, they go to MEDIA. */
  readonly BACKUPS?: R2Bucket
  /**
   * The agents of @hollware/agents (v0.6), over a service binding to their named entrypoint: the
   * cron trigger of Hollware wakes them every ten minutes, so they need no cron trigger of their
   * own (the free plan has five for the account). `wrangler types` writes it as a plain
   * `Service`, as it cannot see the agents' entrypoint, so any binding goes in: one without `run`
   * is not called.
   */
  readonly AGENTS?: object
  /**
   * A `send_email` binding of Cloudflare Email Service: with it and `HOLLWARE_EMAIL_FROM`, an
   * invitation that names an address is mailed to it, and its link is shown to nobody else.
   */
  readonly EMAIL?: SendEmail
  /** The sender of the invitations, an address of a domain onboarded to Email Service. */
  readonly HOLLWARE_EMAIL_FROM?: string
}

type Output<Spec extends { output: z.ZodType }> = z.output<Spec['output']>

/**
 * The read-only RPC surface that sites of the same account call over a service binding. It
 * returns published content only; nothing in it writes.
 */
export interface HollwareRpc {
  getEntry(
    site: string,
    collection: string,
    slug: string,
    locale: string,
    options?: {
      readonly formats?: readonly ('markdown' | 'document' | 'html')[]
      /** Also the published entries closest by meaning. */
      readonly related?: boolean
      /** Also the published entries the reference rules of the collection name, by field. */
      readonly references?: boolean
      /**
       * A preview token (`hw_prv_…`, made in the admin): the entry it names is read in its latest
       * revision, a draft included. A token that does not hold (expired, of another site or
       * entry, forged) is an `invalid_preview` error, never the published version in its place.
       */
      readonly preview?: string
    },
  ): Promise<Output<typeof getEntry>>
  listEntries(
    site: string,
    collection: string,
    options?: {
      readonly locale?: string
      readonly tag?: string
      readonly limit?: number
      readonly cursor?: string
    },
  ): Promise<Output<typeof listEntries>>
  getTranslations(
    site: string,
    collection: string,
    translationGroup: string,
  ): Promise<Output<typeof getTranslations>>
  /**
   * The published entries of a collection in a locale (the site's default when absent), grouped
   * and ordered as the collection's navigation says, for a sidebar: at most 1,000 of them.
   */
  getNavigation(
    site: string,
    collection: string,
    options?: { readonly locale?: string },
  ): Promise<Navigation>
  describeSite(site: string): Promise<Output<typeof describeSite>>
  /** The published entries that match `query`, best first: by its words, by meaning, or both. */
  search(
    site: string,
    query: string,
    options?: {
      readonly collection?: string
      readonly locale?: string
      readonly limit?: number
      readonly mode?: 'fulltext' | 'semantic' | 'hybrid'
      /** Also the section each result matched, with its heading and the URL of the entry. */
      readonly passages?: boolean
      /** The least score a match by meaning must reach, 0 to 1. */
      readonly minScore?: number
    },
  ): Promise<Output<typeof search>>
  /** The old paths of entries that moved, and where each goes now: what a site answers with a 301. */
  listRedirects(
    site: string,
    options?: {
      readonly collection?: string
      readonly locale?: string
      readonly limit?: number
      readonly cursor?: string
    },
  ): Promise<Output<typeof listRedirects>>
}

/**
 * What another Worker of the same account calls over a service binding to the `HollwareOps`
 * entrypoint: any operation, or MCP over `fetch`, always as the personal token it passes.
 */
export interface HollwareOpsRpc {
  /**
   * Runs one operation as the personal token (`hw_pat_…`) or the agent grant (`hw_agt_…`) of
   * `options`, on its site. A read token, or a token that is unknown, expired or revoked, is an
   * `unauthorized` error.
   */
  ops<Name extends OperationName>(
    name: Name,
    input: z.input<OperationByName<Name>['input']>,
    options: { readonly token: string },
  ): Promise<z.output<OperationByName<Name>['output']>>
  /** MCP, as the token of `Authorization: Bearer`, with no check of Host or Origin. */
  fetch(request: Request): Promise<Response>
}

/**
 * What `createHollware(config)` returns. The user's Worker is
 * `export default { fetch }` and `export class Hollware extends hollware.Hollware {}`.
 */
export interface HollwareWorker {
  /** MCP at `/mcp`, and the other routes of the gateway. */
  readonly fetch: (request: Request, env: HollwareEnv, ctx: ExecutionContext) => Promise<Response>
  /**
   * The consumer of the events Queue and of its dead-letter queue (`queues.consumers` in
   * wrangler.jsonc). The events of a queue whose name ends in `-dlq` were given up on: the admin
   * lists them under Webhooks, to send again.
   */
  readonly queue: (
    batch: { readonly queue?: string; readonly messages: readonly EventDelivery[] },
    env: HollwareEnv,
    ctx: ExecutionContext,
  ) => Promise<void>
  /** The cron trigger of the project (`triggers.crons` in wrangler.jsonc, every minute). */
  readonly scheduled: (
    controller: ScheduledController,
    env: HollwareEnv,
    ctx: ExecutionContext,
  ) => Promise<void>
  /** The RPC entrypoint, for the user's Worker to export under the name `Hollware`. */
  readonly Hollware: new (
    ctx: ExecutionContext,
    env: HollwareEnv,
  ) => WorkerEntrypoint<HollwareEnv> & HollwareRpc
  /**
   * The entrypoint of operations and MCP over a service binding, for the user's Worker to export
   * under the name `HollwareOps`.
   */
  readonly HollwareOps: new (
    ctx: ExecutionContext,
    env: HollwareEnv,
  ) => WorkerEntrypoint<HollwareEnv> & HollwareOpsRpc
}

/**
 * Builds the Worker. The sites live in D1; a config of 0.x, when given, is moved there
 * on the first request, for the sites that have no definition yet, and never read again.
 */
export type CreateHollware = (config?: HollwareConfig) => HollwareWorker

/**
 * Builds the Worker from the config: `const hollware = createHollware(config)`, then
 * `export default { fetch: hollware.fetch }` and `export class Hollware extends hollware.Hollware {}`.
 * The config is resolved once, here; a broken one throws its `ConfigError`.
 */
export const createHollware: CreateHollware = (config) => createHollwareWith(config, handlers)

/** What a Workers Rate Limiting binding answers: whether one more request for `key` fits. */
export interface RateLimiter {
  limit(options: { readonly key: string }): Promise<{ readonly success: boolean }>
}
