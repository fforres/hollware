/**
 * The scopes a token carries. An operation asks for scopes, never for a role: what a token may
 * do is its own scopes intersected with those of its user's role.
 */
export const SCOPES = [
  'content:read',
  'content:write',
  'content:publish',
  'schema:admin',
  'site:owner',
  'review:read',
  'review:comment',
] as const

export type Scope = (typeof SCOPES)[number]

/** Whether a string is one of the scopes. */
export function isScope(value: string): value is Scope {
  return SCOPES.some((scope) => scope === value)
}

const IMPLIED: Readonly<Partial<Record<Scope, readonly Scope[]>>> = {
  'content:read': ['review:read'],
  'content:write': ['review:comment'],
}

/**
 * The scopes with those they imply: a token made before the review scopes existed reads reviews
 * with `content:read` and comments on them with `content:write`.
 */
export function withImplied(scopes: readonly Scope[]): Scope[] {
  const all = new Set<Scope>(scopes)
  for (const scope of scopes) for (const implied of IMPLIED[scope] ?? []) all.add(implied)
  return SCOPES.filter((scope) => all.has(scope))
}

/** The most an agent's subscription may ask for: the scopes of an author. */
export const AGENT_SCOPE_CEILING: readonly Scope[] = [
  'content:read',
  'content:write',
  'review:read',
  'review:comment',
]

/** What an agent's subscription gets when it names no scopes: it reads and comments, nothing more. */
export const AGENT_DEFAULT_SCOPES: readonly Scope[] = [
  'content:read',
  'review:read',
  'review:comment',
]
