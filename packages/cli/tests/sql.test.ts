import { describe, expect, it } from 'vite-plus/test'

import { UsageError } from '../src/errors.ts'
import {
  insertToken,
  parseDatabase,
  parseExpiresInDays,
  parseLabel,
  parseOwnerName,
  parseScopes,
  parseSiteKey,
  parseTokenId,
  quote,
} from '../src/sql.ts'

describe('quote', () => {
  it.each([
    ['plain', "'plain'"],
    ["it's", "'it''s'"],
    ["a'b'c'd", "'a''b''c''d'"],
    ["''", "''''''"],
    ["x'); DROP TABLE tokens; --", "'x''); DROP TABLE tokens; --'"],
    ['back\\slash and "double"', `'back\\slash and "double"'`],
    ['', "''"],
  ])('doubles every single quote of %j', (value, literal) => {
    expect(quote(value)).toBe(literal)
  })

  it('refuses a NUL character, which a SQL string cannot hold', () => {
    expect(() => quote('a\u0000b')).toThrow(TypeError)
  })
})

function skeleton(sql: string): string {
  return sql.replace(/'(?:[^']|'')*'/g, '?')
}

describe('a hostile label never changes the statement', () => {
  const benign = {
    id: 'tok_01JAB3XQ8ZK4M6N2P5R7S9T0VW',
    site: 'blog',
    userId: 'usr_01JAB3XQ8ZK4M6N2P5R7S9T0VW',
    hash: 'ab'.repeat(32),
    scopes: ['content:read'] as const,
    expiresAt: '2027-01-10T12:00:00.000Z',
    now: '2026-10-12T12:00:00.000Z',
  }
  const TEMPLATE =
    'INSERT INTO tokens (id, site_id, user_id, label, hash, scopes, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);'

  it.each([
    ["x'); DROP TABLE tokens; --", "'x''); DROP TABLE tokens; --'"],
    ["'; DELETE FROM users; --", "'''; DELETE FROM users; --'"],
    ["Robert'); DROP TABLE students;--", "'Robert''); DROP TABLE students;--'"],
    ["a''b", "'a''''b'"],
    ["' OR '1'='1", "''' OR ''1''=''1'"],
    ['"; DROP TABLE tokens; --', `'"; DROP TABLE tokens; --'`],
    ["'", "''''"],
    ["''''", "''''''''''"],
    ['\\', "'\\'"],
    ["\\'); DROP TABLE tokens; --", "'\\''); DROP TABLE tokens; --'"],
    ['/* x */ -- y', "'/* x */ -- y'"],
    ["it's", "'it''s'"],
  ])('%j stays inside its string literal', (label, literal) => {
    const sql = insertToken({ ...benign, label })
    expect(skeleton(sql)).toBe(TEMPLATE)
    expect(sql).toContain(`, ${literal}, '${'ab'.repeat(32)}', `)
  })
})

describe('a label', () => {
  it.each([
    ['ci', 'ci'],
    ["Sergio's laptop", "Sergio's laptop"],
    ['  trimmed  ', 'trimmed'],
    ["x'); DROP TABLE tokens; --", "x'); DROP TABLE tokens; --"],
    ['Zoë 🚀', 'Zoë 🚀'],
    ['a'.repeat(64), 'a'.repeat(64)],
    ['🚀'.repeat(64), '🚀'.repeat(64)],
  ])('accepts %j', (value, label) => {
    expect(parseLabel(value)).toBe(label)
  })

  it.each([
    ['nothing', ''],
    ['only spaces', '   '],
    ['65 characters', 'a'.repeat(65)],
    ['65 emoji', '🚀'.repeat(65)],
    ['a newline inside', 'a\nb'],
    ['a carriage return', 'a\rb'],
    ['a tab inside', 'a\tb'],
    ['a NUL', 'a\u0000b'],
    ['an escape sequence', '\u001B[31mred'],
    ['a delete character', 'a\u007Fb'],
    ['a right-to-left override', 'a\u202Eb'],
    ['a zero-width space', 'a\u200Bb'],
    ['a line separator', 'a\u2028b'],
    ['a lone surrogate', 'a\uD800b'],
  ])('rejects %s', (_what, value) => {
    expect(() => parseLabel(value)).toThrow(UsageError)
    expect(() => parseLabel(value)).toThrow(/^invalid --label /)
  })

  it('says what is allowed, with the value shown escaped', () => {
    expect(() => parseLabel('a\nb')).toThrow(
      'invalid --label "a\\nb": use 1 to 64 characters, with no control or invisible formatting characters.',
    )
  })

  it('shows an invisible character of the value as ?, so the message cannot act on the terminal', () => {
    expect(() => parseLabel('a\u202Eb')).toThrow(
      'invalid --label "a?b": use 1 to 64 characters, with no control or invisible formatting characters.',
    )
  })

  it('has the same rules for the name of an owner, up to 100 characters', () => {
    expect(parseOwnerName('a'.repeat(100))).toBe('a'.repeat(100))
    expect(() => parseOwnerName('a'.repeat(101))).toThrow(/^invalid --owner-name /)
    expect(() => parseOwnerName('a\nb')).toThrow(/^invalid --owner-name /)
  })
})

