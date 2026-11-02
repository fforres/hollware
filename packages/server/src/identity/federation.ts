import {
  admitsEmail,
  emailAddress,
  newId,
  type ResolvedProvider,
  type ResolvedSite,
} from '@hollware/core'
import type { Db } from '../db/d1.ts'
import { discover, TokenRefused, verifyJwt, type Fetcher } from './jwt.ts'
import {
  addMember,
  createSession,
  createUser,
  findIdentity,
  giveEmail,
  invitationsFor,
  linkIdentity,
  redeemInvitation,
  saveChallenge,
  takeChallenge,
  userWithAddress,
  verifyAddress,
} from './store.ts'

export { TokenRefused } from './jwt.ts'

const SESSION_HOURS = 12

const GITHUB = {
  authorize: 'https://github.com/login/oauth/authorize',
  token: 'https://github.com/login/oauth/access_token',
  user: 'https://api.github.com/user',
  emails: 'https://api.github.com/user/emails',
}

const GOOGLE_ISSUER = 'https://accounts.google.com'

export interface Federation {
  readonly db: Db
  readonly publicUrl: string
  readonly now: Date
  readonly fetch: Fetcher
  readonly secret: (name: string) => string | undefined
}

export interface Claims {
  readonly provider: string
  readonly subject: string
  readonly email: string | null
  readonly emailVerified: boolean
  readonly name: string | null
}

export class FederationRefused extends Error {
  override readonly name = 'FederationRefused'
}

type Redirecting = Exclude<ResolvedProvider, { kind: 'cloudflare-access' }>

function random(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function challengeOf(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  let binary = ''
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function redirectUri(federation: Federation, provider: ResolvedProvider): string {
  return `${new URL(federation.publicUrl).origin}/auth/federate/${provider.id}/callback`
}

function issuerOf(provider: Redirecting): string | null {
  if (provider.kind === 'google') return GOOGLE_ISSUER
  if (provider.kind === 'microsoft') {
    return `https://login.microsoftonline.com/${provider.tenant}/v2.0`
  }
  if (provider.kind === 'oidc') return provider.issuer
  return null
}

interface Endpoints {
  readonly authorize: string
  readonly token: string
  readonly keys: string | null
  readonly issuers: readonly string[]
}

function textOf(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

async function endpointsOf(federation: Federation, provider: Redirecting): Promise<Endpoints> {
  const issuer = issuerOf(provider)
  if (issuer === null) {
    return { authorize: GITHUB.authorize, token: GITHUB.token, keys: null, issuers: [] }
  }
  const document = await discover(federation.fetch, issuer, federation.now.getTime())
  const named = textOf(document['issuer'])
  const authorize = textOf(document['authorization_endpoint'])
  const token = textOf(document['token_endpoint'])
  const keys = textOf(document['jwks_uri'])
  if (named === null || authorize === null || token === null || keys === null) {
    throw new FederationRefused(`the discovery document of ${issuer} lacks an endpoint`)
  }
  if (provider.kind === 'oidc' && named !== issuer) {
    throw new FederationRefused(`the discovery document of ${issuer} names ${named}`)
  }
  const issuers = provider.kind === 'google' ? [GOOGLE_ISSUER, 'accounts.google.com'] : [named]
  return { authorize, token, keys, issuers }
}

function scopesOf(provider: Redirecting): string {
  if (provider.kind === 'github') return 'read:user user:email'
  if (provider.kind === 'oidc') return provider.scopes.join(' ')
  return 'openid email profile'
}

export async function startFederation(
  federation: Federation,
  provider: Redirecting,
  returnTo: string | null,
): Promise<{ readonly location: string; readonly binding: string }> {
  const endpoints = await endpointsOf(federation, provider)
  const binding = random()
  const nonce = random()
  const verifier = random()
  const state = await saveChallenge(federation.db, {
    challenge: binding,
    purpose: 'federate',
    invitationId: null,
    userId: null,
    now: federation.now,
    provider: provider.id,
    nonce,
    codeVerifier: verifier,
    returnTo,
  })
  const url = new URL(endpoints.authorize)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', provider.clientId)
  url.searchParams.set('redirect_uri', redirectUri(federation, provider))
  url.searchParams.set('scope', scopesOf(provider))
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', await challengeOf(verifier))
  url.searchParams.set('code_challenge_method', 'S256')
  if (provider.kind !== 'github') url.searchParams.set('nonce', nonce)
  if (provider.kind === 'microsoft') url.searchParams.set('response_mode', 'query')
  return { location: url.href, binding }
}

async function exchange(
  federation: Federation,
  provider: Redirecting,
  endpoint: string,
  code: string,
  verifier: string,
): Promise<Record<string, unknown>> {
  const secret = federation.secret(provider.clientSecret)
  if (secret === undefined) {
    throw new FederationRefused(`the Worker has no secret ${provider.clientSecret}`)
  }
  const response = await federation.fetch(
    new Request(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri(federation, provider),
        client_id: provider.clientId,
        client_secret: secret,
        code_verifier: verifier,
      }),
    }),
  )
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok || typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new FederationRefused(`the token endpoint answered ${response.status}`)
  }
  return Object.fromEntries(Object.entries(body))
}

