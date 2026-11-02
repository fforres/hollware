import type { Role } from '../auth/roles.ts'

export type PeopleChange =
  | 'changed'
  | 'unchanged'
  | 'not_member'
  | 'last_owner'
  | 'owner_only'
  | 'agent'

const OTHER_OWNERS =
  "(SELECT count(*) FROM members WHERE site_id = ?1 AND role = 'owner' AND user_id <> ?2) > 0"

async function roleOf(db: D1Database, site: string, userId: string): Promise<string | null> {
  return db
    .prepare('SELECT role FROM members WHERE site_id = ?1 AND user_id = ?2')
    .bind(site, userId)
    .first<string>('role')
}

export async function setRole(
  db: D1Database,
  input: {
    readonly site: string
    readonly userId: string
    readonly role: Role
    readonly now: string
    readonly owners: boolean
  },
): Promise<PeopleChange> {
  const current = await db
    .prepare(
      'SELECT m.role AS role, u.kind AS kind FROM members AS m JOIN users AS u ON u.id = m.user_id WHERE m.site_id = ?1 AND m.user_id = ?2',
    )
    .bind(input.site, input.userId)
    .first<{ role: string; kind: string }>()
  if (current === null) return 'not_member'
  if (current.kind === 'agent') return 'agent'
  if (current.role === input.role) return 'unchanged'
  if (!input.owners && (current.role === 'owner' || input.role === 'owner')) return 'owner_only'
  const result = await db
    .prepare(
      `UPDATE members SET role = ?3, updated_at = ?4 WHERE site_id = ?1 AND user_id = ?2
       AND (role <> 'owner' OR ?3 = 'owner' OR ${OTHER_OWNERS})`,
    )
    .bind(input.site, input.userId, input.role, input.now)
    .run()
  return result.meta.changes === 1 ? 'changed' : 'last_owner'
}

export async function removeMember(
  db: D1Database,
  input: { readonly site: string; readonly userId: string; readonly owners: boolean },
): Promise<PeopleChange> {
  const role = await roleOf(db, input.site, input.userId)
  if (role === null) return 'not_member'
  if (!input.owners && role === 'owner') return 'owner_only'
  const result = await db
    .prepare(
      `DELETE FROM members WHERE site_id = ?1 AND user_id = ?2 AND (role <> 'owner' OR ${OTHER_OWNERS})`,
    )
    .bind(input.site, input.userId)
    .run()
  return result.meta.changes === 1 ? 'changed' : 'last_owner'
}
