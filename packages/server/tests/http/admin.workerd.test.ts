import { afterEach, describe, expect, it, vi } from 'vitest'

import { boot, PUBLIC_URL } from './support.ts'

const PAGE = '<!doctype html><title>Hollware</title><div id="app"></div>'

function assets() {
  const asked: string[] = []
  const fetcher = {
    fetch: async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      asked.push(url.pathname)
      if (url.pathname === '/admin/') {
        return new Response(PAGE, { headers: { 'content-type': 'text/html' } })
      }
      if (url.pathname === '/admin/favicon.svg') {
        return new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } })
      }
      return new Response('not here', { status: 404 })
    },
    connect: () => {
      throw new Error('no sockets here')
    },
  }
  return { fetcher, asked }
}

describe('the admin', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('serves its page, at every path of the app, with a policy that frames nothing', async () => {
    const { fetcher, asked } = assets()
    const worker = boot({ assets: fetcher })

    const root = await worker.send('/admin/')
    const deep = await worker.send('/admin/entries/ent_01JAB3XQ8ZK4M6N2P5R7S9T0VW')

    for (const response of [root, deep]) {
      expect(response.status).toBe(200)
      expect(await response.text()).toBe(PAGE)
      expect(Object.fromEntries(response.headers)).toMatchObject({
        'content-security-policy':
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; font-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
        'cross-origin-opener-policy': 'same-origin',
        'cross-origin-resource-policy': 'same-origin',
        'permissions-policy':
          'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=()',
        'strict-transport-security': 'max-age=31536000',
        'x-content-type-options': 'nosniff',
        'x-robots-tag': 'noindex, nofollow',
      })
    }
    expect(asked).toEqual(['/admin/', '/admin/'])
  })

  it('lives at the root of its origin with path /, and sends /admin there', async () => {
    const { fetcher, asked } = assets()
    const worker = boot({ assets: fetcher, admin: { path: '/' } })

    const pages = await Promise.all(
      [
        '/',
        '/entries',
        '/entries/blog/en/hello',
        '/reviews',
        '/images',
        '/settings/site',
        '/callback',
      ].map((path) => worker.send(path)),
    )
    const moved = await Promise.all(
      ['/admin', '/admin/', '/admin/settings/tokens?member=usr_1'].map((path) => worker.send(path)),
    )
    const file = await worker.send('/admin/favicon.svg')
    const config = await (await worker.send('/admin/config.json')).json()

    expect(pages.map((page) => page.status)).toEqual([200, 200, 200, 200, 200, 200, 200])
    expect(pages[0]?.headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
    expect(asked.filter((path) => path === '/admin/')).toHaveLength(7)
    expect(moved.map((answer) => [answer.status, answer.headers.get('location')])).toEqual([
      [301, '/'],
      [301, '/'],
      [301, '/settings/tokens?member=usr_1'],
    ])
    expect([file.status, await file.text()]).toEqual([200, '<svg/>'])
    expect(config).toMatchObject({ redirectUri: `${PUBLIC_URL}/callback` })
  })

  it('registers another client when a deployment moves its admin to the root, whose callback is /callback', async () => {
    const before = await (
      await boot({ assets: assets().fetcher }).send('/admin/config.json')
    ).json()
    const after = await (
      await boot({ assets: assets().fetcher, admin: { path: '/' } }).send('/admin/config.json')
    ).json()

    expect([before, after]).toMatchObject([
      { redirectUri: `${PUBLIC_URL}/admin/callback` },
      { redirectUri: `${PUBLIC_URL}/callback` },
    ])
    expect(Reflect.get(Object(after), 'clientId')).not.toBe(Reflect.get(Object(before), 'clientId'))
  })

  it('serves at the root every first segment of the routes of the admin app', async () => {
    const source = await import('../../../admin/app/main.ts?raw').then((module) =>
      String(module.default),
    )
    const first = new Set([...source.matchAll(/path: '(\/[a-z]+)/g)].map((match) => match[1]))
    const { ROOT_PAGES } = await import('../../src/http/admin.ts')

    expect([...first].filter((segment) => !ROOT_PAGES.includes(segment ?? ''))).toEqual([])
  })

  it('says nothing of HTTPS when the public URL is http, as in local development', async () => {
    const { fetcher } = assets()
    const worker = boot({ assets: fetcher, publicUrl: 'http://localhost' })

    const page = await worker.send('/admin/', { host: 'localhost' })

    expect([page.status, page.headers.has('strict-transport-security')]).toEqual([200, false])
    expect(page.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('passes a file of the build on as it is, and says when the admin is not installed', async () => {
    const { fetcher } = assets()
    const installed = boot({ assets: fetcher })
    const bare = boot()

    const file = await installed.send('/admin/favicon.svg')
    const missing = await bare.send('/admin/')

    expect([file.status, await file.text()]).toEqual([200, '<svg/>'])
    expect(missing.status).toBe(404)
    expect(await missing.json()).toMatchObject({ code: 'not_found' })
  })

  it("serves the favicon of the config from its own origin, for every icon, and Hollware's without one", async () => {
    const remote = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input instanceof Request ? input.url : input)
      return url === 'https://brand.example/icon.png'
        ? new Response('png', { headers: { 'content-type': 'image/png' } })
        : new Response('<html>', { headers: { 'content-type': 'text/html' } })
    })
    const { fetcher, asked } = assets()
    const branded = boot({ assets: fetcher, admin: { favicon: 'https://brand.example/icon.png' } })
    const plain = boot({ assets: fetcher })

    const icons = await Promise.all(
      ['/admin/favicon.ico', '/admin/favicon.svg', '/admin/apple-touch-icon.png'].map((path) =>
        branded.send(path),
      ),
    )
    const own = await plain.send('/admin/favicon.svg')

    for (const icon of icons) {
      expect([icon.status, await icon.text()]).toEqual([200, 'png'])
      expect(Object.fromEntries(icon.headers)).toMatchObject({
        'content-type': 'image/png',
        'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        'x-content-type-options': 'nosniff',
      })
    }
    expect(await own.text()).toBe('<svg/>')
    expect(asked).toEqual(['/admin/favicon.svg'])
    expect(remote).toHaveBeenCalledTimes(3)
  })

  it('answers 404 when the favicon of the config is not an image', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html>', { headers: { 'content-type': 'text/html' } }),
    )
    const worker = boot({ admin: { favicon: 'https://brand.example/page' } })

    const icon = await worker.send('/admin/favicon.ico')

    expect([icon.status, await icon.text()]).toEqual([404, ''])
  })

  it('names its own client, the same one each time, and asks for /v1', async () => {
    const worker = boot()

    const first = await (await worker.send('/admin/config.json')).json<Record<string, string>>()
    const second = await (await worker.send('/admin/config.json')).json<Record<string, string>>()

    expect(first).toEqual({
      issuer: PUBLIC_URL,
      clientId: expect.stringMatching(/^[\w-]{16}$/),
      redirectUri: `${PUBLIC_URL}/admin/callback`,
      resource: `${PUBLIC_URL}/v1`,
      scope:
        'content:read content:write content:publish schema:admin site:owner review:read review:comment',
    })
    expect(second.clientId).toBe(first.clientId)
  })
})
