import {
  emailAddress,
  isId,
  isScope,
  isSiteKey,
  SCOPES,
  SITE_KEY_MAX_LENGTH,
  type Scope,
} from '@hollware/core'
import { UsageError } from './errors.ts'
import { printable } from './format.ts'

export function quote(value: string): string {
  if (value.includes('\u0000')) throw new TypeError('a SQL string cannot hold a NUL character')
  return `'${value.replaceAll("'", "''")}'`
}

function shown(value: string): string {
  return printable(JSON.stringify(value))
}

export function parseSiteKey(value: string): string {
  if (!isSiteKey(value)) {
    throw new UsageError(
      `invalid --site ${shown(value)}: a site key is lowercase letters and digits joined by single hyphens, up to ${SITE_KEY_MAX_LENGTH} characters, such as "blog" or "my-site".`,
    )
  }
  return value
}

const LABEL_MAX = 64
const OWNER_NAME_MAX = 100
const FORBIDDEN_IN_TEXT = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u

function parseText(value: string, flag: string, max: number): string {
  const text = value.trim()
  const length = Array.from(text).length
  if (length < 1 || length > max || FORBIDDEN_IN_TEXT.test(text)) {
    throw new UsageError(
      `invalid ${flag} ${shown(value)}: use 1 to ${max} characters, with no control or invisible formatting characters.`,
    )
  }
  return text
}

export function parseLabel(value: string): string {
  return parseText(value, '--label', LABEL_MAX)
}

export function parseOwnerName(value: string): string {
  return parseText(value, '--owner-name', OWNER_NAME_MAX)
}

export function parseEmail(value: string, flag: string): string {
  const address = emailAddress(value)
  if (address === null) {
    throw new UsageError(
      `${flag} ${shown(value)} is not an email address: write it whole, such as ada@example.com.`,
    )
  }
  return address
}

export function parseScopes(value: string): Scope[] {
  const names = value.split(',').map((name) => name.trim())
  const scopes: Scope[] = []
  for (const name of names) {
    if (!isScope(name)) {
      throw new UsageError(
        `invalid --scopes: ${shown(name)} is not a scope. Choose from ${SCOPES.join(', ')}.`,
      )
    }
    if (!scopes.includes(name)) scopes.push(name)
  }
  return scopes
}

export const MAX_EXPIRES_IN_DAYS = 365

export function parseExpiresInDays(value: string): number {
  const days = /^[0-9]{1,4}$/.test(value) ? Number(value) : 0
  if (days < 1 || days > MAX_EXPIRES_IN_DAYS) {
    throw new UsageError(
      `invalid --expires-in-days ${shown(value)}: use a whole number of days from 1 to ${MAX_EXPIRES_IN_DAYS}.`,
    )
  }
  return days
}

export function parseExpiresAt(value: string, now: Date): string {
  const instant = /^[0-9]{4}-[0-9]{2}-[0-9]{2}/.test(value) ? Date.parse(value) : Number.NaN
  if (Number.isNaN(instant) || instant <= now.getTime()) {
    throw new UsageError(
      `invalid --expires-at ${shown(value)}: use a date or time of the future, such as 2027-06-30 or 2027-06-30T18:00:00Z.`,
    )
  }
  return new Date(instant).toISOString()
}

export function parseTokenId(value: string): string {
  if (!isId('tok', value)) {
    throw new UsageError(
      `invalid token id ${shown(value)}: a token id is tok_ followed by 26 characters. "hollware token list" shows them.`,
    )
  }
  return value
}

const DATABASE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/

export function parseDatabase(value: string): string {
  if (!DATABASE.test(value)) {
    throw new UsageError(
      `invalid --database ${shown(value)}: use the name or the binding of a D1 database (letters, digits, "_", "-" and ".", not starting with "-").`,
    )
  }
  return value
}

export function ownerQuery(): string {
  return "SELECT user_id AS id, site_id AS site FROM members WHERE role = 'owner' ORDER BY created_at, user_id"
}

export function sitesAndOwnerQuery(): string {
  return "SELECT id FROM sites ORDER BY id; SELECT user_id AS id FROM members WHERE role = 'owner' ORDER BY created_at, user_id LIMIT 1;"
}

export function ownerOfSiteQuery(site: string): string {
  return `SELECT user_id AS id FROM members WHERE site_id = ${quote(site)} AND role = 'owner' ORDER BY created_at, user_id LIMIT 1;`
}

export function sitesQuery(): string {
  return 'SELECT id FROM sites ORDER BY id;'
}

export interface NewToken {
  id: string
  kind?: 'read'
  site: string
  userId: string
  label: string
  hash: string
  scopes: readonly Scope[]
  expiresAt: string | null
  now: string
}

