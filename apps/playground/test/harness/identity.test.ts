import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test'

import { softAuthenticator } from '../../../../packages/server/tests/support/authenticator.ts'
import { migrate, seedOwnerToken, SITE_KEY } from './support.ts'
import { createPlaygroundHarness, HOLLWARE_URL, HOLLWARE_WORKER } from './workers.ts'

const server = createPlaygroundHarness()
const INVITATION = 'hw_inv_acceptanceacceptanceacceptanceacceptance1234'

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function ceremonyOf(response: { json(): Promise<unknown> }) {
  const body: unknown = await response.json()
  if (
    typeof body !== 'object' ||
    body === null ||
    !('challengeId' in body) ||
    !('options' in body)
  ) {
    throw new Error(`no ceremony: ${JSON.stringify(body)}`)
  }
  const { challengeId, options } = body
  if (typeof challengeId !== 'string' || typeof options !== 'object' || options === null) {
    throw new Error(`no ceremony: ${JSON.stringify(body)}`)
  }
  const challenge = 'challenge' in options ? String(options.challenge) : ''
  const user =
    'user' in options &&
    typeof options.user === 'object' &&
    options.user !== null &&
    'id' in options.user
      ? String(options.user.id)
      : ''
  return { challengeId, options: { challenge, user: { id: user } } }
}

function post(path: string, body: object) {
  return server.fetch(`${HOLLWARE_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: HOLLWARE_URL },
    body: JSON.stringify(body),
  })
}

beforeAll(async () => {
  await server.listen()
  await migrate(server)
  await seedOwnerToken(server)
  const { DB } = await server
    .getWorker<{
      DB: { prepare(sql: string): { bind(...values: unknown[]): { run(): Promise<unknown> } } }
    }>(HOLLWARE_WORKER)
    .getEnv()
  await DB.prepare(
    `INSERT INTO invitations (id, site_id, hash, role, user_id, email, expires_at, used_at, created_at, updated_at)
      VALUES ('inv_01JAB3XQ8ZK4M6N2P5R7S9T0VW', ?1, ?2, 'author', NULL, 'ana@example.org', '2099-01-01T00:00:00.000Z', NULL, ?3, ?3)`,
  )
    .bind(SITE_KEY, await sha256(INVITATION), new Date().toISOString())
    .run()
})

afterAll(async () => {
  await server.close()
})

describe('identity over HTTP', () => {
  it('serves the setup page under a policy that frames nothing and runs only its own script', async () => {
    const page = await server.fetch(`${HOLLWARE_URL}/setup?invitation=${INVITATION}`)
    const policy = page.headers.get('content-security-policy') ?? ''

    expect(page.status).toBe(200)
    expect(policy).toContain("frame-ancestors 'none'")
    expect(policy).toMatch(/script-src 'nonce-[0-9a-f]{32}'/)
    expect(await page.text()).not.toContain(INVITATION)
  })

  it('registers a passkey through an invitation, once, and signs in with it', async () => {
    const authenticator = await softAuthenticator(HOLLWARE_URL)
    const options = await ceremonyOf(
      await post('/auth/register/options', { invitation: INVITATION }),
    )
    const registered = await post('/auth/register/verify', {
      challengeId: options.challengeId,
      response: await authenticator.register(options.options),
      name: 'Ada',
      label: 'Laptop',
    })
    const again = await post('/auth/register/options', { invitation: INVITATION })
    const signIn = await ceremonyOf(await post('/auth/signin/options', {}))
    const signedIn = await post('/auth/signin/verify', {
      challengeId: signIn.challengeId,
      response: await authenticator.authenticate(signIn.options),
    })

    const cookie = registered.headers.get('set-cookie') ?? ''
    expect(registered.status).toBe(200)
    expect(cookie).toMatch(
      /^hollware_session=hw_ses_[A-Za-z0-9_-]{43}; HttpOnly; Secure; SameSite=Lax; Path=\/authorize;/,
    )
    expect(again.status).toBe(400)
    expect([
      signedIn.status,
      signedIn.headers.get('set-cookie')?.startsWith('hollware_session=hw_ses_'),
    ]).toEqual([200, true])
  })
})
