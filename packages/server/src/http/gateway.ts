import { backupBucketOf, backupKey } from '../backup/run.ts'
import { isSiteKey, type ResolvedAdmin, type ResolvedAuth, type ResolvedSite } from '@hollware/core'
import { insufficientScope } from '../auth/index.ts'
import { missingScopes } from '../auth/scopes.ts'
import { originalKey, servedKey, variantKey } from '../ops/assets.ts'
import { Hono, type Context } from 'hono'
import { checkHostAndOrigin, unauthorized } from '../auth/index.ts'
import type { HollwareEnv, HollwareRpc } from '../index.ts'
import type { AuditLogFor, McpEndpoint } from '../mcp/index.ts'
import { actorOf, createAuditLog, systemActor, type AuditActor } from '../audit/log.ts'
import {
  recordRotation,
  refreshTokenOf,
  reusedAnswer,
  spentRefresh,
} from '../oauth/refresh-reuse.ts'
import type { RequestPrincipal } from '../auth/types.ts'
import type { Clock } from '../ports.ts'
import { installErrorHandling } from './errors.ts'
import { installAdmin } from './admin.ts'
import { installAdminApi } from './admin-api.ts'
import { installOpsApi } from './ops-api.ts'
import { operationContext, type OperationContextDeps } from './operation-context.ts'
import { installReadApi } from './read-api.ts'
import type { Handlers } from '../ops/types.ts'
import { installIdentity } from '../identity/routes.ts'
import { installAuthorize } from '../oauth/authorize.ts'
import { adminClient } from '../oauth/admin.ts'
import { createOAuth, type Proceed, type Refusal, type ResourceName } from '../oauth/server.ts'
import type { GatewayEnv, GatewayLogEntry } from './types.ts'
import { mediaOfEnv } from '../media/cloudflare.ts'

export interface GatewayOptions {
  readonly sites: ReadonlyMap<string, ResolvedSite>
  readonly siteKeys?: ReadonlySet<string>
  readonly refresh?: (db: D1Database, options?: { readonly force?: boolean }) => Promise<void>
  readonly mcp: McpEndpoint
  readonly clock: Clock
  readonly log: (entry: GatewayLogEntry) => void
  readonly read?: (env: HollwareEnv) => HollwareRpc
  readonly auth?: ResolvedAuth
  readonly admin?: ResolvedAdmin
  readonly handlers?: Handlers
}

function withRefusalBody(response: Response, refused: boolean): Response {
  const ours = unauthorized(refused ? 'unknown' : undefined)
  const headers = new Headers(response.headers)
  headers.set('content-type', 'application/json')
  const challenge = headers.get('www-authenticate')
  if (challenge !== null)
    headers.set('www-authenticate', challenge.replace('realm="OAuth"', 'realm="hollware"'))
  return new Response(ours.body, { status: 401, headers })
}

export type Gateway = (
  request: Request,
  env: HollwareEnv,
  ctx: ExecutionContext,
) => Promise<Response>

