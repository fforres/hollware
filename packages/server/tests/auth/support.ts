import { generatePersonalToken, generateReadToken, hashPersonalToken, newId } from '@hollware/core'

import { legacyRoleOf, type Role } from '../../src/auth/roles.ts'

export interface SeedTokenOptions {
  readonly role?: Role
  readonly scopes?: readonly string[]
  readonly expiresAt?: string | null
  readonly revokedAt?: string | null
  readonly lastUsedAt?: string | null
  readonly secret?: string
  readonly read?: boolean
}

export interface SeededToken {
  readonly site: string
  readonly userId: string
  readonly tokenId: string
  readonly token: string
}

const CREATED = '2026-10-01T00:00:00.000Z'

export function newSite(): string {
  return `site-${crypto.randomUUID()}`
}

export async function seedToken(
  db: D1Database,
  site: string,
  options: SeedTokenOptions = {},
): Promise<SeededToken> {
  const userId = newId('usr')
  const tokenId = newId('tok')
  const read = options.read === true
  const token = options.secret ?? (read ? generateReadToken() : generatePersonalToken())
  await db.batch([
    db
      .prepare('INSERT OR IGNORE INTO sites (id, created_at, updated_at) VALUES (?1, ?2, ?2)')
      .bind(site, CREATED),
    db
      .prepare(
        'INSERT INTO users (id, name, role, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)',
      )
      .bind(userId, 'Test user', legacyRoleOf(options.role ?? 'owner'), CREATED),
    db
      .prepare(
        'INSERT INTO members (id, site_id, user_id, role, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)',
      )
      .bind(newId('mbr'), site, userId, options.role ?? 'owner', CREATED),
    db
      .prepare(
        `INSERT INTO tokens (id, site_id, user_id, label, hash, scopes, expires_at, revoked_at,
          last_used_at, created_at, updated_at, kind)
          VALUES (?1, ?2, ?3, 'test', ?4, ?5, ?6, ?7, ?8, ?9, ?9, ?10)`,
      )
      .bind(
        tokenId,
        site,
        userId,
        await hashPersonalToken(token),
        JSON.stringify(
          options.scopes ??
            (read
              ? ['content:read']
              : ['content:read', 'content:write', 'content:publish', 'schema:admin', 'site:owner']),
        ),
        options.expiresAt ?? null,
        options.revokedAt ?? null,
        options.lastUsedAt ?? null,
        CREATED,
        read ? 'read' : 'personal',
      ),
  ])
  return { site, userId, tokenId, token }
}

export async function readUse(
  db: D1Database,
  tokenId: string,
): Promise<{ last_used_at: string | null; updated_at: string } | null> {
  return await db
    .prepare('SELECT last_used_at, updated_at FROM tokens WHERE id = ?1')
    .bind(tokenId)
    .first<{ last_used_at: string | null; updated_at: string }>()
}
