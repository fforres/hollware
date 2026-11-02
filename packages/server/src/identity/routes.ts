import {
  HollwareError,
  type ResolvedAuth,
  type ResolvedProvider,
  type ResolvedSite,
} from '@hollware/core'
import type { Context, Hono } from 'hono'
import { getCookie } from 'hono/cookie'
import { connect } from '../db/d1.ts'
import type { FederationRefusedLog, GatewayEnv } from '../http/types.ts'
import type { Clock } from '../ports.ts'
import type { Ceremony } from './ceremonies.ts'
import type { Claims, Federation } from './federation.ts'
import type { Fetcher } from './jwt.ts'
import {
  federateLink,
  messagePage,
  pageHeaders,
  plainPageHeaders,
  sameOriginTarget,
  setupPage,
  signInPage,
} from './pages.ts'
import { endSession } from './store.ts'
import {
  personActor,
  type AuditActor,
  type AuditLine,
  type AuditLog,
  type AuditSite,
} from '../audit/log.ts'
import { writeForPerson } from '../audit/person.ts'

const ceremonies = () => import('./ceremonies.ts')
const federation = () => import('./federation.ts')

const FEDERATE_COOKIE = 'hollware_federate'

const ACCESS_HEADER = 'cf-access-jwt-assertion'

export const SESSION_COOKIE = 'hollware_session'

export const SIGN_OUT_PATH = '/authorize/signout'

function sessionCookie(secret: string): string {
  return `${SESSION_COOKIE}=${secret}; HttpOnly; Secure; SameSite=Lax; Path=/authorize; Max-Age=43200`
}

function federationCookie(binding: string): string {
  return `${FEDERATE_COOKIE}=${binding}; HttpOnly; Secure; SameSite=Lax; Path=/auth/federate; Max-Age=300`
}

const ENDED_FEDERATION = `${FEDERATE_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/auth/federate; Max-Age=0`

const ENDED_COOKIE = `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/authorize; Max-Age=0`

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export interface IdentityOptions {
  readonly clock: Clock
  readonly auth: ResolvedAuth
  readonly sites: (c: Context<GatewayEnv>) => Promise<ReadonlyMap<string, ResolvedSite>>
  readonly fetch?: Fetcher
  readonly log?: (entry: FederationRefusedLog) => void
  readonly site: (c: Context<GatewayEnv>, key: string) => Promise<AuditSite | undefined>
  readonly audit: (c: Context<GatewayEnv>, actor: AuditActor) => AuditLog
}

