import { defineConfig } from '@hollware/core'
import { env } from 'cloudflare:workers'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { connect } from '../../src/db/d1.ts'
import { createSession } from '../../src/identity/store.ts'
import { seedToken } from '../auth/support.ts'
import { callRaw, INPUTS } from '../mcp/support.ts'
import {
  boot,
  captureLogs,
  CONFIG,
  NOW,
  onlyCall,
  OTHER_SITE_KEY,
  PUBLIC_URL,
  restoreLogs,
  SITE_KEY,
  type Booted,
} from '../http/support.ts'

afterEach(() => {
  restoreLogs()
  vi.useRealTimers()
})

const MCP = `${PUBLIC_URL}/mcp`
const REDIRECT = 'https://agent.example.com/callback'
const ALL = 'content:read content:write content:publish'

const WITH_REGISTRATION = defineConfig({ ...CONFIG, auth: { dynamicClientRegistration: true } })

const TWO_SITES = defineConfig({
  ...WITH_REGISTRATION,
  sites: Object.fromEntries(
    Object.values(CONFIG.sites ?? {}).flatMap((site) => [
      [SITE_KEY, site],
      [OTHER_SITE_KEY, site],
    ]),
  ),
})

async function memberOf(userId: string, site: string, role: 'owner' | 'editor' | 'author') {
  await env.DB.prepare(
    'INSERT OR IGNORE INTO sites (id, created_at, updated_at) VALUES (?1, ?2, ?2)',
  )
    .bind(site, NOW)
    .run()
  await env.DB.prepare(
    'INSERT INTO members (id, site_id, user_id, role, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)',
  )
    .bind(`mem_${crypto.randomUUID()}`, site, userId, role, NOW)
    .run()
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

async function pkce() {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)))
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return { verifier, challenge: base64url(new Uint8Array(digest)) }
}

function cookiesOf(response: Response): string[] {
  return response.headers.getSetCookie().map((cookie) => cookie.split(';')[0] ?? '')
}

async function register(worker: Booted): Promise<string> {
  const response = await worker.send('/oauth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Test agent',
      redirect_uris: [REDIRECT],
      token_endpoint_auth_method: 'none',
    }),
  })
  expect(response.status).toBe(201)
  const { client_id } = await response.json<{ client_id: string }>()
  return client_id
}

async function signedIn(role: 'owner' | 'editor' | 'author', site = SITE_KEY) {
  const { userId } = await seedToken(env.DB, site, { role })
  const session = await createSession(connect(env.DB), {
    userId,
    now: new Date(NOW),
    hours: 12,
  })
  return { userId, cookie: `hollware_session=${session.secret}` }
}

function authorizeUrl(clientId: string, challenge: string, scope = ALL, resource = MCP): string {
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: REDIRECT,
    scope,
    state: 'state-1',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource,
  })
  return `/authorize?${query.toString()}`
}

async function consent(
  worker: Booted,
  clientId: string,
  challenge: string,
  cookie: string,
  scope = ALL,
  resource = MCP,
) {
  const page = await worker.send(authorizeUrl(clientId, challenge, scope, resource), {
    headers: { cookie },
  })
  expect(page.status).toBe(200)
  const html = await page.text()
  const handle = /name="handle" value="([^"]+)"/.exec(html)?.[1] ?? ''
  const offered = [...html.matchAll(/name="scope" value="([^"]+)"/g)].map((match) => match[1])
  return { page, html, handle, offered, cookies: [cookie, ...cookiesOf(page)].join('; ') }
}

async function allow(
  worker: Booted,
  handle: string,
  cookies: string,
  scopes: readonly string[],
  site = SITE_KEY,
) {
  const form = new URLSearchParams({ handle, decision: 'approve', site })
  for (const scope of scopes) form.append('scope', scope)
  return await worker.send('/authorize', {
    method: 'POST',
    headers: {
      cookie: cookies,
      'content-type': 'application/x-www-form-urlencoded',
      origin: PUBLIC_URL,
    },
    body: form.toString(),
  })
}

