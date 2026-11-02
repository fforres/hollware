import { env } from 'cloudflare:workers'
import type { Role } from '../../src/auth/roles.ts'
import { connect } from '../../src/db/d1.ts'
import { createSession } from '../../src/identity/store.ts'
import { seedToken } from '../auth/support.ts'
import { NOW, SITE_KEY, type Booted } from './support.ts'

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export async function adminToken(
  worker: Booted,
  role: Role,
  alsoEditorOf: readonly string[] = [],
): Promise<string> {
  return (await adminPerson(worker, role, alsoEditorOf)).access
}

export async function adminPerson(
  worker: Booted,
  role: Role,
  alsoEditorOf: readonly string[] = [],
): Promise<{ access: string; userId: string; token: string }> {
  const { userId, token } = await seedToken(env.DB, SITE_KEY, { role })
  for (const site of alsoEditorOf) {
    await env.DB.prepare(
      'INSERT OR IGNORE INTO sites (id, created_at, updated_at) VALUES (?1, ?2, ?2)',
    )
      .bind(site, NOW)
      .run()
    await env.DB.prepare(
      "INSERT INTO members (id, site_id, user_id, role, created_at, updated_at) VALUES (?1, ?2, ?3, 'editor', ?4, ?4)",
    )
      .bind(`mem_${crypto.randomUUID()}`, site, userId, NOW)
      .run()
  }
  const session = await createSession(connect(env.DB), {
    userId,
    now: new Date(NOW),
    hours: 12,
  })
  const admin = await (
    await worker.send('/admin/config.json')
  ).json<{
    clientId: string
    redirectUri: string
    resource: string
    scope: string
  }>()
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)))
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: admin.clientId,
    redirect_uri: admin.redirectUri,
    scope: admin.scope,
    state: 's',
    code_challenge: base64url(new Uint8Array(digest)),
    code_challenge_method: 'S256',
    resource: admin.resource,
  })
  const redirect = await worker.send(`/authorize?${query.toString()}`, {
    headers: { cookie: `hollware_session=${session.secret}` },
  })
  const code = new URL(redirect.headers.get('location') ?? '').searchParams.get('code') ?? ''
  const tokens = await worker.send('/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: admin.redirectUri,
      client_id: admin.clientId,
      code_verifier: verifier,
      resource: admin.resource,
    }).toString(),
  })
  return { access: (await tokens.json<{ access_token: string }>()).access_token, userId, token }
}

export function call(worker: Booted, token: string, path: string, body?: unknown) {
  return worker.send(path, {
    method: body === undefined ? 'GET' : 'POST',
    token,
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  })
}