async function githubJson(federation: Federation, url: string, token: string): Promise<unknown> {
  const response = await federation.fetch(
    new Request(url, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'user-agent': 'Hollware',
      },
    }),
  )
  if (!response.ok) throw new FederationRefused(`${url} answered ${response.status}`)
  return response.json()
}

async function githubClaims(
  federation: Federation,
  provider: Redirecting,
  token: string,
): Promise<Claims> {
  const user = await githubJson(federation, GITHUB.user, token)
  const emails = await githubJson(federation, GITHUB.emails, token)
  const id = typeof user === 'object' && user !== null ? Reflect.get(user, 'id') : undefined
  if (typeof id !== 'number' && typeof id !== 'string') {
    throw new FederationRefused('GitHub answered no user id')
  }
  const primary = Array.isArray(emails)
    ? emails.find(
        (entry: unknown) =>
          typeof entry === 'object' &&
          entry !== null &&
          Reflect.get(entry, 'primary') === true &&
          Reflect.get(entry, 'verified') === true,
      )
    : undefined
  const address: unknown =
    typeof primary === 'object' && primary !== null ? Reflect.get(primary, 'email') : undefined
  const email = typeof address === 'string' ? emailAddress(address) : null
  const name = typeof user === 'object' && user !== null ? Reflect.get(user, 'name') : null
  const login = typeof user === 'object' && user !== null ? Reflect.get(user, 'login') : null
  return {
    provider: provider.id,
    subject: String(id),
    email,
    emailVerified: email !== null,
    name: textOf(name) ?? textOf(login),
  }
}

function verifiedBy(provider: ResolvedProvider, claims: Record<string, unknown>): boolean {
  if (provider.kind === 'microsoft' || provider.kind === 'cloudflare-access') return true
  return claims['email_verified'] === true
}

function claimsOf(provider: ResolvedProvider, claims: Record<string, unknown>): Claims {
  const subject = textOf(claims['sub'])
  if (subject === null) throw new FederationRefused('the token names no subject')
  const raw = textOf(claims['email'])
  const email = raw === null ? null : emailAddress(raw)
  return {
    provider: provider.id,
    subject,
    email,
    emailVerified: email !== null && verifiedBy(provider, claims),
    name: textOf(claims['name']),
  }
}

