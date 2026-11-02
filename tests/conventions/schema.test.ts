import { is } from 'drizzle-orm'
import { getTableConfig, SQLiteTable } from 'drizzle-orm/sqlite-core'
import { describe, expect, it } from 'vite-plus/test'
import * as schema from '../../packages/server/src/db/schema.ts'
import {
  exceptionValues,
  TABLES_WITHOUT_SHARED_COLUMNS,
  TABLES_WITHOUT_SITE,
} from '../guards/exceptions.ts'
import { checkSchema, type SchemaTable } from '../guards/schema.ts'
import { describeViolations } from '../guards/types.ts'

function describeTable(table: SQLiteTable): SchemaTable {
  const config = getTableConfig(table)
  return {
    name: config.name,
    columns: config.columns.map((column) => ({
      name: column.name,
      notNull: column.notNull,
      primary: column.primary,
    })),
    uniques: [
      ...config.uniqueConstraints.map((unique) => unique.columns.map((column) => column.name)),
      ...config.indexes
        .filter((index) => index.config.unique)
        .map((index) =>
          index.config.columns.map((column) => ('name' in column ? column.name : '')),
        ),
    ],
    foreignKeys: config.foreignKeys.map((fk) => {
      const reference = fk.reference()
      return {
        columns: reference.columns.map((column) => column.name),
        table: getTableConfig(reference.foreignTable).name,
        foreignColumns: reference.foreignColumns.map((column) => column.name),
      }
    }),
  }
}

const SITE_TABLE: SchemaTable = {
  name: 'sites',
  columns: [
    { name: 'id', notNull: true, primary: true },
    { name: 'created_at', notNull: true, primary: false },
    { name: 'updated_at', notNull: true, primary: false },
  ],
  uniques: [],
  foreignKeys: [],
}

function siteTable(name: string, overrides: Partial<SchemaTable> = {}): SchemaTable {
  return {
    name,
    columns: [
      { name: 'id', notNull: true, primary: true },
      { name: 'site_id', notNull: true, primary: false },
      { name: 'created_at', notNull: true, primary: false },
      { name: 'updated_at', notNull: true, primary: false },
    ],
    uniques: [['id', 'site_id']],
    foreignKeys: [{ columns: ['site_id'], table: 'sites', foreignColumns: ['id'] }],
    ...overrides,
  }
}

describe('D1 schema', () => {
  it('every table of the schema follows the shape and the site rules', () => {
    const exported: unknown[] = Object.values(schema)
    const tables = exported
      .filter((value): value is SQLiteTable => is(value, SQLiteTable))
      .map(describeTable)
    expect(tables.map((table) => table.name).sort()).toEqual([
      '_hollware_meta',
      'agent_grants',
      'anonymizations',
      'assets',
      'audit_log',
      'auth_challenges',
      'deliveries',
      'entries',
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
    const violations = checkSchema({
      tables,
      withoutSite: exceptionValues(TABLES_WITHOUT_SITE),
      withoutSharedColumns: exceptionValues(TABLES_WITHOUT_SHARED_COLUMNS),
    })
    expect(describeViolations(violations)).toEqual([])
  })

  describe('self-test: the guard fails on a bad fixture', () => {
    const check = (...tables: SchemaTable[]) =>
      checkSchema({
        tables: [SITE_TABLE, ...tables],
        withoutSite: ['sites'],
        withoutSharedColumns: [],
      })

    it('accepts a site table with its composite key to another site table', () => {
      const child = siteTable('children', {
        foreignKeys: [
          { columns: ['site_id'], table: 'sites', foreignColumns: ['id'] },
          {
            columns: ['parent_id', 'site_id'],
            table: 'parents',
            foreignColumns: ['id', 'site_id'],
          },
        ],
      })
      expect(check(siteTable('parents'), child)).toEqual([])
    })

    it('reports a foreign key between site tables that does not carry site_id', () => {
      const child = siteTable('children', {
        foreignKeys: [
          { columns: ['site_id'], table: 'sites', foreignColumns: ['id'] },
          { columns: ['parent_id'], table: 'parents', foreignColumns: ['id'] },
        ],
      })
      expect(check(siteTable('parents'), child)).toEqual([
        {
          rule: 'schema/composite-key',
          file: 'packages/server/src/db/schema.ts',
          message:
            'children (parent_id) → parents (id) must carry site_id onto site_id, so a row can only point at rows of its own site',
        },
      ])
    })

    it('reports a table without site_id, its key to sites or its unique (id, site_id)', () => {
      const messages = (table: SchemaTable) => check(table).map((violation) => violation.message)
      expect(
        messages(
          siteTable('loose', {
            columns: [
              { name: 'id', notNull: true, primary: true },
              { name: 'created_at', notNull: true, primary: false },
              { name: 'updated_at', notNull: true, primary: false },
            ],
          }),
        ),
      ).toEqual(['loose has no not-null "site_id": every table belongs to a site'])
      expect(messages(siteTable('loose', { foreignKeys: [] }))).toEqual([
        'loose has no foreign key from "site_id" to sites(id)',
      ])
      expect(messages(siteTable('loose', { uniques: [['site_id', 'id']] }))).toEqual([
        'loose has no unique key on (id, site_id), which the composite foreign keys of other tables point at',
      ])
    })

    it('reports a table without its id primary key or its timestamps', () => {
      const result = check(
        siteTable('bare', {
          columns: [
            { name: 'id', notNull: true, primary: false },
            { name: 'site_id', notNull: true, primary: false },
            { name: 'created_at', notNull: false, primary: false },
          ],
        }),
      )
      expect(result.map((violation) => violation.message)).toEqual([
        'bare has no "id" primary key: use id(prefix) from columns.ts',
        'bare has no not-null "created_at": use timestamps() from columns.ts',
        'bare has no not-null "updated_at": use timestamps() from columns.ts',
      ])
    })

    it('reports an exception that names no table, or a table that has site_id after all', () => {
      const result = checkSchema({
        tables: [SITE_TABLE, siteTable('entries')],
        withoutSite: ['sites', 'entries', 'gone'],
        withoutSharedColumns: [],
      })
      expect(result.map((violation) => violation.message)).toEqual([
        'the exception withoutSite names "gone", which is not a table',
        'entries has "site_id" but is listed in TABLES_WITHOUT_SITE: remove it from the list',
      ])
    })
  })
})
