import { describe, expect, it } from 'vite-plus/test'

import {
  agentForm,
  agentFormProblems,
  agentOf,
  agentStatusColor,
  canSendAgain,
  clientBadge,
  deliveryState,
  emptyAgentForm,
  isAgentComment,
  isAgentUrl,
  managesSite,
  needsSecret,
  withAgent,
  withoutAgent,
  type AgentForm,
} from '../app/lib/agents.ts'

const form = (over: Partial<AgentForm> = {}): AgentForm => ({
  ...emptyAgentForm('usr_1'),
  name: 'reviewer',
  url: 'https://agents.example.org/hook',
  ...over,
})

describe('the subscription an agent form saves', () => {
  it('leaves out a secret left empty and the scopes when they are the default ones', () => {
    expect(agentOf(form({ name: ' reviewer ', secret: '  ' }))).toEqual({
      name: 'reviewer',
      member: 'usr_1',
      events: ['review.requested'],
      delivery: { kind: 'webhook', url: 'https://agents.example.org/hook' },
      required: false,
    })
  })

  it('names the secret, the binding and scopes other than the default ones, in their order', () => {
    expect(
      agentOf(
        form({
          events: ['entry.published', 'review.requested'],
          secret: 'AGENT_SECRET',
          scopes: ['review:comment', 'content:write', 'content:read', 'review:read'],
          required: true,
        }),
      ),
    ).toEqual({
      name: 'reviewer',
      member: 'usr_1',
      events: ['review.requested', 'entry.published'],
      delivery: {
        kind: 'webhook',
        url: 'https://agents.example.org/hook',
        secret: 'AGENT_SECRET',
      },
      scopes: ['content:read', 'content:write', 'review:read', 'review:comment'],
      required: true,
    })
    expect(agentOf(form({ kind: 'binding', binding: 'AGENTS' })).delivery).toEqual({
      kind: 'binding',
      binding: 'AGENTS',
    })
  })

  it('reads back as the form it was saved from', () => {
    expect(
      agentForm({
        name: 'translator',
        member: 'usr_2',
        events: ['entry.published'],
        delivery: { kind: 'binding', binding: 'AGENTS' },
        required: true,
      }),
    ).toEqual({
      name: 'translator',
      member: 'usr_2',
      events: ['entry.published'],
      kind: 'binding',
      url: '',
      secret: '',
      binding: 'AGENTS',
      scopes: ['content:read', 'review:read', 'review:comment'],
      required: true,
    })
  })
})

describe('what is wrong with an agent form', () => {
  const members = ['usr_1']

  it('is nothing for a webhook over https, or over http on the machine itself', () => {
    expect(agentFormProblems(form(), [], members)).toEqual([])
    expect(agentFormProblems(form({ url: 'http://localhost:8787/' }), [], members)).toEqual([])
  })

  it('names each field to fix', () => {
    expect(
      agentFormProblems(
        form({
          name: 'Reviewer',
          member: 'usr_9',
          events: [],
          url: 'http://agents.example.org',
          secret: 'agent-secret',
          scopes: [],
        }),
        [],
        members,
      ),
    ).toEqual(['name', 'member', 'events', 'url', 'secret', 'scopes'])
    expect(
      agentFormProblems(
        form({ kind: 'binding', binding: 'agents', url: '' }),
        ['reviewer'],
        members,
      ),
    ).toEqual(['nameTaken', 'binding'])
  })
})

describe('an https URL for an agent', () => {
  it('takes http on a loopback host only', () => {
    expect(
      [
        'https://a.example',
        'http://127.0.0.1:8787',
        'http://[::1]/',
        'http://a.example',
        'ftp://a.example',
        'nope',
      ].map(isAgentUrl),
    ).toEqual([true, true, true, false, false, false])
  })
})

describe('the list of subscriptions', () => {
  const list = [{ name: 'a' }, { name: 'b' }, { name: 'c' }]

  it('adds a new one at the end, and keeps the place of one edited under a new name', () => {
    expect(withAgent(list, { name: 'd' }, null)).toEqual([...list, { name: 'd' }])
    expect(withAgent(list, { name: 'z' }, 'b')).toEqual([
      { name: 'a' },
      { name: 'z' },
      { name: 'c' },
    ])
    expect(withoutAgent(list, 'a')).toEqual([{ name: 'b' }, { name: 'c' }])
  })

  it('asks for a secret only for a webhook that names none', () => {
    const base = { name: 'a', member: 'usr_1', events: ['site.changed' as const], required: false }
    expect([
      needsSecret({ ...base, delivery: { kind: 'webhook', url: 'https://a.example' } }),
      needsSecret({
        ...base,
        delivery: { kind: 'webhook', url: 'https://a.example', secret: 'S' },
      }),
      needsSecret({ ...base, delivery: { kind: 'binding', binding: 'AGENTS' } }),
    ]).toEqual([true, false, false])
  })
})

describe('the deliveries to agents', () => {
  const row = {
    event: 'evt_1',
    kind: 'review.requested',
    agent: 'reviewer',
    attempts: 2,
    deliveredAt: null,
    lastError: null,
    triedAt: '2026-10-29T10:00:00Z',
    abandonedAt: null,
  }

  it('are delivered, retrying or given up, and only an undelivered one is sent again', () => {
    const delivered = { ...row, deliveredAt: '2026-10-29T10:01:00Z' }
    const abandoned = { ...row, abandonedAt: '2026-10-29T11:00:00Z' }
    expect([delivered, row, abandoned].map(deliveryState)).toEqual([
      'delivered',
      'retrying',
      'abandoned',
    ])
    expect([delivered, row, abandoned].map(canSendAgain)).toEqual([false, true, true])
  })
})

describe('agents on a review', () => {
  it('colour each status', () => {
    expect((['queued', 'commented', 'failed'] as const).map(agentStatusColor)).toEqual([
      'neutral',
      'success',
      'error',
    ])
  })

  it('wrote a comment when its author is an agent, or its client the legacy agents', () => {
    expect([
      isAgentComment({ authorKind: 'agent', client: null }),
      isAgentComment({ authorKind: 'person', client: 'hollware-agents' }),
      isAgentComment({ authorKind: 'person', client: 'claude' }),
    ]).toEqual([true, true, false])
  })

  it('show the client of a comment, but not the admin nor the legacy agents', () => {
    expect(
      [null, 'hollware-admin', 'hollware-agents', 'claude'].map((client) =>
        clientBadge({ client }),
      ),
    ).toEqual([null, null, null, 'claude'])
  })
})

describe('who runs the site', () => {
  it('is whoever may change it, an owner or an admin', () => {
    expect([
      managesSite({ scopes: ['content:read', 'schema:admin'] }),
      managesSite({ scopes: ['content:read', 'content:publish'] }),
      managesSite(null),
    ]).toEqual([true, false, false])
  })
})