export function installIdentity(app: Hono<GatewayEnv>, options: IdentityOptions): void {
  const audited = (c: Context<GatewayEnv>, userId: string, line: AuditLine) =>
    writeForPerson(
      c.env.DB,
      options.audit(c, personActor(userId)),
      (key) => options.site(c, key),
      userId,
      line,
    )

  const ceremony = (c: Context<GatewayEnv>): Ceremony => ({
    db: connect(c.env.DB),
    publicUrl: c.env.HOLLWARE_PUBLIC_URL,
    now: options.clock.now(),
  })
  const body = async (c: Context<GatewayEnv>): Promise<Record<string, unknown>> => {
    const value: unknown = await c.req.json().catch(() => null)
    if (!isRecord(value)) {
      throw new HollwareError(
        'invalid_input',
        'The body is not a JSON object.',
        'Send a JSON object.',
      )
    }
    return value
  }
  const text = (value: unknown) => (typeof value === 'string' ? value : '')
  const handle =
    (step: (c: Context<GatewayEnv>) => Promise<Response>) => async (c: Context<GatewayEnv>) => {
      try {
        return await step(c)
      } catch (error) {
        if (!(error instanceof HollwareError)) throw error
        return c.json({ code: error.code, message: error.message, fix: error.fix }, 400)
      }
    }

  const page = (title: string, message: string, status: number, cookie?: string) => {
    const headers = new Headers(plainPageHeaders())
    if (cookie !== undefined) headers.append('set-cookie', cookie)
    return new Response(messagePage(title, message), { status, headers })
  }
  const providerOf = (id: string) => options.auth.providers.find((p) => p.id === id)
  const access = options.auth.providers.find(
    (p): p is Extract<ResolvedProvider, { kind: 'cloudflare-access' }> =>
      p.kind === 'cloudflare-access',
  )
  const federationOf = (c: Context<GatewayEnv>): Federation => ({
    db: connect(c.env.DB),
    publicUrl: c.env.HOLLWARE_PUBLIC_URL,
    now: options.clock.now(),
    fetch: options.fetch ?? ((request) => fetch(request)),
    secret: (name) => {
      const value: unknown = Reflect.get(c.env, name)
      return typeof value === 'string' ? value : undefined
    },
  })
  const refusedSignIn = (c: Context<GatewayEnv>, provider: string, error: unknown) => {
    options.log?.({
      kind: 'federation_refused',
      requestId: c.get('requestId'),
      provider,
      reason: error instanceof Error ? error.message : String(error),
    })
    return page(
      'This sign-in did not work',
      'The provider did not confirm who you are. Start again from the sign-in page.',
      400,
      ENDED_FEDERATION,
    )
  }
  const signedIn = async (c: Context<GatewayEnv>, claims: Claims, returnTo: string | null) => {
    const flow = await federation()
    const db = connect(c.env.DB)
    const now = options.clock.now()
    const userId = await flow.resolvePerson(db, claims, await options.sites(c), now)
    if (userId === null) {
      return page(
        'No access',
        'This account is not one of this Hollware, and no site lets it in. Ask an owner for an invitation to the address of your account.',
        403,
        ENDED_FEDERATION,
      )
    }
    const secret = await flow.sessionFor(db, userId, now)
    await audited(c, userId, {
      action: 'session.sign_in',
      outcome: 'ok',
      target: { type: 'user', id: userId },
      detail: { provider: claims.provider },
    })
    const origin = new URL(c.env.HOLLWARE_PUBLIC_URL).origin
    const headers = new Headers({
      location: sameOriginTarget(returnTo, origin),
      'cache-control': 'no-store',
    })
    headers.append('set-cookie', sessionCookie(secret))
    headers.append('set-cookie', ENDED_FEDERATION)
    return new Response(null, { status: 302, headers })
  }
  const throughAccess = async (c: Context<GatewayEnv>, returnTo: string | null) => {
    const assertion = c.req.header(ACCESS_HEADER)
    if (access === undefined || assertion === undefined) return null
    const flow = await federation()
    try {
      const claims = await flow.accessClaims(federationOf(c), access, assertion)
      return await signedIn(c, claims, returnTo)
    } catch (error) {
      if (!flow.isRefusal(error)) throw error
      return refusedSignIn(c, access.id, error)
    }
  }

  const html = (render: (nonce: string) => string) => () => {
    const nonce = crypto.randomUUID().replace(/-/g, '')
    return new Response(render(nonce), { headers: pageHeaders(nonce) })
  }
  app.get('/setup', () =>
    options.auth.passkeys
      ? html(setupPage)()
      : page(
          'Sign in with your account',
          'This Hollware signs people in through their accounts, not passkeys. Open /signin and continue with the account of the address your invitation names.',
          200,
        ),
  )
  app.get('/signin', async (c) => {
    const returnTo = c.req.query('return_to') ?? null
    const through = await throughAccess(c, returnTo)
    if (through !== null) return through
    const providers = options.auth.providers.map((p) => ({ id: p.id, name: p.name }))
    const [only] = providers
    if (!options.auth.passkeys && providers.length === 1 && only !== undefined) {
      return c.redirect(federateLink(only.id, returnTo), 302)
    }
    return html((nonce) =>
      signInPage(nonce, { providers, passkeys: options.auth.passkeys, returnTo }),
    )()
  })

  app.get('/auth/federate/:provider', async (c) => {
    const provider = providerOf(c.req.param('provider'))
    const returnTo = c.req.query('return_to') ?? null
    if (provider === undefined) {
      return page('No such provider', 'This Hollware signs nobody in that way.', 404)
    }
    if (provider.kind === 'cloudflare-access') {
      return (
        (await throughAccess(c, returnTo)) ??
        page(
          'Cloudflare Access sent nobody',
          'Open this Hollware through its Cloudflare Access application, then sign in again.',
          401,
        )
      )
    }
    const flow = await federation()
    try {
      const started = await flow.startFederation(federationOf(c), provider, returnTo)
      const headers = new Headers({ location: started.location, 'cache-control': 'no-store' })
      headers.append('set-cookie', federationCookie(started.binding))
      return new Response(null, { status: 302, headers })
    } catch (error) {
      if (!flow.isRefusal(error)) throw error
      return refusedSignIn(c, provider.id, error)
    }
  })

  app.get('/auth/federate/:provider/callback', async (c) => {
    const provider = providerOf(c.req.param('provider'))
    if (provider === undefined || provider.kind === 'cloudflare-access') {
      return page('No such provider', 'This Hollware signs nobody in that way.', 404)
    }
    const state = c.req.query('state')
    if (state === undefined || state === '') {
      return page(
        'This sign-in did not work',
        'The answer of the provider names no sign-in. Start again from the sign-in page.',
        400,
        ENDED_FEDERATION,
      )
    }
    const flow = await federation()
    try {
      const finished = await flow.finishFederation(federationOf(c), provider, {
        state,
        code: c.req.query('error') === undefined ? (c.req.query('code') ?? null) : null,
        binding: getCookie(c, FEDERATE_COOKIE) ?? null,
      })
      return await signedIn(c, finished.claims, finished.returnTo)
    } catch (error) {
      if (!flow.isRefusal(error)) throw error
      return refusedSignIn(c, provider.id, error)
    }
  })

  const passkeysOff = () =>
    Response.json(
      {
        code: 'forbidden',
        message: 'This Hollware does not sign people in with passkeys.',
        fix: 'Sign in with your account at /signin.',
      },
      { status: 403, headers: { 'cache-control': 'no-store' } },
    )
  app.use('/auth/register/*', async (_c, next) => (options.auth.passkeys ? next() : passkeysOff()))
  app.use('/auth/signin/*', async (_c, next) => (options.auth.passkeys ? next() : passkeysOff()))
  app.use('/auth/accept/*', async (_c, next) => (options.auth.passkeys ? next() : passkeysOff()))

  app.post(
    '/auth/register/options',
    handle(async (c) =>
      c.json(
        await (
          await ceremonies()
        ).registrationOptions(ceremony(c), text((await body(c))['invitation'])),
      ),
    ),
  )
  app.post(
    '/auth/register/verify',
    handle(async (c) => {
      const input = await body(c)
      const response = input['response']
      if (!isRecord(response)) {
        throw new HollwareError(
          'invalid_input',
          'The body has no passkey.',
          'Send the credential as JSON.',
        )
      }
      const answer = await (
        await ceremonies()
      ).verifyRegistration(ceremony(c), {
        challengeId: text(input['challengeId']),
        response: JSON.parse(JSON.stringify(response)),
        name: text(input['name']),
        label: text(input['label']),
      })
      await audited(c, answer.userId, {
        action: 'invitation.accept',
        outcome: 'ok',
        target: { type: 'user', id: answer.userId },
      })
      return c.json({ ok: true }, 200, { 'set-cookie': sessionCookie(answer.session) })
    }),
  )
  app.post(
    '/auth/accept/options',
    handle(async (c) =>
      c.json(
        await (
          await ceremonies()
        ).acceptanceOptions(ceremony(c), text((await body(c))['invitation'])),
      ),
    ),
  )
  app.post(
    '/auth/accept/verify',
    handle(async (c) => {
      const input = await body(c)
      const response = input['response']
      if (!isRecord(response)) {
        throw new HollwareError(
          'invalid_input',
          'The body has no passkey.',
          'Send the credential as JSON.',
        )
      }
      const answer = await (
        await ceremonies()
      ).verifyAcceptance(ceremony(c), {
        challengeId: text(input['challengeId']),
        response: JSON.parse(JSON.stringify(response)),
      })
      const site = await options.site(c, answer.site)
      if (site !== undefined) {
        await options.audit(c, personActor(answer.userId)).write(site, {
          action: 'invitation.accept',
          outcome: 'ok',
          target: { type: 'user', id: answer.userId },
        })
      }
      return c.json({ ok: true }, 200, { 'set-cookie': sessionCookie(answer.session) })
    }),
  )
  app.post(
    '/auth/signin/options',
    handle(async (c) => c.json(await (await ceremonies()).authenticationOptions(ceremony(c)))),
  )
  app.post(
    '/auth/signin/verify',
    handle(async (c) => {
      const input = await body(c)
      const response = input['response']
      if (!isRecord(response)) {
        throw new HollwareError(
          'invalid_input',
          'The body has no passkey.',
          'Send the credential as JSON.',
        )
      }
      const answer = await (
        await ceremonies()
      ).verifyAuthentication(ceremony(c), {
        challengeId: text(input['challengeId']),
        response: JSON.parse(JSON.stringify(response)),
      })
      await audited(c, answer.userId, {
        action: 'session.sign_in',
        outcome: 'ok',
        target: { type: 'user', id: answer.userId },
      })
      return c.json({ ok: true }, 200, { 'set-cookie': sessionCookie(answer.session) })
    }),
  )

  app.post(SIGN_OUT_PATH, async (c) => {
    const secret = getCookie(c, SESSION_COOKIE)
    const userId = secret === undefined ? null : await endSession(connect(c.env.DB), secret)
    if (userId !== null) {
      await audited(c, userId, {
        action: 'session.sign_out',
        outcome: 'ok',
        target: { type: 'user', id: userId },
      })
    }
    return c.json({ ok: true }, 200, { 'set-cookie': ENDED_COOKIE, 'cache-control': 'no-store' })
  })
}
