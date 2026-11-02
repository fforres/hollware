import { withImplied, type Scope } from '@hollware/core'

export const ROLES = ['owner', 'admin', 'editor', 'author', 'reviewer'] as const

export type Role = (typeof ROLES)[number]

export function isRole(value: string): value is Role {
  return ROLES.some((role) => role === value)
}

export const ROLE_SCOPES: Readonly<Record<Role, readonly Scope[]>> = {
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
}

export function effectiveScopes(role: string, tokenScopes: readonly Scope[]): Scope[] {
  if (!isRole(role)) return []
  const granted = withImplied(tokenScopes)
  return ROLE_SCOPES[role].filter((scope) => granted.includes(scope))
}

export function mayAssign(scopes: readonly Scope[], role: Role): boolean {
  if (role === 'owner') return scopes.includes('site:owner')
  return scopes.includes('schema:admin')
}

export function legacyRoleOf(role: Role): 'owner' | 'editor' | 'reviewer' {
  if (role === 'owner' || role === 'admin') return 'owner'
  return role === 'editor' ? 'editor' : 'reviewer'
}
