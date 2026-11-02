import { expect, it } from 'vite-plus/test'

import { OPERATIONS } from '@hollware/core'
import { ApiError, createApi, READS } from '../app/lib/api.ts'
import type { Auth } from '../app/lib/auth.ts'

function world(answer: () => Response) {
  const sent: { url: string; method: string; authorization: string | null; body: string }[] = []
  const signIns: string[] = []
  let forgotten = false
  let writes = 0
  const auth: Auth = {
    signIn: async (returnTo) => void signIns.push(returnTo),
    switchSite: async (_site, returnTo) => void signIns.push(returnTo),
    complete: async () => '/',
    token: async () => 'access-1',
    forget: () => {
      forgotten = true
    },
    signOut: async () => {
      throw new Error('the api never signs out')
    },
  }
  const api = createApi({
    fetch: async (input, init) => {
      sent.push({
        url: typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
        method: init?.method ?? 'GET',
        authorization: new Headers(init?.headers).get('authorization'),
        body:
          typeof init?.body === 'string'
            ? init.body
            : init?.body instanceof Blob
              ? `a file of ${init.body.size} bytes`
              : '',
      })
      return answer()
    },
    auth,
    here: () => '/admin/reviews',
    written: () => {
      writes++
    },
  })
  return { api, sent, signIns, forgotten: () => forgotten, writes: () => writes }
}

it('calls an operation and an admin route with the token', async () => {
  const w = world(() => Response.json({ outcome: 'ok', reviews: [] }))

  await w.api.call('list_reviews', { status: 'pending' })
  await w.api.admin('tokens')
  await w.api.admin('invitations', { role: 'author' })
  await w.api.adminDelete('agents/usr_1')

  expect(w.sent).toEqual([
    {
      url: '/v1/ops/list_reviews',
      method: 'POST',
      authorization: 'Bearer access-1',
      body: '{"status":"pending"}',
    },
    { url: '/v1/admin/tokens', method: 'GET', authorization: 'Bearer access-1', body: '' },
    {
      url: '/v1/admin/invitations',
      method: 'POST',
      authorization: 'Bearer access-1',
      body: '{"role":"author"}',
    },
    { url: '/v1/admin/agents/usr_1', method: 'DELETE', authorization: 'Bearer access-1', body: '' },
  ])
})

it('fetches a file of the admin with the token, and reads it as it is', async () => {
  const w = world(() => new Response('a,b\r\n1,2\r\n', { headers: { 'content-type': 'text/csv' } }))

  const file = await w.api.file('activity.csv?action=publish')

  expect(await file.text()).toBe('a,b\r\n1,2\r\n')
  expect(w.sent).toEqual([
    {
      url: '/v1/admin/activity.csv?action=publish',
      method: 'GET',
      authorization: 'Bearer access-1',
      body: '',
    },
  ])
})

it('sends the person to sign in again on a 401, back to where they were', async () => {
  const w = world(() => new Response(null, { status: 401 }))

  void w.api.admin('tokens')
  await new Promise((resolve) => setTimeout(resolve, 0))

  expect(w.forgotten()).toBe(true)
  expect(w.signIns).toEqual(['/admin/reviews'])
})

it('answers an error in words as an ApiError, with its code and its fix', async () => {
  const w = world(() =>
    Response.json(
      { code: 'forbidden', message: 'Only the admin may do this.', fix: 'Sign in.' },
      { status: 403 },
    ),
  )

  await expect(w.api.admin('tokens')).rejects.toEqual(
    new ApiError('forbidden', 'Only the admin may do this.', 'Sign in.'),
  )
  await expect(w.api.admin('tokens')).rejects.toMatchObject({ code: 'forbidden', fix: 'Sign in.' })
})

it('streams a file to PUT /v1/assets, named in the query, and tells of the write', async () => {
  const w = world(() => Response.json({ outcome: 'created' }, { status: 201 }))

  const answer = await w.api.upload(new Blob(['%PDF-1.7 abc']), {
    filename: 'the policy.pdf',
    alt: 'Policy & terms',
  })

  expect(answer).toEqual({ outcome: 'created' })
  expect(w.sent).toEqual([
    {
      url: '/v1/assets?filename=the+policy.pdf&alt=Policy+%26+terms',
      method: 'PUT',
      authorization: 'Bearer access-1',
      body: 'a file of 12 bytes',
    },
  ])
  expect(w.writes()).toBe(1)
})

it('answers a refused upload with the problem the server gives', async () => {
  const w = world(() =>
    Response.json(
      {
        outcome: 'refused',
        problem: {
          message: 'The file is 300 bytes, more than the 200 the site takes.',
          fix: 'Make it smaller.',
        },
      },
      { status: 413 },
    ),
  )

  await expect(w.api.upload(new Blob(['x']), { filename: 'a.mp4', alt: 'A' })).rejects.toEqual(
    new ApiError(
      'internal',
      'The file is 300 bytes, more than the 200 the site takes.',
      'Make it smaller.',
    ),
  )
})

it('tells of every write once it is done, and of no read, so what the admin shows is read again', async () => {
  const w = world(() => Response.json({ outcome: 'ok' }))
  await w.api.call('list_reviews', { status: 'pending' })
  await w.api.admin('tokens')
  await w.api.file('assets/ast_1')
  expect(w.writes()).toBe(0)
  await w.api.call('approve_review', { id: 'rvw_01J0000000000000000000000A' })
  await w.api.admin('tokens/tok_1/revoke', {})
  await w.api.adminDelete('webhooks/whk_1')
  expect(w.writes()).toBe(3)

  const failing = world(() => Response.json({ code: 'conflict' }, { status: 409 }))
  await expect(failing.api.call('publish', { id: 'ent_1', version: 1 })).rejects.toThrow()
  expect(failing.writes()).toBe(0)
})

it('reads only the operations that core says read', () => {
  expect(
    OPERATIONS.filter((operation) => operation.effect === 'read')
      .map((operation) => operation.name)
      .sort(),
  ).toEqual([...READS].sort())
})
