import { describe, expect, it } from 'vite-plus/test'
import { scopesFor, tokenRequest } from '../app/lib/tokens.ts'

const PERSONAL = {
  label: 'Agent',
  read: false,
  scopes: ['content:read', 'content:write'],
  days: undefined,
  never: false,
}

describe('the request that makes a token', () => {
  it('leaves the days to the server for a personal token, which then expires after 90', () => {
    expect(tokenRequest(PERSONAL)).toEqual({
      label: 'Agent',
      scopes: ['content:read', 'content:write'],
    })
  })

  it('asks for the days given, and for no expiry only when the person ticks it', () => {
    expect(tokenRequest({ ...PERSONAL, days: 30 })).toEqual({
      label: 'Agent',
      scopes: ['content:read', 'content:write'],
      expiresInDays: 30,
    })
    expect(tokenRequest({ ...PERSONAL, days: 30, never: true })).toEqual({
      label: 'Agent',
      scopes: ['content:read', 'content:write'],
      expiresInDays: null,
    })
  })

  it('makes a read token with no scopes of its own, and ignores the tick of no expiry', () => {
    expect(tokenRequest({ ...PERSONAL, label: 'Site', read: true, never: true })).toEqual({
      label: 'Site',
      kind: 'read',
    })
    expect(tokenRequest({ ...PERSONAL, label: 'Site', read: true, days: 7 })).toEqual({
      label: 'Site',
      kind: 'read',
      expiresInDays: 7,
    })
  })

  it('sends no days for a field left empty, at zero or with a fraction', () => {
    for (const days of [undefined, 0, -3, 2.5]) {
      expect(tokenRequest({ ...PERSONAL, days })).not.toHaveProperty('expiresInDays')
    }
  })
})

describe('a token for an agent member', () => {
  it('names the member, keeps only the scopes an agent may hold, and is never a read token', () => {
    expect(
      tokenRequest({
        ...PERSONAL,
        read: true,
        member: 'usr_01M66Q4Y3VA9JW082W47YN3MM0',
        scopes: ['content:read', 'content:write', 'content:publish', 'schema:admin'],
      }),
    ).toEqual({
      label: 'Agent',
      scopes: ['content:read', 'content:write'],
      member: 'usr_01M66Q4Y3VA9JW082W47YN3MM0',
    })
  })

  it('offers an agent the four scopes of an author, and a person all seven', () => {
    expect([scopesFor('usr_01M66Q4Y3VA9JW082W47YN3MM0'), scopesFor(null).length]).toEqual([
      ['content:read', 'content:write', 'review:read', 'review:comment'],
      7,
    ])
  })
})

describe('the end of a token', () => {
  it('ends at the start of the day chosen, before any number of days, and never wins over both', () => {
    expect(tokenRequest({ ...PERSONAL, days: 30, until: '2027-06-30' })).toEqual({
      label: 'Agent',
      scopes: ['content:read', 'content:write'],
      expiresAt: '2027-06-30T00:00:00.000Z',
    })
    expect(tokenRequest({ ...PERSONAL, until: '2027-06-30', never: true }).expiresInDays).toBeNull()
    expect(tokenRequest({ ...PERSONAL, until: '30/06/2027' })).not.toHaveProperty('expiresAt')
  })
})
