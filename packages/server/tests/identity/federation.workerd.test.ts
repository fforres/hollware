import { env } from 'cloudflare:workers'
import {
  ConfigError,
  defineCollection,
  defineConfig,
  newId,
  type ProviderDefinition,
  type SiteDefinition,
} from '@hollware/core'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import * as z from 'zod'

import { connect } from '../../src/db/d1.ts'
import { createInvitation, findSession, membershipsOf } from '../../src/identity/store.ts'
import { boot, NOW, type Booted } from '../http/support.ts'
import { signingKey, type SigningKey } from './fake-idp.ts'

const SITE = 'federation'
const TENANT_ID = '11111111-2222-3333-4444-555555555555'
const AT = Math.floor(new Date(NOW).getTime() / 1000)

const GOOGLE = {
  discovery: 'https://accounts.google.com/.well-known/openid-configuration',
  issuer: 'https://accounts.google.com',
  authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
  token: 'https://oauth2.googleapis.com/token',
  keys: 'https://www.googleapis.com/oauth2/v3/certs',
}
const MICROSOFT = {
  discovery:
    'https://login.microsoftonline.com/contoso.onmicrosoft.com/v2.0/.well-known/openid-configuration',
  issuer: `https://login.microsoftonline.com/${TENANT_ID}/v2.0`,
  authorize: `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize`,
  token: `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
  keys: `https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`,
}
const OKTA = {
  discovery: 'https://id.acme.test/.well-known/openid-configuration',
  issuer: 'https://id.acme.test',
  authorize: 'https://id.acme.test/authorize',
  token: 'https://id.acme.test/token',
  keys: 'https://id.acme.test/keys',
}
const ACCESS_CERTS = 'https://acme.cloudflareaccess.com/cdn-cgi/access/certs'

const PROVIDERS: readonly ProviderDefinition[] = [
  { kind: 'google', clientId: 'google-client', clientSecret: 'GOOGLE_SECRET' },
  {
    kind: 'microsoft',
    tenant: 'contoso.onmicrosoft.com',
    clientId: 'microsoft-client',
    clientSecret: 'MICROSOFT_SECRET',
  },
  { kind: 'github', clientId: 'github-client', clientSecret: 'GITHUB_SECRET' },
  {
    kind: 'oidc',
    id: 'okta',
    name: 'Okta',
    issuer: OKTA.issuer,
    clientId: 'okta-client',
    clientSecret: 'OKTA_SECRET',
  },
  { kind: 'cloudflare-access', teamDomain: 'acme.cloudflareaccess.com', audience: 'access-aud' },
]

const SECRETS = {
  GOOGLE_SECRET: 'google-secret',
  MICROSOFT_SECRET: 'microsoft-secret',
  GITHUB_SECRET: 'github-secret',
  OKTA_SECRET: 'okta-secret',
}

function configWith(
  providers: readonly ProviderDefinition[],
  access: SiteDefinition['access'] = { autoProvision: { domains: ['acme.test'], role: 'editor' } },
  passkeys = true,
) {
  return defineConfig({
    sites: {
      [SITE]: {
        locales: ['en'],
        defaultLocale: 'en',
        collections: {
          blog: defineCollection({
            schema: z.object({ title: z.string() }),
            routes: { en: '/blog/:slug/' },
          }),
        },
        access,
      },
    },
    auth: { providers, passkeys },
  })
}

let keys: Record<'google' | 'microsoft' | 'okta' | 'access' | 'stranger', SigningKey>

beforeAll(async () => {
  keys = {
    google: await signingKey('RS256'),
    microsoft: await signingKey('ES256'),
    okta: await signingKey('RS256'),
    access: await signingKey('ES256'),
    stranger: await signingKey('RS256'),
  }
})

afterEach(() => {
  vi.restoreAllMocks()
})

interface Exchange {
  readonly url: string
  readonly form: Record<string, string>
}

interface Idp {
  readonly exchanges: Exchange[]
  token: (form: Record<string, string>) => Promise<unknown>
  github: { user: unknown; emails: unknown }
}

function discovery(endpoints: typeof GOOGLE) {
  return {
    issuer: endpoints.issuer,
    authorization_endpoint: endpoints.authorize,
    token_endpoint: endpoints.token,
    jwks_uri: endpoints.keys,
  }
}

function fakeIdp(): Idp {
  const idp: Idp = {
    exchanges: [],
    token: async () => ({}),
    github: { user: { id: 4242, login: 'ada' }, emails: [] },
  }
  const documents: Record<string, () => unknown> = {
    [GOOGLE.discovery]: () => discovery(GOOGLE),
    [MICROSOFT.discovery]: () => discovery(MICROSOFT),
    [OKTA.discovery]: () => discovery(OKTA),
    [GOOGLE.keys]: () => ({ keys: [keys.google.jwk] }),
    [MICROSOFT.keys]: () => ({ keys: [keys.microsoft.jwk] }),
    [OKTA.keys]: () => ({ keys: [keys.okta.jwk] }),
    [ACCESS_CERTS]: () => ({ keys: [keys.access.jwk] }),
    'https://api.github.com/user': () => idp.github.user,
    'https://api.github.com/user/emails': () => idp.github.emails,
  }
  const tokens = [
    GOOGLE.token,
    MICROSOFT.token,
    OKTA.token,
    'https://github.com/login/oauth/access_token',
  ]
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const request = input instanceof Request ? input : new Request(String(input), init)
    if (tokens.includes(request.url)) {
      const form = Object.fromEntries(
        new URLSearchParams(new TextDecoder().decode(await request.arrayBuffer())),
      )
      idp.exchanges.push({ url: request.url, form })
      return Response.json(await idp.token(form))
    }
    const answer = documents[request.url]
    return answer === undefined ? new Response('no', { status: 404 }) : Response.json(answer())
  })
  return idp
}

function cookieOf(response: Response, name: string): string | null {
  for (const line of response.headers.getSetCookie()) {
    const match = new RegExp(`^${name}=([^;]*)`).exec(line)
    if (match !== null) return match[1] ?? ''
  }
  return null
}

async function start(worker: Booted, provider: string, returnTo = '/authorize?client_id=x') {
  const response = await worker.send(
    `/auth/federate/${provider}?return_to=${encodeURIComponent(returnTo)}`,
  )
  const location = new URL(response.headers.get('location') ?? 'https://none.test/')
  return {
    response,
    location,
    state: location.searchParams.get('state') ?? '',
    nonce: location.searchParams.get('nonce') ?? '',
    binding: cookieOf(response, 'hollware_federate') ?? '',
  }
}

async function finish(
  worker: Booted,
  provider: string,
  flow: { state: string; binding: string },
  code = 'the-code',
) {
  return worker.send(
    `/auth/federate/${provider}/callback?state=${encodeURIComponent(flow.state)}&code=${code}`,
    { headers: { cookie: `hollware_federate=${flow.binding}` } },
  )
}

async function signedInAs(response: Response): Promise<string | null> {
  const secret = cookieOf(response, 'hollware_session')
  if (secret === null || secret === '') return null
  return (await findSession(connect(env.DB), secret, new Date(NOW)))?.userId ?? null
}

function unique(local: string, domain = 'acme.test'): string {
  return `${local}-${crypto.randomUUID().slice(0, 8)}@${domain}`
}

function idToken(
  key: SigningKey,
  claims: Record<string, unknown>,
): (form: Record<string, string>) => Promise<unknown> {
  return async () => ({ id_token: await key.sign(claims), access_token: 'at' })
}

function googleClaims(nonce: string, email: string, more: Record<string, unknown> = {}) {
  return {
    iss: GOOGLE.issuer,
    aud: 'google-client',
    sub: `google-${email}`,
    email,
    email_verified: true,
    name: 'Ada Lovelace',
    nonce,
    iat: AT,
    exp: AT + 600,
    ...more,
  }
}

async function rows(sql: string, ...values: unknown[]) {
  return (
    await env.DB.prepare(sql)
      .bind(...values)
      .all()
  ).results
}

async function sendBack(worker: Booted, email: string, more: Record<string, unknown> = {}) {
  const idp = fakeIdp()
  const flow = await start(worker, 'google')
  idp.token = idToken(keys.google, googleClaims(flow.nonce, email, more))
  return { idp, flow, response: await finish(worker, 'google', flow) }
}

async function seedPerson(email: string | null) {
  const userId = newId('usr')
  await env.DB.prepare(
    "INSERT INTO users (id, name, role, email, email_verified_at, created_at, updated_at) VALUES (?1, 'Grace', 'editor', ?2, ?3, ?4, ?4)",
  )
    .bind(userId, email, email === null ? null : NOW, NOW)
    .run()
  return userId
}

describe('signing in through Google', () => {
  it('sends the browser to Google with PKCE, a nonce and the state of a challenge bound to a cookie', async () => {
    fakeIdp()
    const worker = boot({ config: configWith(PROVIDERS), secrets: SECRETS })

    const flow = await start(worker, 'google')

    expect(flow.response.status).toBe(302)
    expect(`${flow.location.origin}${flow.location.pathname}`).toBe(GOOGLE.authorize)
    expect(Object.fromEntries(flow.location.searchParams)).toEqual({
      response_type: 'code',
      client_id: 'google-client',
      redirect_uri: 'https://hollware.test/auth/federate/google/callback',
      scope: 'openid email profile',
      state: expect.stringMatching(/^chl_[0-9A-Z]{26}$/),
      code_challenge: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      code_challenge_method: 'S256',
      nonce: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    })
    expect(flow.response.headers.getSetCookie()).toEqual([
      `hollware_federate=${flow.binding}; HttpOnly; Secure; SameSite=Lax; Path=/auth/federate; Max-Age=300`,
    ])
  })

  it('makes an invited person a member, keeps the verified email and the identity, and goes back', async () => {
    const worker = boot({
      config: configWith(PROVIDERS, { autoProvision: null }),
      secrets: SECRETS,
    })
    await worker.ready()
    const email = unique('ada', 'example.org')
    await createInvitation(connect(env.DB), {
      site: SITE,
      role: 'author',
      userId: null,
      now: new Date(NOW),
      days: 7,
      email,
    })

    const { idp, flow, response } = await sendBack(worker, email)
    const userId = await signedInAs(response)

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/authorize?client_id=x')
    expect(userId).toMatch(/^usr_/)
    expect(await membershipsOf(connect(env.DB), userId ?? '')).toEqual([
      { site: SITE, role: 'author' },
    ])
    expect(
      await rows('SELECT name, email, email_verified_at FROM users WHERE id = ?1', userId),
    ).toEqual([{ name: 'Ada Lovelace', email, email_verified_at: NOW }])
    expect(
      await rows('SELECT provider, subject, email FROM identities WHERE user_id = ?1', userId),
    ).toEqual([{ provider: 'google', subject: `google-${email}`, email }])
    const [exchange] = idp.exchanges
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(exchange?.form['code_verifier'] ?? ''),
    )
    const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    expect(challenge).toBe(flow.location.searchParams.get('code_challenge'))
    expect(exchange?.form).toMatchObject({
      grant_type: 'authorization_code',
      code: 'the-code',
      client_id: 'google-client',
      client_secret: 'google-secret',
      redirect_uri: 'https://hollware.test/auth/federate/google/callback',
    })
    await worker.settle()
    expect(
      await rows(
        "SELECT detail FROM audit_log WHERE site_id = ?1 AND action = 'session.sign_in' AND actor_user_id = ?2",
        SITE,
        userId,
      ),
    ).toEqual([{ detail: '{"provider":"google"}' }])
  })

  it('signs the same account in again by its subject, whatever its email has become, and never takes the address of another', async () => {
    const worker = boot({ config: configWith(PROVIDERS), secrets: SECRETS })
    const email = unique('lin')
    const first = await signedInAs((await sendBack(worker, email)).response)

    const other = unique('other', 'example.org')
    const holder = await seedPerson(other)
    await env.DB.prepare('UPDATE users SET email = NULL, email_verified_at = NULL WHERE id = ?1')
      .bind(first)
      .run()

    const again = await signedInAs(
      (await sendBack(worker, other, { sub: `google-${email}` })).response,
    )

    expect(first).toMatch(/^usr_/)
    expect(again).toBe(first)
    expect(await rows('SELECT id FROM users WHERE email = ?1', other)).toEqual([{ id: holder }])
    expect(await rows('SELECT email FROM users WHERE id = ?1', first)).toEqual([{ email: null }])
  })

  it('links the account to the person who already has that verified email', async () => {
    const worker = boot({
      config: configWith(PROVIDERS, { autoProvision: null }),
      secrets: SECRETS,
    })
    const email = unique('grace', 'example.org')
    const userId = await seedPerson(email)

    const { response } = await sendBack(worker, email)

    expect(await signedInAs(response)).toBe(userId)
  })

  it.each([
    ['no email', null],
    ['an address nobody verified', 'nil@elsewhere.test'],
    ['that address, unverified', 'theirs'],
  ])(
    'gives a person with %s the verified one of the account they sign in with',
    async (_, before) => {
      const worker = boot({ config: configWith(PROVIDERS), secrets: SECRETS })
      const email = unique('nil')
      const userId = await signedInAs((await sendBack(worker, email)).response)
      await env.DB.prepare('UPDATE users SET email = ?1, email_verified_at = NULL WHERE id = ?2')
        .bind(before === 'theirs' ? email : before, userId)
        .run()

      await sendBack(worker, email, { sub: `google-${email}` })

      expect(
        await rows('SELECT email, email_verified_at FROM users WHERE id = ?1', userId),
      ).toEqual([{ email, email_verified_at: NOW }])
    },
  )
})

describe('signing in through the other providers', () => {
  it('Microsoft: asks for the answer in the query, and trusts the email of its one directory', async () => {
    const idp = fakeIdp()
    const worker = boot({ config: configWith(PROVIDERS), secrets: SECRETS })
    const email = unique('mia')
    const flow = await start(worker, 'microsoft')
    idp.token = idToken(keys.microsoft, {
      iss: MICROSOFT.issuer,
      aud: 'microsoft-client',
      sub: `ms-${email}`,
      email,
      nonce: flow.nonce,
      exp: AT + 600,
      nbf: AT - 10,
    })

    const response = await finish(worker, 'microsoft', flow)
    const userId = await signedInAs(response)

    expect(flow.location.searchParams.get('response_mode')).toBe('query')
    expect(`${flow.location.origin}${flow.location.pathname}`).toBe(MICROSOFT.authorize)
    expect(await membershipsOf(connect(env.DB), userId ?? '')).toEqual([
      { site: SITE, role: 'editor' },
    ])
  })

  it('GitHub: reads the primary verified email over the API with the access token', async () => {
    const idp = fakeIdp()
    const worker = boot({ config: configWith(PROVIDERS), secrets: SECRETS })
    const email = unique('gh')
    const flow = await start(worker, 'github')
    idp.token = async () => ({ access_token: 'gho_token', token_type: 'bearer' })
    idp.github = {
      user: { id: 4242, login: 'octo', name: null },
      emails: [
        { email: unique('unverified'), primary: false, verified: false },
        { email: 'Old@Elsewhere.test', primary: false, verified: true },
        { email: email.toUpperCase(), primary: true, verified: true },
      ],
    }

    const response = await finish(worker, 'github', flow)
    const userId = await signedInAs(response)

    expect(flow.location.origin).toBe('https://github.com')
    expect(flow.location.searchParams.get('scope')).toBe('read:user user:email')
    expect(flow.location.searchParams.has('nonce')).toBe(false)
    expect(await rows('SELECT name, email FROM users WHERE id = ?1', userId)).toEqual([
      { name: 'octo', email },
    ])
    expect(
      await rows('SELECT provider, subject FROM identities WHERE user_id = ?1', userId),
    ).toEqual([{ provider: 'github', subject: '4242' }])
  })

  it('OIDC: finds the endpoints by discovery and requires email_verified', async () => {
    const idp = fakeIdp()
    const worker = boot({ config: configWith(PROVIDERS), secrets: SECRETS })
    const email = unique('okta')
    const flow = await start(worker, 'okta')
    idp.token = idToken(keys.okta, {
      iss: OKTA.issuer,
      aud: ['okta-client', 'another'],
      sub: `okta-${email}`,
      email,
      email_verified: true,
      nonce: flow.nonce,
      exp: AT + 600,
    })

    const userId = await signedInAs(await finish(worker, 'okta', flow))

    expect(`${flow.location.origin}${flow.location.pathname}`).toBe(OKTA.authorize)
    expect(idp.exchanges.map((exchange) => exchange.url)).toEqual([OKTA.token])
    expect(userId).toMatch(/^usr_/)
  })

  it('Cloudflare Access: signs in on /signin from the assertion of its header, with no redirect to a provider', async () => {
    fakeIdp()
    const worker = boot({ config: configWith(PROVIDERS), secrets: SECRETS })
    const email = unique('cf')
    const assertion = await keys.access.sign({
      iss: 'https://acme.cloudflareaccess.com',
      aud: ['access-aud'],
      sub: `access-${email}`,
      email,
      exp: AT + 600,
    })

    const response = await worker.send('/signin?return_to=%2Fadmin%2Fentries', {
      headers: { 'cf-access-jwt-assertion': assertion },
    })

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/admin/entries')
    expect(await signedInAs(response)).toMatch(/^usr_/)
  })
})

describe('what a sign-in through a provider refuses', () => {
  async function refusedWith(
    claims: (nonce: string, email: string) => Record<string, unknown>,
    key?: SigningKey,
  ) {
    const idp = fakeIdp()
    const worker = boot({ config: configWith(PROVIDERS), secrets: SECRETS })
    const email = unique('eve')
    const flow = await start(worker, 'google')
    idp.token = idToken(key ?? keys.google, claims(flow.nonce, email))
    const response = await finish(worker, 'google', flow)
    return {
      status: response.status,
      session: cookieOf(response, 'hollware_session'),
      users: await rows('SELECT id FROM users WHERE email = ?1', email),
    }
  }

  it('an ID token signed by another key under the kid of Google', async () => {
    const idp = fakeIdp()
    const worker = boot({ config: configWith(PROVIDERS), secrets: SECRETS })
    const email = unique('forged')
    const flow = await start(worker, 'google')
    idp.token = async () => ({
      id_token: await keys.stranger.sign(googleClaims(flow.nonce, email), { kid: keys.google.kid }),
    })

    const response = await finish(worker, 'google', flow)

    expect([response.status, cookieOf(response, 'hollware_session')]).toEqual([400, null])
    expect(await rows('SELECT id FROM users WHERE email = ?1', email)).toEqual([])
  })

  it('an ID token for another client', async () => {
    expect(
      await refusedWith((nonce, email) => googleClaims(nonce, email, { aud: 'other-client' })),
    ).toEqual({
      status: 400,
      session: null,
      users: [],
    })
  })

  it('an ID token of another issuer', async () => {
    expect(
      await refusedWith((nonce, email) =>
        googleClaims(nonce, email, { iss: 'https://evil.example' }),
      ),
    ).toEqual({ status: 400, session: null, users: [] })
  })

  it('an ID token that expired more than a minute ago', async () => {
    expect(
      await refusedWith((nonce, email) => googleClaims(nonce, email, { exp: AT - 61 })),
    ).toEqual({ status: 400, session: null, users: [] })
  })

  it('an ID token of another sign-in, by its nonce', async () => {
    expect(await refusedWith((_nonce, email) => googleClaims('another-nonce', email))).toEqual({
      status: 400,
      session: null,
      users: [],
    })
  })

  it('a state used once already', async () => {
    const idp = fakeIdp()
    const worker = boot({ config: configWith(PROVIDERS), secrets: SECRETS })
    const flow = await start(worker, 'google')
    idp.token = idToken(keys.google, googleClaims(flow.nonce, unique('twice')))

    const first = await finish(worker, 'google', flow)
    const second = await finish(worker, 'google', flow)

    expect([first.status, second.status]).toEqual([302, 400])
    expect(cookieOf(second, 'hollware_session')).toBe(null)
    expect(idp.exchanges).toHaveLength(1)
  })

  it('an answer with no state, and one whose state began in another browser', async () => {
    const idp = fakeIdp()
    const worker = boot({ config: configWith(PROVIDERS), secrets: SECRETS })
    const flow = await start(worker, 'google')
    idp.token = idToken(keys.google, googleClaims(flow.nonce, unique('csrf')))

    const none = await worker.send('/auth/federate/google/callback?code=c')
    const elsewhere = await finish(worker, 'google', { state: flow.state, binding: 'not-mine' })

    expect([none.status, elsewhere.status]).toEqual([400, 400])
    expect(idp.exchanges).toEqual([])
  })

  it('an unverified email: never linked to its owner, never provisioned', async () => {
    const idp = fakeIdp()
    const worker = boot({ config: configWith(PROVIDERS), secrets: SECRETS })
    const owned = unique('victim')
    const victim = await seedPerson(owned)
    const flow = await start(worker, 'google')
    idp.token = idToken(keys.google, googleClaims(flow.nonce, owned, { email_verified: false }))

    const response = await finish(worker, 'google', flow)

    expect(response.status).toBe(403)
    expect(await response.text()).toContain('No access')
    expect(cookieOf(response, 'hollware_session')).toBe(null)
    expect(
      await rows('SELECT user_id FROM identities WHERE subject = ?1', `google-${owned}`),
    ).toEqual([])
    expect(await rows('SELECT id FROM users WHERE email = ?1', owned)).toEqual([{ id: victim }])
  })

  it('an OIDC account whose email the provider does not say it verified', async () => {
    const idp = fakeIdp()
    const worker = boot({ config: configWith(PROVIDERS), secrets: SECRETS })
    const email = unique('quiet')
    const flow = await start(worker, 'okta')
    idp.token = idToken(keys.okta, {
      iss: OKTA.issuer,
      aud: 'okta-client',
      sub: `okta-${email}`,
      email,
      nonce: flow.nonce,
      exp: AT + 600,
    })

    expect((await finish(worker, 'okta', flow)).status).toBe(403)
  })

  it('a verified email of a domain no site lets in', async () => {
    const { response } = await sendBack(
      boot({ config: configWith(PROVIDERS), secrets: SECRETS }),
      unique('ada', 'notacme.test'),
    )

    expect(response.status).toBe(403)
    expect(cookieOf(response, 'hollware_session')).toBe(null)
  })

  it('a return_to of another origin, which goes to the admin instead', async () => {
    const idp = fakeIdp()
    const worker = boot({ config: configWith(PROVIDERS), secrets: SECRETS })
    const flow = await start(worker, 'google', 'https://evil.example/steal')
    idp.token = idToken(keys.google, googleClaims(flow.nonce, unique('home')))

    const response = await finish(worker, 'google', flow)

    expect(response.headers.get('location')).toBe('/admin/')
  })

  it('the header of Cloudflare Access when no Access provider is configured', async () => {
    fakeIdp()
    const worker = boot({ config: configWith(PROVIDERS.slice(0, 1)), secrets: SECRETS })
    const assertion = await keys.access.sign({
      iss: 'https://acme.cloudflareaccess.com',
      aud: ['access-aud'],
      sub: 'access-x',
      email: unique('cf'),
      exp: AT + 600,
    })

    const response = await worker.send('/signin', {
      headers: { 'cf-access-jwt-assertion': assertion },
    })

    expect(response.status).toBe(200)
    expect(cookieOf(response, 'hollware_session')).toBe(null)
    expect(await response.text()).toContain('Continue with Google')
  })

  it('an assertion of Access for another application', async () => {
    fakeIdp()
    const worker = boot({ config: configWith(PROVIDERS), secrets: SECRETS })
    const assertion = await keys.access.sign({
      iss: 'https://acme.cloudflareaccess.com',
      aud: ['another-app'],
      sub: 'access-y',
      email: unique('cf'),
      exp: AT + 600,
    })

    const response = await worker.send('/signin', {
      headers: { 'cf-access-jwt-assertion': assertion },
    })

    expect(response.status).toBe(400)
    expect(cookieOf(response, 'hollware_session')).toBe(null)
  })

  it('the shared tenant of Microsoft, at startup', () => {
    expect(() =>
      boot({
        config: configWith([
          { kind: 'microsoft', tenant: 'common', clientId: 'm', clientSecret: 'MICROSOFT_SECRET' },
        ]),
      }),
    ).toThrow(ConfigError)
  })
})

describe('the sign-in page and the passkeys', () => {
  it('goes straight to the one provider when passkeys are off', async () => {
    const worker = boot({
      config: configWith(PROVIDERS.slice(0, 1), undefined, false),
      secrets: SECRETS,
    })

    const response = await worker.send('/signin?return_to=%2Fauthorize%3Fx%3D1')

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe(
      '/auth/federate/google?return_to=%2Fauthorize%3Fx%3D1',
    )
  })

  it('answers the steps of a passkey with an error when passkeys are off, and serves them when on', async () => {
    const off = boot({ config: configWith(PROVIDERS, undefined, false), secrets: SECRETS })
    const on = boot({ config: configWith(PROVIDERS), secrets: SECRETS })

    const refused = await off.send('/auth/signin/options', { method: 'POST', body: '{}' })
    const served = await on.send('/auth/signin/options', { method: 'POST', body: '{}' })

    expect(refused.status).toBe(403)
    expect(await refused.json()).toEqual({
      code: 'forbidden',
      message: 'This Hollware does not sign people in with passkeys.',
      fix: 'Sign in with your account at /signin.',
    })
    expect(served.status).toBe(200)
  })

  it('lists every provider and the passkey on the sign-in page', async () => {
    const worker = boot({ config: configWith(PROVIDERS), secrets: SECRETS })

    const page = await (await worker.send('/signin')).text()

    expect(page.match(/Continue with [A-Za-z ]+/g)).toEqual([
      'Continue with Google',
      'Continue with Microsoft',
      'Continue with GitHub',
      'Continue with Okta',
      'Continue with Cloudflare Access',
    ])
    expect(page).toContain('Sign in with a passkey')
  })
})

describe('a person of passkeys only, after the migration to providers', () => {
  it('signs in with their passkey, and then through a provider with the address they were invited by, which becomes verified', async () => {
    const { softAuthenticator } = await import('../support/authenticator.ts')
    const { authenticationOptions, registrationOptions, verifyAuthentication, verifyRegistration } =
      await import('../../src/identity/ceremonies.ts')
    const ceremony = { db: connect(env.DB), publicUrl: 'https://hollware.test', now: new Date(NOW) }
    const worker = boot({
      config: configWith(PROVIDERS, { autoProvision: null }),
      secrets: SECRETS,
    })
    await worker.ready()
    const email = unique('pat', 'example.org')
    const invitation = await createInvitation(ceremony.db, {
      site: SITE,
      role: 'author',
      userId: null,
      now: new Date(NOW),
      days: 7,
      email,
    })
    const authenticator = await softAuthenticator('https://hollware.test')
    const registration = await registrationOptions(ceremony, invitation.secret)
    const made = await verifyRegistration(ceremony, {
      challengeId: registration.challengeId,
      response: await authenticator.register(registration.options),
      name: 'Pat',
      label: 'Laptop',
    })
    const before = await rows(
      'SELECT email, email_verified_at FROM users WHERE id = ?1',
      made.userId,
    )

    const asked = await authenticationOptions(ceremony)
    const again = await verifyAuthentication(ceremony, {
      challengeId: asked.challengeId,
      response: await authenticator.authenticate(asked.options),
    })
    const { response } = await sendBack(worker, email)

    expect(again.userId).toBe(made.userId)
    expect(before).toEqual([{ email, email_verified_at: null }])
    expect(await signedInAs(response)).toBe(made.userId)
    expect(
      await rows('SELECT email, email_verified_at FROM users WHERE id = ?1', made.userId),
    ).toEqual([{ email, email_verified_at: NOW }])
  })
})