async function exchange(
  worker: Booted,
  clientId: string,
  code: string,
  verifier: string,
  resource = MCP,
) {
  const response = await worker.send('/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT,
      client_id: clientId,
      code_verifier: verifier,
      resource,
    }).toString(),
  })
  expect(response.status).toBe(200)
  return await response.json<{
    access_token: string
    refresh_token: string
    scope: string
    expires_in: number
  }>()
}

async function tokenFor(worker: Booted, role: 'owner' | 'editor' | 'author', site = SITE_KEY) {
  const person = await signedIn(role, site)
  const clientId = await register(worker)
  const { verifier, challenge } = await pkce()
  const { handle, offered, cookies } = await consent(worker, clientId, challenge, person.cookie)
  const redirect = await allow(
    worker,
    handle,
    cookies,
    offered.filter((scope) => scope !== undefined),
    site,
  )
  const code = new URL(redirect.headers.get('location') ?? '').searchParams.get('code') ?? ''
  const tokens = await exchange(worker, clientId, code, verifier)
  return { ...person, clientId, offered, tokens }
}

describe('the metadata of the OAuth server', () => {
  it('names its endpoints and takes metadata documents, and has no registration by default', async () => {
    const worker = boot()

    const metadata = await (await worker.send('/.well-known/oauth-authorization-server')).json()
    const registration = await worker.send('/oauth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_name: 'x', redirect_uris: [REDIRECT] }),
    })

    expect(metadata).toMatchObject({
      issuer: PUBLIC_URL,
      authorization_endpoint: `${PUBLIC_URL}/authorize`,
      token_endpoint: `${PUBLIC_URL}/oauth/token`,
      scopes_supported: [
        'content:read',
        'content:write',
        'content:publish',
        'schema:admin',
        'site:owner',
        'review:read',
        'review:comment',
      ],
      code_challenge_methods_supported: ['S256'],
      client_id_metadata_document_supported: true,
      protected_resources: [MCP, `${PUBLIC_URL}/v1`],
    })
    expect(metadata).not.toHaveProperty('registration_endpoint')
    expect(registration.status).toBe(404)
  })

  it('names the authorization server and the baseline scope for each resource', async () => {
    const worker = boot()

    const mcp = await (await worker.send('/.well-known/oauth-protected-resource/mcp')).json()

    expect(mcp).toEqual({
      resource: MCP,
      authorization_servers: [PUBLIC_URL],
      scopes_supported: ['content:read'],
      bearer_methods_supported: ['header'],
      resource_name: 'Hollware MCP',
    })
  })
})