export function insertToken(token: NewToken): string {
  const kind = token.kind === undefined ? ['', ''] : [', kind', `, ${quote(token.kind)}`]
  return `INSERT INTO tokens (id, site_id, user_id, label, hash, scopes, expires_at, created_at, updated_at${kind[0]}) VALUES (${quote(token.id)}, ${quote(token.site)}, ${quote(token.userId)}, ${quote(token.label)}, ${quote(token.hash)}, ${quote(JSON.stringify(token.scopes))}, ${token.expiresAt === null ? 'NULL' : quote(token.expiresAt)}, ${quote(token.now)}, ${quote(token.now)}${kind[1]});`
}

export interface InitialStructure {
  definition: unknown
  changeId: string
}

export interface FirstSite {
  site: string
  ownerId: string
  memberId: string
  ownerName: string | undefined
  ownerEmail: string
  token: NewToken
  structure?: InitialStructure | undefined
}

function siteRow(site: string, now: string, structure: InitialStructure | undefined): string {
  if (structure === undefined) {
    return `INSERT INTO sites (id, created_at, updated_at) VALUES (${quote(site)}, ${quote(now)}, ${quote(now)}) ON CONFLICT (id) DO NOTHING;`
  }
  return `INSERT INTO sites (id, definition, version, created_at, updated_at) VALUES (${quote(site)}, ${quote(JSON.stringify(structure.definition))}, 1, ${quote(now)}, ${quote(now)}) ON CONFLICT (id) DO UPDATE SET definition = excluded.definition, version = 1, updated_at = excluded.updated_at WHERE sites.definition IS NULL;`
}

function siteChange(
  site: string,
  ownerId: string,
  now: string,
  structure: InitialStructure | undefined,
): string[] {
  if (structure === undefined) return []
  return [
    `INSERT OR IGNORE INTO site_changes (id, site_id, version, actor_user_id, actor_meta, before, after, created_at, updated_at) SELECT ${quote(structure.changeId)}, id, 1, ${quote(ownerId)}, NULL, NULL, definition, ${quote(now)}, ${quote(now)} FROM sites WHERE id = ${quote(site)} AND version = 1 AND updated_at = ${quote(now)};`,
  ]
}

export function initScript({
  site,
  ownerId,
  memberId,
  ownerName,
  ownerEmail,
  token,
  structure,
}: FirstSite): string {
  const name = ownerName === undefined ? 'NULL' : quote(ownerName)
  const user = `INSERT INTO users (id, name, role, email, email_verified_at, created_at, updated_at) VALUES (${quote(ownerId)}, ${name}, 'owner', ${quote(ownerEmail)}, ${quote(token.now)}, ${quote(token.now)}, ${quote(token.now)});`
  return [
    siteRow(site, token.now, structure),
    user,
    `INSERT INTO members (id, site_id, user_id, role, created_at, updated_at) VALUES (${quote(memberId)}, ${quote(site)}, ${quote(ownerId)}, 'owner', ${quote(token.now)}, ${quote(token.now)});`,
    insertToken(token),
    ...siteChange(site, ownerId, token.now, structure),
    '',
  ].join('\n')
}

export interface AnotherSite {
  site: string
  ownerId: string
  memberId: string
  token: NewToken
  structure?: InitialStructure | undefined
}

export function anotherSiteScript({
  site,
  ownerId,
  memberId,
  token,
  structure,
}: AnotherSite): string {
  return [
    siteRow(site, token.now, structure),
    `INSERT INTO members (id, site_id, user_id, role, created_at, updated_at) VALUES (${quote(memberId)}, ${quote(site)}, ${quote(ownerId)}, 'owner', ${quote(token.now)}, ${quote(token.now)});`,
    insertToken(token),
    ...siteChange(site, ownerId, token.now, structure),
    '',
  ].join('\n')
}

export interface NewInvitation {
  id: string
  site: string
  hash: string
  role: 'owner' | 'admin' | 'editor' | 'author' | 'reviewer'
  userId: string | null
  expiresAt: string
  now: string
  email?: string | undefined
}

export function insertInvitation(invitation: NewInvitation): string {
  const user = invitation.userId === null ? 'NULL' : quote(invitation.userId)
  if (invitation.email !== undefined) {
    return `INSERT INTO invitations (id, site_id, hash, role, user_id, email, expires_at, used_at, created_at, updated_at) VALUES (${quote(invitation.id)}, ${quote(invitation.site)}, ${quote(invitation.hash)}, ${quote(invitation.role)}, ${user}, ${quote(invitation.email)}, ${quote(invitation.expiresAt)}, NULL, ${quote(invitation.now)}, ${quote(invitation.now)});`
  }
  return `INSERT INTO invitations (id, site_id, hash, role, user_id, expires_at, used_at, created_at, updated_at) VALUES (${quote(invitation.id)}, ${quote(invitation.site)}, ${quote(invitation.hash)}, ${quote(invitation.role)}, ${user}, ${quote(invitation.expiresAt)}, NULL, ${quote(invitation.now)}, ${quote(invitation.now)});`
}

