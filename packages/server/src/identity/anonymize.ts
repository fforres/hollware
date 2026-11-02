import { FORMER_PERSON, newId } from '@hollware/core'

const FORMER = `'${FORMER_PERSON}'`

const OPEN = 'EXISTS (SELECT 1 FROM anonymizations WHERE site_id = ?1 AND user_id = ?2)'

const REMOVED = `SELECT target_id FROM audit_log
  WHERE site_id = ?1 AND target_type = 'user' AND action = 'member.remove' AND outcome = 'ok'`

const IN_SITE = [
  `UPDATE outbox SET payload = json_set(payload, '$.review.requestedBy', NULL)
    WHERE site_id = ?1 AND kind IN ('review.requested', 'review.decided')
      AND json_extract(payload, '$.review.id') IN (SELECT id FROM reviews WHERE site_id = ?1 AND requested_by = ?2) AND ${OPEN}`,
  ...['revisions', 'publications', 'schedules', 'unpublishes'].map(
    (table) =>
      `UPDATE ${table} SET actor_user_id = ${FORMER}, actor_token_id = NULL, actor_meta = NULL WHERE site_id = ?1 AND actor_user_id = ?2 AND ${OPEN}`,
  ),
  `UPDATE reviews SET requested_by = ${FORMER}, requested_meta = NULL WHERE site_id = ?1 AND requested_by = ?2 AND ${OPEN}`,
  `UPDATE reviews SET decided_by = ${FORMER} WHERE site_id = ?1 AND decided_by = ?2 AND ${OPEN}`,
  `UPDATE review_comments SET author_id = ${FORMER}, author_meta = NULL WHERE site_id = ?1 AND author_id = ?2 AND ${OPEN}`,
  `UPDATE site_changes SET actor_user_id = ${FORMER}, actor_meta = NULL WHERE site_id = ?1 AND actor_user_id = ?2 AND ${OPEN}`,
  `UPDATE audit_log SET actor_user_id = ${FORMER}, actor_token_id = NULL, actor_meta = NULL, ip_hash = NULL,
      detail = CASE WHEN action = 'token.create' THEN json_remove(detail, '$.label') ELSE detail END
    WHERE site_id = ?1 AND actor_user_id = ?2 AND ${OPEN}`,
  `UPDATE audit_log SET target_id = ${FORMER} WHERE site_id = ?1 AND target_type = 'user' AND target_id = ?2 AND ${OPEN}`,
  `UPDATE assets SET created_by = ${FORMER} WHERE site_id = ?1 AND created_by = ?2 AND ${OPEN}`,
  `UPDATE entry_purges SET purged_by = ${FORMER} WHERE site_id = ?1 AND purged_by = ?2 AND ${OPEN}`,
  `DELETE FROM invitations WHERE site_id = ?1 AND user_id = ?2 AND ${OPEN}`,
  `DELETE FROM tokens WHERE site_id = ?1 AND user_id = ?2 AND ${OPEN}`,
  `DELETE FROM agent_grants WHERE site_id = ?1 AND user_id = ?2 AND ${OPEN}`,
  `DELETE FROM uploads WHERE site_id = ?1 AND created_by = ?2 AND ${OPEN}`,
]

const GONE = [
  'members WHERE user_id = ?1',
  'tokens WHERE user_id = ?1',
  'agent_grants WHERE user_id = ?1',
  'invitations WHERE user_id = ?1',
  'revisions WHERE actor_user_id = ?1',
  'publications WHERE actor_user_id = ?1',
  'schedules WHERE actor_user_id = ?1',
  'unpublishes WHERE actor_user_id = ?1',
  'reviews WHERE requested_by = ?1 OR decided_by = ?1',
  'review_comments WHERE author_id = ?1',
  'site_changes WHERE actor_user_id = ?1',
  'assets WHERE created_by = ?1',
  'entry_purges WHERE purged_by = ?1',
  'uploads WHERE created_by = ?1',
  'audit_log WHERE actor_user_id = ?1',
  "audit_log WHERE target_type = 'user' AND target_id = ?1",
]
  .map((rows) => `NOT EXISTS (SELECT 1 FROM ${rows})`)
  .join(' AND ')

const EVERYWHERE = [
  `DELETE FROM passkeys WHERE user_id = ?1 AND ${GONE}`,
  `DELETE FROM sessions WHERE user_id = ?1 AND ${GONE}`,
  `DELETE FROM auth_challenges WHERE user_id = ?1 AND ${GONE}`,
  `DELETE FROM identities WHERE user_id = ?1 AND ${GONE}`,
  `DELETE FROM users WHERE id = ?1 AND ${GONE}`,
]

export interface FormerPerson {
  readonly id: string
  readonly name: string | null
}

export async function formerPeople(db: D1Database, site: string): Promise<FormerPerson[]> {
  const { results } = await db
    .prepare(
      `SELECT id, name FROM users
        WHERE id IN (${REMOVED}) AND id <> ${FORMER}
          AND id NOT IN (SELECT user_id FROM members WHERE site_id = ?1)
        ORDER BY name, id`,
    )
    .bind(site)
    .all<FormerPerson>()
  return results
}

export async function anonymizePerson(
  db: D1Database,
  input: { readonly site: string; readonly userId: string; readonly now: string },
): Promise<'anonymized' | 'gone' | 'member' | 'not_found'> {
  const known = await db
    .prepare(
      `SELECT EXISTS (SELECT 1 FROM members WHERE site_id = ?1 AND user_id = ?2)
              OR (?2 IN (${REMOVED}) AND ?2 <> ${FORMER}) AS known`,
    )
    .bind(input.site, input.userId)
    .first<number>('known')
  if (known !== 1) return 'not_found'
  const [, opened] = await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO users (id, name, role, created_at, updated_at) VALUES (${FORMER}, 'Former member', 'reviewer', ?1, ?1)`,
      )
      .bind(input.now),
    db
      .prepare(
        'INSERT INTO anonymizations (id, site_id, user_id, created_at, updated_at) SELECT ?3, ?1, ?2, ?4, ?4 WHERE NOT EXISTS (SELECT 1 FROM members WHERE site_id = ?1 AND user_id = ?2)',
      )
      .bind(input.site, input.userId, newId('anm'), input.now),
    ...IN_SITE.map((statement) => db.prepare(statement).bind(input.site, input.userId)),
    db
      .prepare('DELETE FROM anonymizations WHERE site_id = ?1 AND user_id = ?2')
      .bind(input.site, input.userId),
    ...EVERYWHERE.map((statement) => db.prepare(statement).bind(input.userId)),
  ])
  if ((opened?.meta.changes ?? 0) !== 1) return 'member'
  const left = await db
    .prepare('SELECT 1 AS found FROM users WHERE id = ?1')
    .bind(input.userId)
    .first<{ found: number }>()
  return left === null ? 'gone' : 'anonymized'
}
