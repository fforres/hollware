import { describe, expect, it } from 'vite-plus/test'

import {
  AGENT_DEFAULT_SCOPES,
  AGENT_SCOPE_CEILING,
  isScope,
  SCOPES,
  withImplied,
} from '../src/scopes.ts'

describe('scopes', () => {
  it('are the four scopes of the design, that of owners and the two of reviews', () => {
    expect(SCOPES).toEqual([
      'content:read',
      'content:write',
      'content:publish',
      'schema:admin',
      'site:owner',
      'review:read',
      'review:comment',
    ])
  })

  it('isScope accepts each of them and nothing else', () => {
    expect(SCOPES.filter((scope) => isScope(scope))).toEqual(SCOPES)
    for (const value of ['content', 'content:*', 'Content:read', 'content:read ', 'admin', '']) {
      expect(isScope(value)).toBe(false)
    }
  })

  it('reads reviews with content:read and comments on them with content:write, as tokens of 1.0 did', () => {
    expect(withImplied(['content:read'])).toEqual(['content:read', 'review:read'])
    expect(withImplied(['content:write'])).toEqual(['content:write', 'review:comment'])
    expect(withImplied(['content:publish', 'schema:admin'])).toEqual([
      'content:publish',
      'schema:admin',
    ])
    expect(withImplied(['review:comment'])).toEqual(['review:comment'])
  })

  it('lets an agent ask for no more than an author has, and read and comment by default', () => {
    expect(AGENT_SCOPE_CEILING).toEqual([
      'content:read',
      'content:write',
      'review:read',
      'review:comment',
    ])
    expect(AGENT_DEFAULT_SCOPES).toEqual(['content:read', 'review:read', 'review:comment'])
  })
})