export function parseInvitationId(value: string): string {
  if (!isId('inv', value)) {
    throw new UsageError(
      `invalid invitation id ${shown(value)}: an invitation id is inv_ followed by 26 characters. "hollware invite list" shows them.`,
    )
  }
  return value
}

export function listInvitations(site: string, now: string): string {
  return `SELECT id, role, email, expires_at FROM invitations WHERE site_id = ${quote(site)} AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ${quote(now)} ORDER BY created_at, id;`
}

export function revokeInvitation(id: string, site: string, now: string): string {
  return `UPDATE invitations SET revoked_at = ${quote(now)}, updated_at = ${quote(now)} WHERE id = ${quote(id)} AND site_id = ${quote(site)} AND used_at IS NULL AND revoked_at IS NULL RETURNING id;`
}

export function listTokens(site: string): string {
  return `SELECT tokens.id AS id, tokens.label AS label, tokens.scopes AS scopes, tokens.expires_at AS expires_at, tokens.revoked_at AS revoked_at, tokens.last_used_at AS last_used_at, tokens.created_at AS created_at, users.name AS user_name, users.kind AS user_kind FROM tokens JOIN users ON users.id = tokens.user_id WHERE tokens.site_id = ${quote(site)} ORDER BY tokens.created_at, tokens.id;`
}

export function agentMemberQuery(site: string, userId: string): string {
  return `SELECT users.id AS id, users.name AS name FROM members JOIN users ON users.id = members.user_id WHERE members.site_id = ${quote(site)} AND members.user_id = ${quote(userId)} AND users.kind = 'agent';`
}

export function revokeToken(id: string, site: string | undefined, now: string): string {
  const scope = site === undefined ? '' : ` AND site_id = ${quote(site)}`
  return `UPDATE tokens SET revoked_at = ${quote(now)}, updated_at = ${quote(now)} WHERE id = ${quote(id)}${scope} AND revoked_at IS NULL RETURNING id; SELECT id, revoked_at FROM tokens WHERE id = ${quote(id)}${scope};`
}

const AGENT_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const AGENT_NAME_MAX = 64

export function parseAgentName(value: string): string {
  if (value.length > AGENT_NAME_MAX || !AGENT_NAME.test(value)) {
    throw new UsageError(
      `invalid agent name ${shown(value)}: use lowercase letters and digits joined by single hyphens, up to ${AGENT_NAME_MAX} characters, such as "reviewer" or "seo-auditor".`,
    )
  }
  return value
}

export function parseUserId(value: string): string {
  if (!isId('usr', value)) {
    throw new UsageError(
      `invalid user id ${shown(value)}: the id of an agent is usr_ followed by 26 characters. "hollware agent list" shows them.`,
    )
  }
  return value
}

export interface NewAgentMember {
  userId: string
  memberId: string
  site: string
  name: string
  now: string
}

export function insertAgentMember({ userId, memberId, site, name, now }: NewAgentMember): string {
  return [
    `INSERT INTO users (id, name, role, kind, created_at, updated_at) SELECT ${quote(userId)}, ${quote(name)}, 'reviewer', 'agent', ${quote(now)}, ${quote(now)} WHERE NOT EXISTS (SELECT 1 FROM members JOIN users ON users.id = members.user_id WHERE members.site_id = ${quote(site)} AND users.kind = 'agent' AND users.name = ${quote(name)});`,
    `INSERT INTO members (id, site_id, user_id, role, created_at, updated_at) SELECT ${quote(memberId)}, ${quote(site)}, id, 'author', ${quote(now)}, ${quote(now)} FROM users WHERE id = ${quote(userId)} RETURNING user_id AS id;`,
  ].join(' ')
}

export function listAgentMembers(site: string): string {
  return `SELECT users.id AS id, users.name AS name, members.created_at AS since FROM members JOIN users ON users.id = members.user_id WHERE members.site_id = ${quote(site)} AND users.kind = 'agent' ORDER BY members.created_at, users.id;`
}

export function removeAgentMember(userId: string, site: string, now: string): string {
  const agent = "user_id IN (SELECT id FROM users WHERE kind = 'agent')"
  return [
    `UPDATE agent_grants SET revoked_at = ${quote(now)}, updated_at = ${quote(now)} WHERE site_id = ${quote(site)} AND user_id = ${quote(userId)} AND revoked_at IS NULL AND ${agent};`,
    `UPDATE tokens SET revoked_at = ${quote(now)}, updated_at = ${quote(now)} WHERE site_id = ${quote(site)} AND user_id = ${quote(userId)} AND revoked_at IS NULL AND ${agent};`,
    `DELETE FROM members WHERE site_id = ${quote(site)} AND user_id = ${quote(userId)} AND ${agent} RETURNING user_id AS id;`,
  ].join(' ')
}
