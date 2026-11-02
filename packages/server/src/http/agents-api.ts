import { newId } from '@hollware/core'
import { removeMember } from '../identity/people.ts'

const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const NAME_MAX = 64
const DELIVERIES_PAGE = 50

export interface AgentsNote {
  target?: { readonly type: string; readonly id: string }
  detail?: Readonly<Record<string, unknown>>
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } })
}

function refused(code: string, message: string, fix: string, status: number): Response {
  return json({ code, message, fix }, status)
}

export async function listAgents(db: D1Database, site: string): Promise<Response> {
  const { results } = await db
    .prepare(
      `SELECT u.id AS id, u.name AS name, m.created_at AS since
        FROM members AS m JOIN users AS u ON u.id = m.user_id
        WHERE m.site_id = ?1 AND u.kind = 'agent'
        ORDER BY u.name, u.id`,
    )
    .bind(site)
    .all<{ id: string; name: string | null; since: string }>()
  return json({ agents: results })
}

export async function createAgent(
  db: D1Database,
  input: { readonly site: string; readonly name: unknown; readonly now: string },
  note: AgentsNote,
): Promise<Response> {
  const { name } = input
  if (typeof name !== 'string' || name.length > NAME_MAX || !NAME.test(name)) {
    return refused(
      'invalid_input',
      'An agent needs a name of lowercase words joined by hyphens, at most 64 characters.',
      'Send { "name": "reviewer" }.',
      400,
    )
  }
  const taken = await db
    .prepare(
      `SELECT 1 AS found FROM members AS m JOIN users AS u ON u.id = m.user_id
        WHERE m.site_id = ?1 AND u.kind = 'agent' AND u.name = ?2`,
    )
    .bind(input.site, name)
    .first<{ found: number }>()
  if (taken !== null) {
    return refused(
      'conflict',
      `The site already has an agent named ${name}.`,
      'Give the agent another name, or use the one the site has.',
      409,
    )
  }
  const id = newId('usr')
  await db.batch([
    db
      .prepare(
        `INSERT INTO users (id, name, role, kind, created_at, updated_at)
          VALUES (?1, ?2, 'reviewer', 'agent', ?3, ?3)`,
      )
      .bind(id, name, input.now),
    db
      .prepare(
        `INSERT INTO members (id, site_id, user_id, role, created_at, updated_at)
          VALUES (?1, ?2, ?3, 'author', ?4, ?4)`,
      )
      .bind(newId('mbr'), input.site, id, input.now),
  ])
  note.target = { type: 'user', id }
  note.detail = { name }
  return json({ id, name }, 201)
}

export async function removeAgent(
  db: D1Database,
  input: { readonly site: string; readonly id: string; readonly now: string },
  note: AgentsNote,
): Promise<Response> {
  note.target = { type: 'user', id: input.id }
  const agent = await db
    .prepare(
      `SELECT 1 AS found FROM members AS m JOIN users AS u ON u.id = m.user_id
        WHERE m.site_id = ?1 AND m.user_id = ?2 AND u.kind = 'agent'`,
    )
    .bind(input.site, input.id)
    .first<{ found: number }>()
  if (agent === null) {
    return refused(
      'not_found',
      'That is no agent member of this site.',
      'Pick an agent from the list of agents.',
      404,
    )
  }
  await db.batch(
    ['agent_grants', 'tokens'].map((table) =>
      db
        .prepare(
          `UPDATE ${table} SET revoked_at = ?3, updated_at = ?3
            WHERE site_id = ?1 AND user_id = ?2 AND revoked_at IS NULL`,
        )
        .bind(input.site, input.id, input.now),
    ),
  )
  await removeMember(db, { site: input.site, userId: input.id, owners: true })
  return json({ outcome: 'removed' })
}

export async function agentDeliveries(db: D1Database, site: string): Promise<Response> {
  const { results } = await db
    .prepare(
      `SELECT d.event_id AS event, o.kind AS kind, substr(d.subscriber, 7) AS agent,
          d.attempts AS attempts, d.delivered_at AS deliveredAt, d.last_error AS lastError,
          d.updated_at AS triedAt, o.abandoned_at AS abandonedAt
        FROM deliveries AS d JOIN outbox AS o ON o.id = d.event_id AND o.site_id = d.site_id
        WHERE d.site_id = ?1 AND d.subscriber LIKE 'agent:%'
        ORDER BY d.updated_at DESC, d.id DESC
        LIMIT ?2`,
    )
    .bind(site, DELIVERIES_PAGE)
    .all()
  return json({ deliveries: results })
}
