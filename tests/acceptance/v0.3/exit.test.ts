import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test'

import {
  agentWith,
  createPlaygroundHarness,
  migrate,
  seedOwnerToken,
  SITE_KEY,
  siteFetch,
} from '../v0.1/support/harness.ts'
import {
  accessToken,
  adminCall,
  entryOf,
  ownerSetupLink,
  register,
  reviewsOf,
} from './support/people.ts'

const server = createPlaygroundHarness()

const POST = (title: string, group: string) =>
  [
    '---',
    `title: ${title}`,
    'description: A post that the acceptance suite writes, short and plain.',
    'date: 2026-10-15',
    'tags:',
    '  - acceptance',
    `translationGroup: ${group}`,
    '---',
    '',
    `# ${title}`,
    '',
    'Plain words, one idea, and nothing that links anywhere.',
    '',
  ].join('\n')

let owner: { cookie: string; admin: string }

beforeAll(async () => {
  await server.listen()
  await migrate(server)
  await seedOwnerToken(server)
  const cookie = await register(server, await ownerSetupLink(server, SITE_KEY), 'Olga')
  owner = { cookie, admin: await accessToken(server, cookie, 'v1') }
})

afterAll(async () => {
  await server.close()
})

describe('AC-0.3-2: an author writes through an agent, and the owner approves in the admin', () => {
  it('asks for a review, which the owner approves, and the site serves the post', async () => {
    const invited = await adminCall(server, owner.admin, '/v1/admin/invitations', {
      role: 'author',
      email: 'ana@example.org',
    })
    const link = new URL(String(invited.body['link']))
    const invitation = new URLSearchParams(link.hash.slice(1)).get('invitation') ?? ''
    const author = await register(server, invitation, 'Ana')
    const agent = agentWith(server, await accessToken(server, author, 'mcp'))

    const es = await agent.call('create_draft', {
      collection: 'blog',
      locale: 'es',
      slug: 'escrito-por-un-agente',
      markdown: POST('Escrito por un agente', 'written-by-an-agent'),
    })
    await agent.call('create_draft', {
      collection: 'blog',
      locale: 'en',
      slug: 'written-by-an-agent',
      markdown: POST('Written by an agent', 'written-by-an-agent'),
    })
    const entry = entryOf(es.output)
    const checked = await agent.call('validate', {
      collection: 'blog',
      locale: 'es',
      slug: 'escrito-por-un-agente',
      markdown: POST('Escrito por un agente', 'written-by-an-agent'),
    })
    const asked = await agent.call('publish', { id: entry.id, version: entry.version })
    const queue = await adminCall(server, owner.admin, '/v1/ops/list_reviews', {})
    const reviews = reviewsOf(queue.body)
    const approved = await adminCall(server, owner.admin, '/v1/ops/approve_review', {
      id: reviews[0]?.id,
    })
    const page = await siteFetch(server, '/blog/escrito-por-un-agente/')

    expect(invited.status).toBe(201)
    expect(checked.output['verdict']).toMatchObject({ ok: true })
    expect(asked.output).toMatchObject({ outcome: 'pending_review', review: { status: 'pending' } })
    expect(reviews.map((review) => review.requestedByName)).toEqual(['Ana'])
    expect(approved.body).toMatchObject({
      outcome: 'published',
      review: { status: 'approved' },
      entry: { status: 'published' },
    })
    expect(page.status).toBe(200)
    expect(await page.text()).toContain('Escrito por un agente')
  })
})

describe('AC-0.3-3: a person alone', () => {
  it('writes a post in the admin and publishes it, with no personal token', async () => {
    const make = (locale: string, slug: string, title: string) =>
      adminCall(server, owner.admin, '/v1/ops/create_draft', {
        collection: 'blog',
        locale,
        slug,
        markdown: POST(title, 'from-the-admin'),
      })
    const es = await make('es', 'desde-el-admin', 'Desde el admin')
    await make('en', 'from-the-admin', 'From the admin')
    const entry = entryOf(es.body)

    const published = await adminCall(server, owner.admin, '/v1/ops/publish', {
      id: entry.id,
      version: entry.version,
    })
    const page = await siteFetch(server, '/blog/desde-el-admin/')

    expect(published.body).toMatchObject({ outcome: 'published' })
    expect(page.status).toBe(200)
  })
})
