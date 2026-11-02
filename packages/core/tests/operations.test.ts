import { describe, expect, it } from 'vite-plus/test'
import * as z from 'zod'

import {
  defineOperation,
  getEntry,
  OPERATIONS,
  publish,
  updateDraft,
} from '../src/operations/index.ts'

const ENTRY_ID = 'ent_01JAB3XQ8ZK4M6N2P5R7S9T0VW'

const jsonSchema = (schema: z.ZodType, io: 'input' | 'output') =>
  schema['~standard'].jsonSchema[io]({ target: 'draft-2020-12' })

describe('operation specs', () => {
  it('are the forty-one operations, sorted by name, as tools/list shows them', () => {
    const names = OPERATIONS.map((operation) => operation.name)
    expect(names).toEqual([
      'approve_review',
      'comment_review',
      'connect_analytics',
      'content_stats',
      'create_draft',
      'create_site',
      'delete_entry',
      'delete_site',
      'describe_site',
      'disconnect_analytics',
      'get_analytics',
      'get_asset',
      'get_entry',
      'get_review',
      'get_revision',
      'get_structure',
      'get_translations',
      'list_assets',
      'list_backups',
      'list_entries',
      'list_redirects',
      'list_reviews',
      'list_revisions',
      'make_webhook_secret',
      'move_entry',
      'publish',
      'reject_review',
      'request_changes',
      'request_review',
      'restore_entry',
      'restore_revision',
      'restore_site',
      'schedule_unpublish',
      'search',
      'set_collection',
      'unpublish',
      'update_asset',
      'update_draft',
      'update_site',
      'upload_asset',
      'validate',
    ])
    expect(names).toEqual([...names].sort())
  })

  it('have the effects, scopes and outcomes of the operations table', () => {
    const table = Object.fromEntries(
      OPERATIONS.map((operation) => {
        const outcomes = Object.entries(operation.outcomes)
        return [
          operation.name,
          {
            effect: operation.effect,
            scopes: operation.scopes,
            outcomes: outcomes.map(([outcome]) => outcome),
            errors: outcomes.filter(([, info]) => info.isError).map(([outcome]) => outcome),
          },
        ]
      }),
    )
    expect(table).toEqual({
      approve_review: {
        effect: 'write',
        scopes: ['content:publish'],
        outcomes: [
          'published',
          'blocked',
          'needs_acknowledgement',
          'agents_pending',
          'conflict',
          'not_pending',
          'not_found',
        ],
        errors: ['blocked', 'agents_pending', 'conflict', 'not_pending', 'not_found'],
      },
      comment_review: {
        effect: 'write',
        scopes: ['review:comment'],
        outcomes: ['commented', 'not_pending', 'not_found'],
        errors: ['not_pending', 'not_found'],
      },
      connect_analytics: {
        effect: 'write',
        scopes: ['schema:admin'],
        outcomes: ['connected', 'refused', 'unreachable', 'invalid', 'unavailable'],
        errors: ['refused', 'unreachable', 'invalid', 'unavailable'],
      },
      content_stats: {
        effect: 'read',
        scopes: ['content:read'],
        outcomes: ['ok', 'unavailable'],
        errors: ['unavailable'],
      },
      disconnect_analytics: {
        effect: 'write',
        scopes: ['schema:admin'],
        outcomes: ['disconnected', 'not_connected'],
        errors: ['not_connected'],
      },
      get_analytics: {
        effect: 'read',
        scopes: ['schema:admin'],
        outcomes: ['connected', 'not_connected'],
        errors: [],
      },
      create_draft: {
        effect: 'write',
        scopes: ['content:write'],
        outcomes: ['saved', 'refused', 'in_trash'],
        errors: ['refused', 'in_trash'],
      },
      create_site: {
        effect: 'write',
        scopes: ['site:owner'],
        outcomes: ['created', 'taken', 'invalid'],
        errors: ['taken', 'invalid'],
      },
      delete_entry: {
        effect: 'destructive',
        scopes: ['content:write'],
        outcomes: ['trashed', 'published', 'conflict', 'not_found'],
        errors: ['published', 'conflict', 'not_found'],
      },
      delete_site: {
        effect: 'destructive',
        scopes: ['site:owner'],
        outcomes: ['trashed', 'needs_confirmation', 'not_found'],
        errors: ['not_found'],
      },
      describe_site: { effect: 'read', scopes: ['content:read'], outcomes: ['ok'], errors: [] },
      get_entry: {
        effect: 'read',
        scopes: ['content:read'],
        outcomes: ['ok', 'not_found'],
        errors: ['not_found'],
      },
      get_review: {
        effect: 'read',
        scopes: ['review:read'],
        outcomes: ['ok', 'not_found'],
        errors: ['not_found'],
      },
      get_structure: { effect: 'read', scopes: ['content:read'], outcomes: ['ok'], errors: [] },
      get_translations: {
        effect: 'read',
        scopes: ['content:read'],
        outcomes: ['ok', 'not_found'],
        errors: ['not_found'],
      },
      list_entries: { effect: 'read', scopes: ['content:read'], outcomes: ['ok'], errors: [] },
      list_reviews: { effect: 'read', scopes: ['review:read'], outcomes: ['ok'], errors: [] },
      upload_asset: {
        effect: 'write',
        scopes: ['content:write'],
        outcomes: ['created', 'exists', 'refused', 'unavailable'],
        errors: ['refused', 'unavailable'],
      },
      list_assets: { effect: 'read', scopes: ['content:read'], outcomes: ['ok'], errors: [] },
      get_asset: {
        effect: 'read',
        scopes: ['content:read'],
        outcomes: ['ok', 'not_found'],
        errors: ['not_found'],
      },
      update_asset: {
        effect: 'edit',
        scopes: ['content:write'],
        outcomes: ['updated', 'unchanged', 'not_found'],
        errors: ['not_found'],
      },
      schedule_unpublish: {
        effect: 'destructive',
        scopes: ['content:publish'],
        outcomes: ['scheduled', 'unpublished', 'cancelled', 'not_published', 'not_found'],
        errors: ['not_published', 'not_found'],
      },
      list_backups: {
        effect: 'read',
        scopes: ['site:owner'],
        outcomes: ['ok', 'unavailable'],
        errors: ['unavailable'],
      },
      move_entry: {
        effect: 'edit',
        scopes: ['content:write'],
        outcomes: ['moved', 'unchanged', 'taken', 'conflict', 'not_found'],
        errors: ['taken', 'conflict', 'not_found'],
      },
      list_redirects: { effect: 'read', scopes: ['content:read'], outcomes: ['ok'], errors: [] },
      list_revisions: {
        effect: 'read',
        scopes: ['content:read'],
        outcomes: ['ok', 'not_found'],
        errors: ['not_found'],
      },
      get_revision: {
        effect: 'read',
        scopes: ['content:read'],
        outcomes: ['ok', 'not_found'],
        errors: ['not_found'],
      },
      restore_revision: {
        effect: 'edit',
        scopes: ['content:write'],
        outcomes: ['saved', 'unchanged', 'conflict', 'not_found', 'refused'],
        errors: ['conflict', 'not_found', 'refused'],
      },
      make_webhook_secret: {
        effect: 'write',
        scopes: ['schema:admin'],
        outcomes: ['made', 'not_found', 'unavailable'],
        errors: ['not_found', 'unavailable'],
      },
      publish: {
        effect: 'write',
        scopes: ['content:write'],
        outcomes: [
          'published',
          'scheduled',
          'blocked',
          'needs_acknowledgement',
          'pending_review',
          'conflict',
          'not_found',
        ],
        errors: ['blocked', 'conflict', 'not_found'],
      },
      request_changes: {
        effect: 'edit',
        scopes: ['content:publish'],
        outcomes: ['changes_requested', 'not_pending', 'not_found'],
        errors: ['not_pending', 'not_found'],
      },
      reject_review: {
        effect: 'edit',
        scopes: ['content:publish'],
        outcomes: ['rejected', 'not_pending', 'not_found'],
        errors: ['not_pending', 'not_found'],
      },
      request_review: {
        effect: 'write',
        scopes: ['content:write'],
        outcomes: ['pending_review', 'blocked', 'needs_acknowledgement', 'conflict', 'not_found'],
        errors: ['blocked', 'conflict', 'not_found'],
      },
      restore_entry: {
        effect: 'write',
        scopes: ['content:write'],
        outcomes: ['restored', 'not_trashed', 'not_found'],
        errors: ['not_trashed', 'not_found'],
      },
      restore_site: {
        effect: 'write',
        scopes: ['site:owner'],
        outcomes: ['restored', 'not_found'],
        errors: ['not_found'],
      },
      search: { effect: 'read', scopes: ['content:read'], outcomes: ['ok'], errors: [] },
      set_collection: {
        effect: 'destructive',
        scopes: ['schema:admin'],
        outcomes: ['updated', 'unchanged', 'invalid', 'needs_confirmation', 'conflict'],
        errors: ['invalid', 'conflict'],
      },
      unpublish: {
        effect: 'destructive',
        scopes: ['content:publish'],
        outcomes: ['unpublished', 'not_found'],
        errors: ['not_found'],
      },
      update_draft: {
        effect: 'edit',
        scopes: ['content:write'],
        outcomes: ['saved', 'unchanged', 'conflict', 'not_found', 'refused'],
        errors: ['conflict', 'not_found', 'refused'],
      },
      update_site: {
        effect: 'destructive',
        scopes: ['schema:admin'],
        outcomes: ['updated', 'unchanged', 'invalid', 'needs_confirmation', 'conflict'],
        errors: ['invalid', 'conflict'],
      },
      validate: { effect: 'read', scopes: ['content:read'], outcomes: ['ok'], errors: [] },
    })
  })

  it('show agents a strict object as input and an object with its outcomes as output', () => {
    const shapes = OPERATIONS.map((operation) => {
      const input = jsonSchema(operation.input, 'input')
      const output = jsonSchema(operation.output, 'output')
      const properties = output['properties']
      const outcome =
        typeof properties === 'object' && properties !== null && 'outcome' in properties
          ? properties.outcome
          : undefined
      return {
        name: operation.name,
        input: [input['type'], input['additionalProperties']],
        output: [output['type'], output['required']],
        outcome,
      }
    })
    expect(shapes).toEqual(
      OPERATIONS.map((operation) => ({
        name: operation.name,
        input: ['object', false],
        output: ['object', expect.arrayContaining(['outcome'])],
        outcome: { type: 'string', enum: Object.keys(operation.outcomes) },
      })),
    )
  })

  it('have a title and a description for the agent', () => {
    for (const operation of OPERATIONS) {
      expect(operation.title.length, operation.name).toBeGreaterThan(5)
      expect(operation.description.length, operation.name).toBeGreaterThan(60)
    }
  })

  it('fill the input defaults and refuse fields they do not know', () => {
    expect(publish.input.parse({ id: ENTRY_ID, version: 3 })).toEqual({
      id: ENTRY_ID,
      version: 3,
      acknowledgeWarnings: [],
      group: [],
    })
    expect(getEntry.input.parse({ collection: 'blog', locale: 'en', slug: 'hello-world' })).toEqual(
      {
        collection: 'blog',
        locale: 'en',
        slug: 'hello-world',
        formats: ['markdown'],
        published: false,
        related: false,
        references: false,
      },
    )
    const misspelled = updateDraft.input.safeParse({
      id: ENTRY_ID,
      version: 1,
      markdown: '# Hi',
      versions: 2,
    })
    expect(misspelled.success).toBe(false)
    expect(misspelled.error?.issues.map((issue) => issue.code)).toEqual(['unrecognized_keys'])
  })

  it('make a missing or an unknown outcome a type error', () => {
    const output = z.object({ outcome: z.enum(['ok', 'gone']) })
    const base = {
      name: 'probe',
      title: 'A probe',
      description: 'A spec that exists only to be type-checked.',
      input: z.strictObject({}),
      output,
      scopes: [],
      effect: 'read',
    } as const
    const complete = defineOperation({
      ...base,
      outcomes: { ok: { isError: false }, gone: { isError: true } },
    })
    // @ts-expect-error -- `gone` has no entry in `outcomes`.
    defineOperation({ ...base, outcomes: { ok: { isError: false } } })
    defineOperation({
      ...base,
      // @ts-expect-error -- `lost` is no outcome of the output.
      outcomes: { ok: { isError: false }, gone: { isError: true }, lost: { isError: true } },
    })
    expect(Object.keys(complete.outcomes)).toEqual(['ok', 'gone'])
  })
})