describe('parseSiteKey', () => {
  it.each(['blog', 'my-site', 'a1-b2', 'a'.repeat(64)])('accepts %s', (key) => {
    expect(parseSiteKey(key)).toBe(key)
  })

  it.each([
    '',
    'Blog',
    'my_site',
    '-blog',
    'blog-',
    'a--b',
    'a b',
    "x'; DROP TABLE users; --",
    'a'.repeat(65),
  ])('rejects %j', (key) => {
    expect(() => parseSiteKey(key)).toThrow(UsageError)
    expect(() => parseSiteKey(key)).toThrow(/^invalid --site /)
  })
})

describe('parseScopes', () => {
  it('reads a comma-separated list, with spaces allowed, in the order given and without repeats', () => {
    expect(parseScopes('content:write, content:read,content:write')).toEqual([
      'content:write',
      'content:read',
    ])
  })

  it.each(['', 'content:read,', 'content', 'CONTENT:READ', 'content:read,admin'])(
    'rejects %j and names the scope that is wrong',
    (value) => {
      expect(() => parseScopes(value)).toThrow(UsageError)
      expect(() => parseScopes(value)).toThrow(
        /^invalid --scopes: ".*" is not a scope\. Choose from content:read, content:write, content:publish, schema:admin, site:owner, review:read, review:comment\.$/,
      )
    },
  )
})

describe('parseExpiresInDays', () => {
  it.each([
    ['1', 1],
    ['90', 90],
    ['365', 365],
    ['007', 7],
  ])('accepts %s', (value, days) => {
    expect(parseExpiresInDays(value)).toBe(days)
  })

  it.each(['', '0', '366', '-1', '1.5', '1e2', ' 5', '5 ', 'ninety', '99999'])(
    'rejects %j',
    (value) => {
      expect(() => parseExpiresInDays(value)).toThrow(
        `invalid --expires-in-days ${JSON.stringify(value)}: use a whole number of days from 1 to 365.`,
      )
    },
  )
})

describe('parseTokenId', () => {
  it('accepts the id of a token', () => {
    expect(parseTokenId('tok_01JAB3XQ8ZK4M6N2P5R7S9T0VW')).toBe('tok_01JAB3XQ8ZK4M6N2P5R7S9T0VW')
  })

  it.each([
    '',
    'tok_x',
    'ent_01JAB3XQ8ZK4M6N2P5R7S9T0VW',
    'tok_01jab3xq8zk4m6n2p5r7s9t0vw',
    "tok_01JAB3XQ8ZK4M6N2P5R7S9T0VW' OR '1'='1",
    'tok_01JAB3XQ8ZK4M6N2P5R7S9T0VWX',
  ])('rejects %j', (value) => {
    expect(() => parseTokenId(value)).toThrow(UsageError)
    expect(() => parseTokenId(value)).toThrow(/^invalid token id /)
  })
})

describe('parseDatabase', () => {
  it.each(['DB', 'my-hollware', 'blog_db', 'a.b'])('accepts %s', (name) => {
    expect(parseDatabase(name)).toBe(name)
  })

  it.each(['', '-DB', '--help', 'a b', '../x', 'a/b', 'x'.repeat(129)])('rejects %j', (name) => {
    expect(() => parseDatabase(name)).toThrow(/^invalid --database /)
  })
})