describe('the authorization endpoint', () => {
  it('sends a person without a session to sign in, and back here after', async () => {
    const worker = boot({ config: WITH_REGISTRATION })
    const clientId = await register(worker)
    const { challenge } = await pkce()
    const path = authorizeUrl(clientId, challenge)

    const response = await worker.send(path)

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe(`/signin?return_to=${encodeURIComponent(path)}`)
  })

  it('offers only the scopes the role allows of those asked, on a page nothing frames', async () => {
    const worker = boot({ config: WITH_REGISTRATION })
    const author = await signedIn('author')
    const clientId = await register(worker)
    const { challenge } = await pkce()

    const { page, html, offered } = await consent(worker, clientId, challenge, author.cookie)

    expect(offered).toEqual(['content:read', 'content:write'])
    expect(html).toContain('This app registered itself: its name is not verified.')
    expect(html).toContain('Access goes to <strong>agent.example.com</strong>')
    expect(page.headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
  })

  it('asks which site when the person is in two, and grants the one they choose, if theirs', async () => {
    const worker = boot({ config: TWO_SITES })
    const person = await signedIn('author')
    await memberOf(person.userId, OTHER_SITE_KEY, 'editor')
    const clientId = await register(worker)
    const { verifier, challenge } = await pkce()

    const { html, handle, offered, cookies } = await consent(
      worker,
      clientId,
      challenge,
      person.cookie,
    )
    const stranger = await allow(worker, handle, cookies, ['content:read'], 'no-such-site')
    const again = await consent(worker, clientId, challenge, person.cookie)
    const chosen = await allow(
      worker,
      again.handle,
      again.cookies,
      ['content:read', 'content:publish', 'schema:admin'],
      OTHER_SITE_KEY,
    )
    const code = new URL(chosen.headers.get('location') ?? '').searchParams.get('code') ?? ''
    const tokens = await exchange(worker, clientId, code, verifier)
    await callRaw(worker.endpoint(tokens.access_token), 'modern', 'describe_site', {})

    expect(html).toContain(`<input type="radio" name="site" value="${SITE_KEY}" checked>`)
    expect(html).toContain(`<input type="radio" name="site" value="${OTHER_SITE_KEY}">`)
    expect(offered).toEqual(['content:read', 'content:write', 'content:publish'])
    expect(stranger.status).toBe(403)
    expect(tokens.scope).toBe('content:read content:publish')
    expect(onlyCall(worker.seen).context).toMatchObject({
      site: { key: OTHER_SITE_KEY },
      principal: { scopes: ['content:read', 'content:publish', 'review:read'] },
    })
  })

  it('lets the admin, its own client, in without a consent page, within the role', async () => {
    const worker = boot()
    const author = await signedIn('author')
    const admin = await (
      await worker.send('/admin/config.json')
    ).json<{
      clientId: string
      redirectUri: string
      resource: string
      scope: string
    }>()
    const { challenge } = await pkce()
    const query = new URLSearchParams({
      response_type: 'code',
      client_id: admin.clientId,
      redirect_uri: admin.redirectUri,
      scope: admin.scope,
      state: 'admin-state',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      resource: admin.resource,
    })

    const response = await worker.send(`/authorize?${query.toString()}`, {
      headers: { cookie: author.cookie },
    })

    const location = new URL(response.headers.get('location') ?? '')
    expect(response.status).toBe(302)
    expect(`${location.origin}${location.pathname}`).toBe(admin.redirectUri)
    expect(location.searchParams.get('state')).toBe('admin-state')
    expect(location.searchParams.get('code')).toMatch(/\S+/)
  })

  it('redirects with access_denied and the state when the person declines', async () => {
    const worker = boot({ config: WITH_REGISTRATION })
    const owner = await signedIn('owner')
    const clientId = await register(worker)
    const { challenge } = await pkce()
    const { handle, cookies } = await consent(worker, clientId, challenge, owner.cookie)

    const response = await worker.send('/authorize', {
      method: 'POST',
      headers: {
        cookie: cookies,
        'content-type': 'application/x-www-form-urlencoded',
        origin: PUBLIC_URL,
      },
      body: new URLSearchParams([
        ['handle', handle],
        ['scope', 'content:read'],
        ['decision', 'deny'],
      ]).toString(),
    })

    const location = new URL(response.headers.get('location') ?? '')
    expect(response.status).toBe(302)
    expect(`${location.origin}${location.pathname}`).toBe(REDIRECT)
    expect(location.searchParams.get('error')).toBe('access_denied')
    expect(location.searchParams.get('state')).toBe('state-1')
  })
})

describe('an access token', () => {
  it('reaches /mcp as the person, through the client, with the scopes they allowed', async () => {
    const worker = boot({ config: WITH_REGISTRATION })
    const { userId, clientId, tokens } = await tokenFor(worker, 'author')

    const answer = await callRaw(
      worker.endpoint(tokens.access_token),
      'modern',
      'list_entries',
      INPUTS.list_entries,
    )

    expect(tokens.scope).toBe('content:read content:write')
    expect(answer.status).toBe(200)
    const { results } = await env.DB.prepare(
      "SELECT action, actor_kind, target_type, target_id, detail FROM audit_log WHERE actor_user_id = ?1 AND action = 'app.allow'",
    )
      .bind(userId)
      .all()
    expect(results).toEqual([
      {
        action: 'app.allow',
        actor_kind: 'user',
        target_type: 'client',
        target_id: clientId,
        detail: '{"scopes":["content:read","content:write"]}',
      },
    ])
    expect(onlyCall(worker.seen).context.principal).toEqual({
      kind: 'oauth',
      userId,
      clientId,
      site: SITE_KEY,
      scopes: ['content:read', 'content:write', 'review:read', 'review:comment'],
    })
  })

  it('does what the role allows at each request: a demoted owner loses publish at once', async () => {
    const worker = boot({ config: WITH_REGISTRATION })
    const { userId, tokens } = await tokenFor(worker, 'owner')
    await env.DB.prepare("UPDATE members SET role = 'author' WHERE user_id = ?1").bind(userId).run()

    await callRaw(
      worker.endpoint(tokens.access_token),
      'modern',
      'list_entries',
      INPUTS.list_entries,
    )

    expect(tokens.scope).toBe(ALL)
    expect(onlyCall(worker.seen).context.principal).toMatchObject({
      scopes: ['content:read', 'content:write', 'review:read', 'review:comment'],
    })
  })

  const refreshWith = (
    worker: Booted,
    clientId: string,
    refresh: string,
    type = 'application/x-www-form-urlencoded',
  ) =>
    worker.send('/oauth/token', {
      method: 'POST',
      headers: { 'content-type': type },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refresh,
        client_id: clientId,
        resource: MCP,
      }).toString(),
    })

  it('lives an hour', async () => {
    const worker = boot({ config: WITH_REGISTRATION })

    const { tokens } = await tokenFor(worker, 'author')

    expect(tokens.expires_in).toBe(3600)
  })

  it('comes with a refresh token that is refused thirty days after the code, refreshed or not', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.parse(NOW) })
    const worker = boot({ config: WITH_REGISTRATION })
    const { clientId, tokens } = await tokenFor(worker, 'editor')
    const at = (iso: string) => {
      vi.setSystemTime(Date.parse(iso))
      worker.clock.set(iso)
    }

    at('2026-11-12T11:58:00.000Z')
    const early = await refreshWith(worker, clientId, tokens.refresh_token)
    const rotated = await early.clone().json<{ refresh_token: string }>()
    at('2026-11-12T12:00:00.000Z')
    const late = await refreshWith(worker, clientId, rotated.refresh_token)

    expect([early.status, late.status, (await late.json<{ error: string }>()).error]).toEqual([
      200,
      400,
      'invalid_grant',
    ])
  })

  it('takes a spent refresh token again within a minute, for an answer that was lost', async () => {
    const worker = boot({ config: WITH_REGISTRATION })
    const { clientId, tokens } = await tokenFor(worker, 'editor')
    const first = await refreshWith(worker, clientId, tokens.refresh_token)
    worker.clock.set(new Date(Date.parse(NOW) + 60_000).toISOString())

    const retried = await refreshWith(worker, clientId, tokens.refresh_token)

    expect([first.status, retried.status]).toEqual([200, 200])
  })

  it('revokes the grant when a spent refresh token comes back after the grace', async () => {
    const worker = boot({ config: WITH_REGISTRATION })
    const { userId, clientId, tokens } = await tokenFor(worker, 'editor')
    const rotated = await (
      await refreshWith(worker, clientId, tokens.refresh_token)
    ).json<{
      access_token: string
      refresh_token: string
    }>()
    worker.clock.set(new Date(Date.parse(NOW) + 61_000).toISOString())

    const stolen = await refreshWith(worker, clientId, tokens.refresh_token)
    const own = await refreshWith(worker, clientId, rotated.refresh_token)
    const access = await callRaw(
      worker.endpoint(rotated.access_token),
      'modern',
      'list_entries',
      INPUTS.list_entries,
    )

    expect([stolen.status, (await stolen.json<{ error: string }>()).error]).toEqual([
      400,
      'invalid_grant',
    ])
    expect([own.status, access.status]).toEqual([400, 401])
    const { results } = await env.DB.prepare(
      "SELECT action, outcome, actor_kind, target_type FROM audit_log WHERE actor_user_id = ?1 AND action = 'app.refresh_reused'",
    )
      .bind(userId)
      .all()
    expect(results).toEqual([
      {
        action: 'app.refresh_reused',
        outcome: 'denied',
        actor_kind: 'system',
        target_type: 'grant',
      },
    ])
  })

  it('revokes it too when the spent token comes with the media type in capitals', async () => {
    const worker = boot({ config: WITH_REGISTRATION })
    const { clientId, tokens } = await tokenFor(worker, 'editor')
    const rotated = await (
      await refreshWith(worker, clientId, tokens.refresh_token)
    ).json<{ refresh_token: string }>()
    worker.clock.set(new Date(Date.parse(NOW) + 61_000).toISOString())

    const stolen = await refreshWith(
      worker,
      clientId,
      tokens.refresh_token,
      ' Application/X-WWW-Form-Urlencoded; charset=UTF-8',
    )
    const own = await refreshWith(worker, clientId, rotated.refresh_token)

    expect([stolen.status, own.status]).toEqual([400, 400])
  })

  it('is refused at once when the person is no longer a member of the site', async () => {
    const worker = boot({ config: WITH_REGISTRATION })
    const { userId, tokens } = await tokenFor(worker, 'editor')
    const before = await callRaw(
      worker.endpoint(tokens.access_token),
      'modern',
      'list_entries',
      INPUTS.list_entries,
    )
    await env.DB.prepare('DELETE FROM members WHERE user_id = ?1').bind(userId).run()
    const logs = captureLogs()

    const after = await callRaw(
      worker.endpoint(tokens.access_token),
      'modern',
      'list_entries',
      INPUTS.list_entries,
    )

    expect([before.status, after.status]).toEqual([200, 401])
    expect(logs.entries()).toContainEqual(
      expect.objectContaining({ kind: 'auth_refused', reason: 'no_user' }),
    )
  })

  it('is refused by the deployment of another site, though it shares the KV and the URL', async () => {
    const [definition] = Object.values(CONFIG.sites ?? {})
    if (definition === undefined) throw new Error('the test config has no site')
    const other = boot({
      config: defineConfig({
        sites: { [OTHER_SITE_KEY]: definition },
        auth: { dynamicClientRegistration: true },
      }),
    })
    const { tokens } = await tokenFor(other, 'owner', OTHER_SITE_KEY)
    const logs = captureLogs()

    const response = await callRaw(
      boot().endpoint(tokens.access_token),
      'modern',
      'list_entries',
      INPUTS.list_entries,
    )

    expect(response.status).toBe(401)
    expect(logs.entries()).toContainEqual(expect.objectContaining({ reason: 'other_site' }))
  })

  it('is refused at /v1: it was issued for /mcp', async () => {
    const worker = boot({ config: WITH_REGISTRATION })
    const { tokens } = await tokenFor(worker, 'owner')

    const response = await worker.send('/v1/site', { token: tokens.access_token })

    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toContain('error="invalid_token"')
  })
})

describe("the admin's own routes and the tokens of other clients", () => {
  it('refuse a token of another client, even for /v1 with schema:admin, the admin alone may use', async () => {
    const worker = boot({ config: WITH_REGISTRATION })
    const person = await signedIn('owner')
    const clientId = await register(worker)
    const { verifier, challenge } = await pkce()
    const scope = `${ALL} schema:admin`
    const { handle, offered, cookies } = await consent(
      worker,
      clientId,
      challenge,
      person.cookie,
      scope,
      `${PUBLIC_URL}/v1`,
    )
    expect(offered).toContain('schema:admin')
    const redirect = await allow(worker, handle, cookies, ['content:read', 'schema:admin'])
    const code = new URL(redirect.headers.get('location') ?? '').searchParams.get('code') ?? ''
    const tokens = await exchange(worker, clientId, code, verifier, `${PUBLIC_URL}/v1`)

    const read = await worker.send('/v1/site', { token: tokens.access_token })
    const admin = await worker.send('/v1/admin/tokens', { token: tokens.access_token })

    expect(read.status).toBe(200)
    expect(admin.status).toBe(403)
    expect(await admin.json()).toMatchObject({ message: 'Only the admin may do this.' })
  })
})
