import { SCOPES, type Scope } from '@hollware/core'
import { describe, expect, it } from 'vite-plus/test'

import {
  effectiveScopes,
  isRole,
  legacyRoleOf,
  mayAssign,
  ROLE_SCOPES,
  ROLES,
} from '../../src/auth/roles.ts'

describe('ROLE_SCOPES', () => {
  it('gives the owner every scope, an admin all but site:owner, an editor the content, an author all but publishing and a reviewer reading and comments', () => {
    expect(ROLES).toEqual(['owner', 'admin', 'editor', 'author', 'reviewer'])
    expect(ROLE_SCOPES).toEqual({
      owner: [
        'content:read',
        'content:write',
        'content:publish',
        'schema:admin',
        'site:owner',
        'review:read',
        'review:comment',
      ],
      admin: [
        'content:read',
        'content:write',
        'content:publish',
        'schema:admin',
        'review:read',
        'review:comment',
      ],
      editor: ['content:read', 'content:write', 'content:publish', 'review:read', 'review:comment'],
      author: ['content:read', 'content:write', 'review:read', 'review:comment'],
      reviewer: ['content:read', 'review:read', 'review:comment'],
    })
  })

  it('leaves out no scope of the catalog for the owner, so a new scope is a decision', () => {
    const left: Scope[] = SCOPES.filter((scope) => !ROLE_SCOPES.owner.includes(scope))
    expect(left).toEqual([])
  })
})

describe('isRole', () => {
  it('knows the roles and nothing else', () => {
    expect(ROLES.every((role) => isRole(role))).toBe(true)
    for (const other of ['', 'Owner', 'superadmin', 'constructor', '__proto__', 'toString']) {
      expect(isRole(other)).toBe(false)
    }
  })
})

describe('effectiveScopes', () => {
  it('keeps what the token carries and the role allows, in the order of the role', () => {
    expect(effectiveScopes('owner', ['review:comment', 'schema:admin'])).toEqual([
      'schema:admin',
      'review:comment',
    ])
    expect(effectiveScopes('owner', ['schema:admin'])).toEqual(['schema:admin'])
    expect(effectiveScopes('owner', [])).toEqual([])
  })

  it('gives a token of 1.0 the review scopes its content scopes imply', () => {
    expect(effectiveScopes('author', ['content:write', 'content:read'])).toEqual([
      'content:read',
      'content:write',
      'review:read',
      'review:comment',
    ])
    expect(effectiveScopes('owner', ['content:read'])).toEqual(['content:read', 'review:read'])
  })

  it('lists a scope once, whatever the token says', () => {
    expect(effectiveScopes('owner', ['review:read', 'review:read'])).toEqual(['review:read'])
  })

  it('takes away what the role does not allow', () => {
    expect(effectiveScopes('editor', [...SCOPES])).toEqual([
      'content:read',
      'content:write',
      'content:publish',
      'review:read',
      'review:comment',
    ])
    expect(effectiveScopes('author', [...SCOPES])).toEqual([
      'content:read',
      'content:write',
      'review:read',
      'review:comment',
    ])
  })

  it('grants nothing to a role it does not know', () => {
    for (const role of ['superadmin', 'constructor', '__proto__', '']) {
      expect(effectiveScopes(role, [...SCOPES])).toEqual([])
    }
  })
})

describe('mayAssign', () => {
  it('lets only an owner name an owner, and an admin every other role', () => {
    expect(ROLES.filter((role) => mayAssign(ROLE_SCOPES.owner, role))).toEqual([...ROLES])
    expect(ROLES.filter((role) => mayAssign(ROLE_SCOPES.admin, role))).toEqual([
      'admin',
      'editor',
      'author',
      'reviewer',
    ])
    expect(ROLES.filter((role) => mayAssign(ROLE_SCOPES.editor, role))).toEqual([])
  })
})

describe('legacyRoleOf', () => {
  it('writes the column of 0.x with the roles its check allows', () => {
    expect(ROLES.map((role) => legacyRoleOf(role))).toEqual([
      'owner',
      'owner',
      'editor',
      'reviewer',
      'reviewer',
    ])
  })
})
