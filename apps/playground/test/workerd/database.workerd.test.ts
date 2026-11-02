import { env } from 'cloudflare:workers'
import { expect, it } from 'vitest'

it('has the tables of the @hollware/server migrations, and no others', async () => {
  const { results } = await env.DB.prepare(
    `SELECT name FROM sqlite_master
      WHERE type = 'table' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\'
        AND name NOT IN ('d1_migrations', 'sqlite_sequence')
      ORDER BY name`,
  ).all<{ name: string }>()

  expect(results.map((row) => row.name)).toEqual([
    '_hollware_meta',
    'agent_grants',
    'anonymizations',
    'assets',
    'audit_log',
    'auth_challenges',
    'deliveries',
    'entries',
    'entries_fts',
    'entries_fts_config',
    'entries_fts_content',
    'entries_fts_data',
    'entries_fts_docsize',
    'entries_fts_idx',
    'entry_embeddings',
    'entry_purges',
    'identities',
    'invitations',
    'members',
    'outbox',
    'passkeys',
    'publications',
    'redirects',
    'review_agent_runs',
    'review_comments',
    'review_items',
    'reviews',
    'revision_tags',
    'revisions',
    'schedules',
    'sessions',
    'site_analytics',
    'site_changes',
    'site_secrets',
    'sites',
    'tokens',
    'unpublishes',
    'uploads',
    'users',
  ])
})