export function createGateway(options: GatewayOptions): Gateway {
  const { sites, mcp, clock, log } = options
  const siteKeys: ReadonlySet<string> = options.siteKeys ?? new Set(sites.keys())
  const app = new Hono<GatewayEnv>()
  const contexts = new WeakMap<Request, ExecutionContext>()
  const workerContext = (c: Context<GatewayEnv>): ExecutionContext => {
    const ctx = contexts.get(c.req.raw)
    if (ctx === undefined) throw new Error('A request reached a route without its context')
    return ctx
  }
  const auth: ResolvedAuth = options.auth ?? NO_PROVIDERS
  const oauth = createOAuth({
    sites: siteKeys,
    clock,
    dynamicClientRegistration: auth.dynamicClientRegistration,
    adminPath: options.admin?.path ?? '/admin',
    log,
  })

  const contextDeps: OperationContextDeps = {
    clock,
    log,
    ...(options.refresh === undefined ? {} : { refresh: options.refresh }),
  }
  const contextOf = (c: Context<GatewayEnv>, site: ResolvedSite, requestId: string) =>
    operationContext(contextDeps, c.env, c.executionCtx, site, requestId)

  const auditOf =
    (
      c: Context<GatewayEnv>,
      principal: RequestPrincipal,
      adminClientId: string | null,
    ): AuditLogFor =>
    (meta) =>
      auditAs(c, actorOf(principal, meta, adminClientId))

  const protect = async (
    c: Context<GatewayEnv>,
    resource: ResourceName,
    proceed: Proceed,
  ): Promise<Response> => {
    const requestId = c.get('requestId')
    if (c.req.header('authorization') !== undefined) await options.refresh?.(c.env.DB)
    const outcome: { refusal: Refusal | null; failure: { readonly error: unknown } | null } = {
      refusal: null,
      failure: null,
    }
    const response = await oauth(c.env.HOLLWARE_PUBLIC_URL).protect(
      resource,
      c.req.raw,
      c.env,
      workerContext(c),
      {
        proceed,
        refused: (reason) => {
          outcome.refusal = reason
        },
        defer: (promise) => {
          workerContext(c).waitUntil(promise)
        },
        failed: (error) => {
          outcome.failure = { error }
        },
      },
    )
    if (outcome.failure !== null) throw outcome.failure.error
    if (response.status !== 401) return response
    log({ kind: 'auth_refused', requestId, reason: outcome.refusal ?? 'no_token' })
    return withRefusalBody(response, outcome.refusal !== null)
  }

  const isCorsRead = (request: Request): boolean => {
    const { pathname } = new URL(request.url)
    return (
      ['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
      pathname.startsWith('/v1/') &&
      !pathname.startsWith('/v1/admin/')
    )
  }

  const anyCorsOrigin = (origin: string): boolean =>
    [...sites.values()].some((site) => site.cors.origins.includes(origin))
  const readsFromAnyCorsOrigin = (request: Request, origin: string): boolean => {
    return anyCorsOrigin(origin) && isCorsRead(request)
  }

  const protectWrites = (
    c: Context<GatewayEnv>,
    resource: ResourceName,
    proceed: Proceed,
  ): Promise<Response> =>
    protect(c, resource, async (principal, auth) =>
      principal.kind === 'read'
        ? Response.json(
            {
              code: 'forbidden',
              message: 'A read token reads published content over GET /v1, and nothing else.',
              fix: 'Use a personal token (hw_pat_) or sign in with OAuth for this.',
            },
            { status: 403, headers: { 'cache-control': 'no-store' } },
          )
        : proceed(principal, auth),
    )

  app.use('*', async (c, next) => {
    c.set('requestId', crypto.randomUUID())
    await next()
    const https = c.env.HOLLWARE_PUBLIC_URL?.startsWith('https://') === true
    const missing =
      !c.res.headers.has('x-content-type-options') ||
      !c.res.headers.has('x-robots-tag') ||
      (https && !c.res.headers.has('strict-transport-security'))
    if (!missing) return
    const headers = new Headers(c.res.headers)
    if (!headers.has('x-content-type-options')) headers.set('x-content-type-options', 'nosniff')
    if (!headers.has('x-robots-tag')) headers.set('x-robots-tag', 'noindex, nofollow')
    if (https && !headers.has('strict-transport-security')) {
      headers.set('strict-transport-security', 'max-age=31536000')
    }
    c.res = new Response(c.res.body, {
      status: c.res.status,
      statusText: c.res.statusText,
      headers,
    })
  })

  app.use('*', async (c, next) => {
    const origin = c.req.header('origin')
    if (
      origin !== undefined &&
      (isCorsRead(c.req.raw) || readsFromAnyCorsOrigin(c.req.raw, origin))
    ) {
      await options.refresh?.(c.env.DB)
    }
    const refusal = checkHostAndOrigin(c.req.raw, c.env.HOLLWARE_PUBLIC_URL, readsFromAnyCorsOrigin)
    if (refusal !== null) return refusal
    await next()
  })

  app.use('*', async (c, next) => {
    const limiter = c.env.HOLLWARE_RATE_LIMIT
    const group = limitedRoute(c.req.method, new URL(c.req.url).pathname)
    if (limiter === undefined || group === null) return next()
    const address = c.req.header('cf-connecting-ip') ?? 'unknown'
    const { success } = await limiter.limit({ key: `${group}:${address}` })
    if (success) return next()
    log({ kind: 'rate_limited', requestId: c.get('requestId'), route: group })
    return Response.json(
      {
        code: 'rate_limited',
        message: 'Too many requests from this address to this route.',
        fix: 'Wait a minute and try again.',
      },
      { status: 429, headers: { 'retry-after': '60', 'cache-control': 'no-store' } },
    )
  })

  for (const path of ['/authorize', '/oauth/*']) {
    app.use(path, async (c, next) => {
      await options.refresh?.(c.env.DB)
      await next()
    })
  }

  app.get(
    '/robots.txt',
    () =>
      new Response('User-agent: *\nDisallow: /\n', {
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'public, max-age=86400',
        },
      }),
  )

  app.get('/health', () =>
    Response.json({ ok: true }, { headers: { 'cache-control': 'no-store' } }),
  )

  app.all('/mcp', async (c) =>
    protectWrites(c, 'mcp', async (principal) => {
      const requestId = c.get('requestId')
      const site = sites.get(principal.site)
      if (site === undefined) throw new Error(`No site ${principal.site} for a checked token`)
      return await mcp.fetch(c.req.raw, {
        principal,
        requestId,
        resourceMetadataUrl: oauth(c.env.HOLLWARE_PUBLIC_URL).metadataUrls.mcp,
        context: contextOf(c, site, requestId),
        ...(principal.kind === 'read'
          ? {}
          : {
              audit: {
                log: auditOf(c, principal, null),
                defer: (work: Promise<void>) => {
                  c.executionCtx.waitUntil(work)
                },
              },
            }),
      })
    }),
  )

  for (const resource of ['mcp', 'v1'] as const) {
    app.all(`/.well-known/oauth-protected-resource/${resource}`, async (c) =>
      oauth(c.env.HOLLWARE_PUBLIC_URL).protect(resource, c.req.raw, c.env, workerContext(c), {
        proceed: () => Promise.resolve(new Response(null, { status: 404 })),
        refused: () => undefined,
        defer: () => undefined,
        failed: () => undefined,
      }),
    )
  }
  const auditAs = (c: Context<GatewayEnv>, actor: AuditActor) =>
    createAuditLog({
      db: c.env.DB,
      actor,
      requestId: c.get('requestId'),
      address: c.req.header('cf-connecting-ip') ?? null,
      master: c.env.HOLLWARE_SECRET,
      now: () => clock.now(),
      log,
    })
  const auditSite = async (c: Context<GatewayEnv>, key: string) => {
    await options.refresh?.(c.env.DB)
    return sites.get(key)
  }
  installAuthorize(app, { sites: siteKeys, clock, oauth, site: auditSite, audit: auditAs })
  const authorizationServer = (c: Context<GatewayEnv>) =>
    oauth(c.env.HOLLWARE_PUBLIC_URL).authorizationServer.fetch(c.req.raw, c.env, workerContext(c))
  app.all('/.well-known/oauth-authorization-server', authorizationServer)
  app.all('/oauth/*', async (c) => {
    const refresh = await refreshTokenOf(c.req.raw)
    if (refresh === null) return authorizationServer(c)
    const now = Math.floor(clock.now().getTime() / 1000)
    const reused = await spentRefresh(c.env.OAUTH_KV, refresh, now)
    if (reused !== null) {
      await oauth(c.env.HOLLWARE_PUBLIC_URL)
        .authorizationServer.getOAuthApi(c.env)
        .revokeGrant(reused.grantId, reused.userId)
      log({ kind: 'refresh_reused', requestId: c.get('requestId'), grantId: reused.grantId })
      const site = reused.site === null ? undefined : await auditSite(c, reused.site)
      if (site !== undefined) {
        await auditAs(c, systemActor(reused.userId)).write(site, {
          action: 'app.refresh_reused',
          outcome: 'denied',
          errorCode: 'invalid_grant',
          target: { type: 'grant', id: reused.grantId },
        })
      }
      return reusedAnswer()
    }
    const response = await authorizationServer(c)
    if (response.ok) await recordRotation(c.env.OAUTH_KV, refresh.grantId, now)
    return response
  })

  installIdentity(app, {
    clock,
    auth,
    site: auditSite,
    audit: auditAs,
    log,
    sites: async (c) => {
      await options.refresh?.(c.env.DB)
      return sites
    },
  })
  installAdmin(app, {
    oauth,
    favicon: options.admin?.favicon ?? null,
    path: options.admin?.path ?? '/admin',
  })

  installAdminApi(app, {
    auth,
    sites: siteKeys,
    site: (key) => sites.get(key),
    audit: async (c, principal) =>
      auditOf(c, principal, (await adminClient(oauth(c.env.HOLLWARE_PUBLIC_URL), c.env)).clientId),
    clock,
    oauth,
    protect: (c, proceed) => protectWrites(c, 'v1', proceed),
    metadataUrl: (c) => oauth(c.env.HOLLWARE_PUBLIC_URL).metadataUrls.v1,
    log: options.log,
  })

  if (options.handlers !== undefined) {
    installOpsApi(app, {
      sites,
      handlers: options.handlers,
      log,
      protect: (c, proceed) => protectWrites(c, 'v1', proceed),
      metadataUrl: (c) => oauth(c.env.HOLLWARE_PUBLIC_URL).metadataUrls.v1,
      context: contextOf,
      audit: async (c, principal) =>
        auditOf(
          c,
          principal,
          (await adminClient(oauth(c.env.HOLLWARE_PUBLIC_URL), c.env)).clientId,
        ),
    })
  }

  const serveAsset = async (
    c: Context<GatewayEnv>,
    keyOf: (site: string, id: string) => string | null,
  ) => {
    const { site = '', id = '' } = c.req.param()
    const media = mediaOfEnv(c.env)
    const key = media === null || !isSiteKey(site) || !ASSET_ID.test(id) ? null : keyOf(site, id)
    const file = media === null || key === null ? null : await media.files.get(key)
    if (file === null) {
      return Response.json(
        {
          code: 'not_found',
          message: 'There is no image at this URL.',
          fix: 'Use the url that upload_asset or get_asset gave the image.',
        },
        { status: 404, headers: { 'cache-control': 'no-store' } },
      )
    }
    const headers = new Headers({
      'content-type': file.contentType,
      'cache-control': 'public, max-age=31536000, immutable',
      'cross-origin-resource-policy': 'cross-origin',
    })
    if (file.contentType === 'image/svg+xml') {
      headers.set(
        'content-security-policy',
        "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      )
    }
    return new Response(file.body, { headers })
  }
  app.get('/assets/:site/:id', (c) => serveAsset(c, servedKey))
  app.get('/assets/:site/:id/:width', (c) => {
    const width = c.req.param('width')
    return serveAsset(c, (site, id) =>
      /^[1-9]\d{2,3}$/.test(width) ? variantKey(site, id, Number(width)) : null,
    )
  })

  app.get('/v1/backups/:date', (c) =>
    protectWrites(c, 'v1', async (principal) => {
      if (missingScopes(principal, ['site:owner']).length > 0) {
        return insufficientScope(['site:owner'], oauth(c.env.HOLLWARE_PUBLIC_URL).metadataUrls.v1)
      }
      const date = c.req.param('date')
      const bucket = backupBucketOf(c.env)
      const object =
        bucket === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(date)
          ? null
          : await bucket.get(backupKey(principal.site, date))
      if (object === null) {
        return Response.json(
          {
            code: 'not_found',
            message: `The site has no backup of ${date}.`,
            fix: 'List the backups of the site with list_backups.',
          },
          { status: 404, headers: { 'cache-control': 'no-store' } },
        )
      }
      return new Response(object.body, {
        headers: {
          'content-type': 'application/json',
          'content-disposition': `attachment; filename="${principal.site}-${date}.json"`,
          'cache-control': 'private, no-store',
        },
      })
    }),
  )

  app.get('/v1/assets/:id/original', (c) =>
    protectWrites(c, 'v1', async (principal) => {
      if (missingScopes(principal, ['content:read']).length > 0) {
        return insufficientScope(['content:read'], oauth(c.env.HOLLWARE_PUBLIC_URL).metadataUrls.v1)
      }
      const id = c.req.param('id')
      const media = mediaOfEnv(c.env)
      const row =
        media === null || !ASSET_ID.test(id) ? null : await media.catalog.byId(principal.site, id)
      const file =
        media === null || row === null
          ? null
          : ((await media.files.get(originalKey(row.site, row.id))) ??
            (await media.files.get(servedKey(row.site, row.id))))
      if (file === null) {
        return Response.json(
          {
            code: 'not_found',
            message: `The site has no image ${id}.`,
            fix: 'List the images of the site with list_assets.',
          },
          { status: 404, headers: { 'cache-control': 'no-store' } },
        )
      }
      return new Response(file.body, {
        headers: { 'content-type': file.contentType, 'cache-control': 'private, no-store' },
      })
    }),
  )

  if (options.read !== undefined) {
    installReadApi(app, {
      read: options.read,
      corsOrigins: (site) => sites.get(site)?.cors.origins ?? [],
      anyCorsOrigin,
      protect: (c, proceed) => protect(c, 'v1', proceed),
      metadataUrl: (c) => oauth(c.env.HOLLWARE_PUBLIC_URL).metadataUrls.v1,
    })
  }

  installErrorHandling(app, log)

  return async (request, env, ctx) => {
    contexts.set(request, ctx)
    return await app.fetch(request, env, ctx)
  }
}

const ASSET_ID = /^ast_[0-9a-f]{26}$/

const NO_PROVIDERS: ResolvedAuth = {
  dynamicClientRegistration: false,
  passkeys: true,
  providers: [],
}

export function limitedRoute(method: string, pathname: string): string | null {
  if (method === 'GET' && pathname.startsWith('/auth/federate/')) return 'auth'
  if (method !== 'POST') return null
  if (pathname.startsWith('/auth/')) return 'auth'
  if (pathname === '/oauth/token' || pathname === '/oauth/register') return 'oauth'
  return null
}
