import { mediaOfEnv } from './media/cloudflare.ts'
import { abortExpiredUploads } from './ops/uploads.ts'
import {
  definitionsFromConfig,
  resolveAdmin,
  resolveAuth,
  resolveConfig,
  type HollwareConfig,
  type ResolvedSite,
} from '@hollware/core'
import manifest from '../package.json' with { type: 'json' }
import { createGateway } from './http/index.ts'
import type { HollwareEnv, HollwareWorker } from './index.ts'
import type { McpEndpoint } from './mcp/types.ts'
import type { Handlers } from './ops/types.ts'
import type { Actor, Clock } from './ports.ts'
import { connect } from './db/d1.ts'
import { createD1Store } from './db/index.ts'
import { dropExpired } from './identity/store.ts'
import { createAuditLog, dropExpiredLines, systemActor, type AuditActor } from './audit/log.ts'
import type { DeliveryDeps } from './events/deliver.ts'
import { failAgentRuns } from './events/agents.ts'
import { abandonEvents, consumeEvents, isDeadLetters, sweepOutbox } from './events/run.ts'
import { createEntrypoint, createOpsEntrypoint, createRpc } from './rpc/index.ts'
import { backupBucketOf, backUpSite } from './backup/run.ts'
import { reparseRevisions } from './derived/reparse.ts'
import { scopesNow } from './schedule/standing.ts'
import { runDueSchedules, runDueUnpublishes } from './schedule/run.ts'
import { semanticOfEnv } from './semantic/cloudflare.ts'
import { healVectors, refreshRelated } from './semantic/index-entry.ts'
import { createSiteRegistry } from './structure/registry.ts'
import { openSealed } from './structure/seal.ts'
import { createSecretStore } from './structure/store.ts'

export interface ComposeOptions {
  readonly clock?: Clock
}

const systemClock: Clock = { now: () => new Date() }

export const AGENTS_EVERY_MINUTES = 10

export function wakesAgents(time: number): boolean {
  return Math.floor(time / 60_000) % AGENTS_EVERY_MINUTES === 0
}

const SERVER_INFO = { name: 'hollware', title: 'Hollware', version: manifest.version }

function writeLog(entry: object): void {
  console.log(JSON.stringify(entry))
}

