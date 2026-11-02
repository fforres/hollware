import { AGENT_SCOPE_CEILING } from '@hollware/core'

export const TOKEN_SCOPES = [
  'content:read',
  'content:write',
  'content:publish',
  'schema:admin',
  'site:owner',
  'review:read',
  'review:comment',
] as const

export interface TokenForm {
  readonly label: string
  readonly read: boolean
  readonly scopes: readonly string[]
  readonly days: number | undefined
  readonly until?: string
  readonly never: boolean
  readonly member?: string | null
}

export interface TokenRequest {
  readonly label: string
  readonly kind?: 'read'
  readonly scopes?: readonly string[]
  readonly expiresInDays?: number | null
  readonly expiresAt?: string
  readonly member?: string
}

export function scopesFor(member: string | null | undefined): readonly string[] {
  return member ? AGENT_SCOPE_CEILING : TOKEN_SCOPES
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

export function tokenRequest(form: TokenForm): TokenRequest {
  const member = form.member ? form.member : undefined
  const read = form.read && member === undefined
  const until = form.until ?? ''
  const expiry =
    form.never && !read
      ? { expiresInDays: null }
      : DAY.test(until)
        ? { expiresAt: `${until}T00:00:00.000Z` }
        : typeof form.days === 'number' && Number.isInteger(form.days) && form.days > 0
          ? { expiresInDays: form.days }
          : {}
  const allowed = scopesFor(member)
  return {
    label: form.label,
    ...(read
      ? { kind: 'read' as const }
      : { scopes: form.scopes.filter((scope) => allowed.includes(scope)) }),
    ...expiry,
    ...(member === undefined ? {} : { member }),
  }
}