export async function finishFederation(
  federation: Federation,
  provider: Redirecting,
  input: {
    readonly state: string
    readonly code: string | null
    readonly binding: string | null
  },
): Promise<{ readonly claims: Claims; readonly returnTo: string | null }> {
  const challenge = await takeChallenge(federation.db, {
    id: input.state,
    purpose: 'federate',
    now: federation.now,
  })
  if (
    challenge === null ||
    challenge.provider !== provider.id ||
    input.binding === null ||
    challenge.challenge !== input.binding ||
    challenge.codeVerifier === null
  ) {
    throw new FederationRefused('the sign-in expired, was used, or began in another browser')
  }
  if (input.code === null) throw new FederationRefused('the provider gave no code')
  const endpoints = await endpointsOf(federation, provider)
  const tokens = await exchange(
    federation,
    provider,
    endpoints.token,
    input.code,
    challenge.codeVerifier,
  )
  if (provider.kind === 'github') {
    const access = textOf(tokens['access_token'])
    if (access === null) throw new FederationRefused('GitHub gave no access token')
    return {
      claims: await githubClaims(federation, provider, access),
      returnTo: challenge.returnTo,
    }
  }
  const idToken = textOf(tokens['id_token'])
  if (idToken === null || endpoints.keys === null) {
    throw new FederationRefused('the provider gave no ID token')
  }
  const verified = await verifyJwt(federation.fetch, idToken, {
    keys: endpoints.keys,
    issuers: endpoints.issuers,
    audience: provider.clientId,
    nonce: challenge.nonce,
    now: federation.now,
  })
  return { claims: claimsOf(provider, verified), returnTo: challenge.returnTo }
}

export async function accessClaims(
  federation: Federation,
  provider: Extract<ResolvedProvider, { kind: 'cloudflare-access' }>,
  assertion: string,
): Promise<Claims> {
  const origin = `https://${provider.teamDomain}`
  const verified = await verifyJwt(federation.fetch, assertion, {
    keys: `${origin}/cdn-cgi/access/certs`,
    issuers: [origin],
    audience: provider.audience,
    nonce: null,
    now: federation.now,
  })
  return claimsOf(provider, verified)
}

async function acceptInvitations(db: Db, userId: string, email: string, now: Date) {
  for (const invitation of await invitationsFor(db, email, now)) {
    if (invitation.userId !== null && invitation.userId !== userId) continue
    if (await redeemInvitation(db, invitation.id, now)) {
      await addMember(db, { site: invitation.site, userId, role: invitation.role, now })
    }
  }
}

function nameOf(claims: Claims, email: string): string {
  const name = claims.name?.trim().replace(/\s+/g, ' ') ?? ''
  if (name !== '' && name.length <= 100) return name
  return email.slice(0, email.indexOf('@'))
}

export async function resolvePerson(
  db: Db,
  claims: Claims,
  sites: ReadonlyMap<string, ResolvedSite>,
  now: Date,
): Promise<string | null> {
  const email = claims.emailVerified ? claims.email : null
  const known = await findIdentity(db, claims.provider, claims.subject)
  if (known !== null) {
    if (email !== null) {
      await giveEmail(db, known.userId, email, now)
      await acceptInvitations(db, known.userId, email, now)
    }
    return known.userId
  }
  if (email === null) return null
  const link = async (userId: string) => {
    await linkIdentity(db, {
      userId,
      provider: claims.provider,
      subject: claims.subject,
      email,
      now,
    })
    await acceptInvitations(db, userId, email, now)
    return userId
  }
  const owner = await userWithAddress(db, email)
  if (owner !== null) {
    await verifyAddress(db, owner, email, now)
    return link(owner)
  }
  const [invitation] = (await invitationsFor(db, email, now)).filter(
    (candidate) => candidate.userId === null,
  )
  if (invitation !== undefined && (await redeemInvitation(db, invitation.id, now))) {
    const userId = newId('usr')
    await createUser(db, {
      id: userId,
      name: nameOf(claims, email),
      role: invitation.role,
      site: invitation.site,
      now,
      email,
      verified: true,
    })
    return link(userId)
  }
  const site = [...sites.values()].find((candidate) => admitsEmail(candidate.access, email))
  const provision = site?.access.autoProvision
  if (site === undefined || provision === null || provision === undefined) return null
  const userId = newId('usr')
  await createUser(db, {
    id: userId,
    name: nameOf(claims, email),
    role: provision.role,
    site: site.key,
    now,
    email,
    verified: true,
  })
  return link(userId)
}

export async function sessionFor(db: Db, userId: string, now: Date): Promise<string> {
  return (await createSession(db, { userId, now, hours: SESSION_HOURS })).secret
}

export function isRefusal(error: unknown): boolean {
  return error instanceof FederationRefused || error instanceof TokenRefused
}