export function createHollwareWith(
  config: HollwareConfig | undefined,
  handlers: Handlers,
  options: ComposeOptions = {},
): HollwareWorker {
  const clock = options.clock ?? systemClock
  const moving = config?.sites !== undefined
  if (moving) resolveConfig(config)
  const admin = resolveAdmin(config?.admin)
  const auth = resolveAuth(config?.auth)
  const registry = createSiteRegistry({
    ...(moving ? { seed: definitionsFromConfig(config) } : {}),
    now: () => clock.now(),
    log: writeLog,
  })
  const { sites } = registry
  const refresh = (db: D1Database, options?: { readonly force?: boolean }) =>
    registry.refresh(db, options)
  let endpoint: Promise<McpEndpoint> | undefined
  const mcp: McpEndpoint = {
    async fetch(request, call) {
      endpoint ??= import('./mcp/endpoint.ts').then(({ createMcpEndpoint }) =>
        createMcpEndpoint({ handlers, serverInfo: SERVER_INFO, log: writeLog }),
      )
      return (await endpoint).fetch(request, call)
    },
  }
  const sealedSecret = async (
    env: HollwareEnv,
    site: ResolvedSite,
    name: string,
  ): Promise<string | undefined> => {
    const master = env.HOLLWARE_SECRET
    if (master === undefined) return undefined
    const secrets = createSecretStore(env.DB, () => clock.now())
    const sealed = await secrets.read(site.key, name)
    if (sealed === null) return undefined
    const value = await openSealed(master, sealed, { site: site.key, name }, (resealed) =>
      secrets.write(site.key, name, resealed),
    )
    return value ?? undefined
  }
  const deliveryDeps = (env: HollwareEnv, site: ResolvedSite): DeliveryDeps => ({
    db: connect(env.DB),
    site,
    clock,
    fetch: (request) => fetch(request),
    secret: (name) => {
      const value: unknown = Reflect.get(env, name)
      return typeof value === 'string' ? value : undefined
    },
    semantic: semanticOfEnv(env),
    ownSecret: (webhook) => sealedSecret(env, site, `webhook:${webhook}`),
    sealed: (name) => sealedSecret(env, site, name),
    publicUrl: env.HOLLWARE_PUBLIC_URL,
    binding: (name) => Reflect.get(env, name),
  })
  return {
    fetch: createGateway({
      sites,
      siteKeys: registry.keys,
      refresh,
      mcp,
      clock,
      log: writeLog,
      read: (env) => createRpc({ sites, handlers, clock, log: writeLog }, env),
      auth,
      admin,
      handlers,
    }),
    scheduled: async (controller, env, ctx) => {
      const each = async (site: ResolvedSite) => {
        const due = {
          site,
          store: createD1Store(env.DB, { clock }),
          handlers,
          clock,
          log: writeLog,
          scopesOf: (actor: Actor) =>
            scopesNow({ db: env.DB, kv: env.OAUTH_KV }, actor, site.key, clock.now()),
          audit: (actor: AuditActor, requestId: string) =>
            createAuditLog({
              db: env.DB,
              actor,
              requestId,
              address: null,
              master: env.HOLLWARE_SECRET,
              now: () => clock.now(),
              log: writeLog,
            }),
        }
        await runDueSchedules(due)
        await runDueUnpublishes(due)
        await dropExpiredLines(env.DB, site, clock.now())
        const media = mediaOfEnv(env)
        if (media !== null) await abortExpiredUploads(media, site.key, clock.now())
        const backups = backupBucketOf(env)
        if (backups !== undefined) {
          const backup = await backUpSite(env.DB, backups, site, clock.now())
          if (backup === 'made') writeLog({ kind: 'backup', site: site.key, outcome: backup })
        }
        await reparseRevisions(env.DB, site, clock.now().toISOString(), writeLog)
        await sweepOutbox({ queue: env.EVENTS, deps: deliveryDeps(env, site) })
        const semantic = semanticOfEnv(env)
        if (semantic !== null) {
          const now = clock.now().toISOString()
          await healVectors(connect(env.DB), semantic, { site: site.key, now })
          await refreshRelated(connect(env.DB), semantic, { site: site.key, now })
        }
      }
      const agents: unknown = env.AGENTS
      const run: unknown =
        typeof agents === 'object' && agents !== null ? Reflect.get(agents, 'run') : undefined
      if (typeof run === 'function' && wakesAgents(controller.scheduledTime)) {
        ctx.waitUntil(
          Promise.resolve(Reflect.apply(run, agents, [])).catch((error: unknown) => {
            writeLog({ kind: 'agents_failed', message: String(error) })
          }),
        )
      }
      ctx.waitUntil(
        (async () => {
          await dropExpired(connect(env.DB), clock.now()).catch((error: unknown) => {
            writeLog({ kind: 'cron_failed', site: null, message: String(error) })
          })
          await refresh(env.DB)
          for (const site of sites.values()) {
            await each(site).catch((error: unknown) => {
              writeLog({ kind: 'cron_failed', site: site.key, message: String(error) })
            })
          }
        })(),
      )
    },
    queue: async (batch, env) => {
      await refresh(env.DB)
      const depsOf = (key: string) => {
        const site = sites.get(key)
        return site === undefined ? undefined : deliveryDeps(env, site)
      }
      if (!isDeadLetters(batch.queue)) {
        await consumeEvents(batch.messages, depsOf)
        return
      }
      await abandonEvents(batch.messages, depsOf, async (site, event) => {
        const requestId = `queue_${crypto.randomUUID()}`
        writeLog({ kind: 'event_abandoned', requestId, site: site.key, event })
        if (site.agents.length > 0) {
          await failAgentRuns(connect(env.DB), clock, site.key, event)
        }
        await createAuditLog({
          db: env.DB,
          actor: systemActor(null),
          requestId,
          address: null,
          master: env.HOLLWARE_SECRET,
          now: () => clock.now(),
          log: writeLog,
        }).write(site, {
          action: 'event.abandon',
          outcome: 'failed',
          target: { type: 'event', id: event },
        })
      })
    },
    Hollware: createEntrypoint({ sites, refresh, handlers, clock, log: writeLog }),
    HollwareOps: createOpsEntrypoint({
      sites,
      siteKeys: registry.keys,
      refresh,
      handlers,
      mcp,
      clock,
      log: writeLog,
    }),
  }
}
