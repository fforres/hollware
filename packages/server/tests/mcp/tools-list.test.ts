import { createDraft, OPERATIONS, publish } from '@hollware/core'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import { createToolTable, memoizeJsonSchema } from '../../src/mcp/tools.ts'
import {
  ALL_SCOPES,
  callRaw,
  connect,
  endpointWith,
  ENTRY_ID,
  INPUTS,
  makeCall,
  oauthPrincipal,
  rpc,
  tokenPrincipal,
} from './support.ts'

const WRITER_TOOLS = [
  'comment_review',
  'content_stats',
  'create_draft',
  'delete_entry',
  'describe_site',
  'get_asset',
  'get_entry',
  'get_review',
  'get_revision',
  'get_structure',
  'get_translations',
  'list_assets',
  'list_entries',
  'list_redirects',
  'list_reviews',
  'list_revisions',
  'move_entry',
  'publish',
  'request_review',
  'restore_entry',
  'restore_revision',
  'search',
  'update_asset',
  'update_draft',
  'upload_asset',
  'validate',
]

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

function toolsOf(raw: { result: Record<string, unknown> }): readonly Record<string, unknown>[] {
  const tools: unknown = raw.result.tools
  if (!Array.isArray(tools)) throw new Error('tools/list answered no list of tools')
  return tools.filter(isRecord)
}

const READ = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
}
const CHANGE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
}
const DESTROY = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
}

const READ_ELSEWHERE = { ...READ, openWorldHint: true }
const CHANGE_ELSEWHERE = { ...CHANGE, openWorldHint: true }

const TOOLS = [
  { name: 'approve_review', title: 'Approve a review', annotations: CHANGE },
  { name: 'comment_review', title: 'Comment on a review', annotations: CHANGE },
  {
    name: 'connect_analytics',
    title: 'Connect the analytics of the site',
    annotations: CHANGE_ELSEWHERE,
  },
  { name: 'content_stats', title: 'Read what readers read', annotations: READ_ELSEWHERE },
  { name: 'create_draft', title: 'Create a draft', annotations: CHANGE },
  { name: 'create_site', title: 'Create a site', annotations: CHANGE },
  { name: 'delete_entry', title: 'Move an entry to the trash', annotations: DESTROY },
  { name: 'delete_site', title: 'Put a site in the trash', annotations: DESTROY },
  { name: 'describe_site', title: 'Describe the site', annotations: READ },
  {
    name: 'disconnect_analytics',
    title: 'Disconnect the analytics of the site',
    annotations: CHANGE,
  },
  { name: 'get_analytics', title: 'Read the analytics connection', annotations: READ },
  { name: 'get_asset', title: 'Get an image', annotations: READ },
  { name: 'get_entry', title: 'Get an entry', annotations: READ },
  { name: 'get_review', title: 'Read a review', annotations: READ },
  { name: 'get_revision', title: 'Get a revision of an entry', annotations: READ },
  { name: 'get_structure', title: 'Get the structure of the site', annotations: READ },
  { name: 'get_translations', title: 'Get the translations of an entry', annotations: READ },
  { name: 'list_assets', title: 'List the images, videos and PDFs of the site', annotations: READ },
  { name: 'list_backups', title: 'List the backups of the site', annotations: READ },
  { name: 'list_entries', title: 'List entries', annotations: READ },
  { name: 'list_redirects', title: 'List the redirects of the site', annotations: READ },
  { name: 'list_reviews', title: 'List the reviews', annotations: READ },
  { name: 'list_revisions', title: 'List the revisions of an entry', annotations: READ },
  { name: 'make_webhook_secret', title: 'Make the secret of a webhook', annotations: CHANGE },
  { name: 'move_entry', title: 'Change the slug of an entry', annotations: CHANGE },
  { name: 'publish', title: 'Publish an entry', annotations: CHANGE },
  { name: 'reject_review', title: 'Reject a review', annotations: CHANGE },
  { name: 'request_changes', title: 'Ask for changes', annotations: CHANGE },
  { name: 'request_review', title: 'Ask for a review', annotations: CHANGE },
  { name: 'restore_entry', title: 'Bring an entry back from the trash', annotations: CHANGE },
  { name: 'restore_revision', title: 'Go back to a revision', annotations: CHANGE },
  { name: 'restore_site', title: 'Bring a site back from the trash', annotations: CHANGE },
  { name: 'schedule_unpublish', title: 'Unpublish an entry at a time', annotations: DESTROY },
  { name: 'search', title: 'Search entries', annotations: READ },
  { name: 'set_collection', title: 'Add, change or remove a collection', annotations: DESTROY },
  { name: 'unpublish', title: 'Unpublish an entry', annotations: DESTROY },
  { name: 'update_asset', title: 'Change the alt of an image', annotations: CHANGE },
  { name: 'update_draft', title: 'Update a draft', annotations: CHANGE },
  { name: 'update_site', title: 'Change the structure of the site', annotations: DESTROY },
  { name: 'upload_asset', title: 'Upload an image, a video or a PDF', annotations: CHANGE },
  { name: 'validate', title: 'Validate a Markdown file', annotations: READ },
]

const OUTCOMES: Record<string, string[]> = {
  approve_review: [
    'published',
    'blocked',
    'needs_acknowledgement',
    'agents_pending',
    'conflict',
    'not_pending',
    'not_found',
  ],
  comment_review: ['commented', 'not_pending', 'not_found'],
  connect_analytics: ['connected', 'refused', 'unreachable', 'invalid', 'unavailable'],
  content_stats: ['ok', 'unavailable'],
  disconnect_analytics: ['disconnected', 'not_connected'],
  get_analytics: ['connected', 'not_connected'],
  create_draft: ['saved', 'refused', 'in_trash'],
  create_site: ['created', 'taken', 'invalid'],
  delete_entry: ['trashed', 'published', 'conflict', 'not_found'],
  delete_site: ['trashed', 'needs_confirmation', 'not_found'],
  describe_site: ['ok'],
  get_entry: ['ok', 'not_found'],
  get_review: ['ok', 'not_found'],
  get_structure: ['ok'],
  get_translations: ['ok', 'not_found'],
  list_entries: ['ok'],
  list_reviews: ['ok'],
  make_webhook_secret: ['made', 'not_found', 'unavailable'],
  upload_asset: ['created', 'exists', 'refused', 'unavailable'],
  list_assets: ['ok'],
  list_backups: ['ok', 'unavailable'],
  get_asset: ['ok', 'not_found'],
  list_revisions: ['ok', 'not_found'],
  move_entry: ['moved', 'unchanged', 'taken', 'conflict', 'not_found'],
  list_redirects: ['ok'],
  schedule_unpublish: ['scheduled', 'unpublished', 'cancelled', 'not_published', 'not_found'],
  get_revision: ['ok', 'not_found'],
  restore_revision: ['saved', 'unchanged', 'conflict', 'not_found', 'refused'],
  publish: [
    'published',
    'scheduled',
    'blocked',
    'needs_acknowledgement',
    'pending_review',
    'conflict',
    'not_found',
  ],
  reject_review: ['rejected', 'not_pending', 'not_found'],
  request_changes: ['changes_requested', 'not_pending', 'not_found'],
  request_review: ['pending_review', 'blocked', 'needs_acknowledgement', 'conflict', 'not_found'],
  restore_entry: ['restored', 'not_trashed', 'not_found'],
  restore_site: ['restored', 'not_found'],
  search: ['ok'],
  set_collection: ['updated', 'unchanged', 'invalid', 'needs_confirmation', 'conflict'],
  unpublish: ['unpublished', 'not_found'],
  update_asset: ['updated', 'unchanged', 'not_found'],
  update_draft: ['saved', 'unchanged', 'conflict', 'not_found', 'refused'],
  update_site: ['updated', 'unchanged', 'invalid', 'needs_confirmation', 'conflict'],
  validate: ['ok'],
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('tools/list', () => {
  it.each(['2026', '2025'] as const)(
    'lists one tool for each operation, sorted by name, as a %s client reads it',
    async (era) => {
      const { endpoint } = endpointWith()
      const { client } = await connect(endpoint, { era })

      const { tools } = await client.listTools()

      expect(tools.map(({ name, title, annotations }) => ({ name, title, annotations }))).toEqual(
        TOOLS,
      )
      expect(tools.map((tool) => tool.description)).toEqual(
        OPERATIONS.map((operation) => operation.description),
      )
      expect(
        tools.map((tool) => {
          const properties = tool.outputSchema?.properties
          return typeof properties === 'object' && properties !== null && 'outcome' in properties
            ? properties.outcome
            : undefined
        }),
      ).toEqual(TOOLS.map(({ name }) => ({ type: 'string', enum: OUTCOMES[name] })))
      await client.close()
    },
  )

  it('shows the input and the output schemas of the spec', async () => {
    const { endpoint } = endpointWith()
    const { client } = await connect(endpoint, { era: '2026' })

    const { tools } = await client.listTools()

    const unpublish = tools.find((tool) => tool.name === 'unpublish')
    expect(unpublish?.inputSchema).toEqual({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        id: {
          type: 'string',
          pattern: '^ent_[0-9A-HJKMNP-TV-Z]{26}$',
          description: 'The id of an entry (ent_…), as the other operations return it.',
        },
      },
      required: ['id'],
      additionalProperties: false,
    })
    expect(Object.keys(unpublish?.outputSchema?.properties ?? {})).toEqual(['outcome', 'entry'])
    const publishTool = tools.find((tool) => tool.name === 'publish')
    expect(publishTool?.inputSchema.required).toEqual(['id', 'version'])
    for (const operation of OPERATIONS) {
      const tool = tools.find((candidate) => candidate.name === operation.name)
      expect(tool?.inputSchema, operation.name).toEqual(
        operation.input['~standard'].jsonSchema.input({ target: 'draft-2020-12' }),
      )
      expect(tool?.outputSchema, operation.name).toEqual(
        operation.output['~standard'].jsonSchema.output({ target: 'draft-2020-12' }),
      )
    }
    await client.close()
  })

  it.each(['modern', 'legacy'] as const)(
    'is the same bytes for every OAuth client, whatever its scopes, and every endpoint (%s)',
    async (era) => {
      const first = endpointWith().endpoint
      const second = endpointWith().endpoint
      const reader = makeCall({ principal: oauthPrincipal(['content:read']), requestId: 'req_a' })
      const nobody = makeCall({ principal: oauthPrincipal([]), requestId: 'req_b' })
      const everything = makeCall({ principal: oauthPrincipal(ALL_SCOPES), requestId: 'req_c' })

      const answers = [
        await rpc(first, era, 'tools/list', {}, { call: reader }),
        await rpc(first, era, 'tools/list', {}, { call: reader }),
        await rpc(first, era, 'tools/list', {}, { call: nobody }),
        await rpc(first, era, 'tools/list', {}, { call: everything }),
        await rpc(second, era, 'tools/list', {}, { call: everything }),
      ]

      expect(answers.map((answer) => answer.status)).toEqual([200, 200, 200, 200, 200])
      const [firstAnswer, ...others] = answers
      expect(firstAnswer?.text.length).toBeGreaterThan(20_000)
      for (const answer of others) expect(answer.text).toBe(firstAnswer?.text)
    },
  )

  it.each(['modern', 'legacy'] as const)(
    'lists to a personal token only the tools its scopes allow, each as the whole list shows it, and still answers a call of another with the challenge (%s)',
    async (era) => {
      const { endpoint } = endpointWith()
      const writer = makeCall({
        principal: tokenPrincipal([
          'content:read',
          'content:write',
          'review:read',
          'review:comment',
        ]),
        requestId: 'req_writer',
      })
      const owner = makeCall({ principal: oauthPrincipal(ALL_SCOPES), requestId: 'req_owner' })

      const own = toolsOf(await rpc(endpoint, era, 'tools/list', {}, { call: writer }))
      const whole = toolsOf(await rpc(endpoint, era, 'tools/list', {}, { call: owner }))
      const none = toolsOf(
        await rpc(
          endpoint,
          era,
          'tools/list',
          {},
          { call: makeCall({ principal: tokenPrincipal([]) }) },
        ),
      )
      const refused = await callRaw(endpoint, era, 'unpublish', INPUTS.unpublish, { call: writer })

      expect(own.map((tool) => tool.name)).toEqual(WRITER_TOOLS)
      expect(whole).toHaveLength(41)
      for (const tool of own) {
        expect(tool, String(tool.name)).toEqual(whole.find((other) => other.name === tool.name))
      }
      expect(none).toEqual([])
      expect([refused.status, refused.headers.get('www-authenticate')]).toEqual([
        403,
        'Bearer error="insufficient_scope", error_description="unpublish requires: content:publish", scope="content:publish"',
      ])
    },
  )

  it('says that the lists of tools and prompts never change, that a client may share an OAuth list for five minutes, and that a personal token keeps its own', async () => {
    const { endpoint } = endpointWith()
    const viaOauth = { call: makeCall({ principal: oauthPrincipal() }) }

    const modern = await rpc(endpoint, 'modern', 'tools/list', {}, viaOauth)
    const personal = await rpc(endpoint, 'modern', 'tools/list')
    const legacy = await rpc(endpoint, 'legacy', 'tools/list', {}, viaOauth)
    const discover = await rpc(endpoint, 'modern', 'server/discover')
    const initialize = await rpc(endpoint, 'legacy', 'initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'raw-client', version: '0.0.0' },
    })

    expect([modern.result.ttlMs, modern.result.cacheScope]).toEqual([300_000, 'public'])
    expect([personal.result.ttlMs, personal.result.cacheScope]).toEqual([300_000, 'private'])
    expect(Object.keys(legacy.result)).toEqual(['tools'])
    expect(discover.result.capabilities).toEqual({
      tools: { listChanged: false },
      prompts: { listChanged: false },
    })
    expect(initialize.result.capabilities).toEqual({
      tools: { listChanged: false },
      prompts: { listChanged: false },
    })
    expect(initialize.result.serverInfo).toEqual({ name: 'hollware', version: '0.0.0' })
  })

  it('converts the schemas to JSON Schema once, whatever the number of requests or eras', async () => {
    const converters = OPERATIONS.flatMap((operation) => [
      vi.spyOn(operation.input['~standard'].jsonSchema, 'input'),
      vi.spyOn(operation.output['~standard'].jsonSchema, 'output'),
    ])
    const { endpoint } = endpointWith()

    await rpc(endpoint, 'modern', 'tools/list')
    await rpc(endpoint, 'modern', 'tools/list')
    await rpc(endpoint, 'legacy', 'tools/list')
    await callRaw(endpoint, 'modern', 'publish', INPUTS.publish)
    await callRaw(endpoint, 'legacy', 'create_draft', INPUTS.create_draft)
    await rpc(endpoint, 'modern', 'tools/list')

    expect(converters).toHaveLength(82)
    expect(converters.map((converter) => converter.mock.calls.length)).toEqual(
      Array.from({ length: 82 }, () => 1),
    )
  })
})

describe('the tool table', () => {
  it('sorts the operations by name, whatever order they come in', () => {
    const names = createToolTable([...OPERATIONS].reverse()).map((tool) => tool.spec.name)

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
  })

  it('refuses an operation that asks for no scope', () => {
    expect(() => createToolTable([{ ...createDraft, scopes: [] }])).toThrow(
      'create_draft asks for no scope; every tool needs at least one',
    )
  })
})

describe('the cached schemas', () => {
  it('validate and fill the defaults as the Zod schema does', async () => {
    const standard = memoizeJsonSchema(publish.input)['~standard']

    expect(await standard.validate({ id: ENTRY_ID, version: 3 })).toEqual({
      value: { id: ENTRY_ID, version: 3, acknowledgeWarnings: [], group: [] },
    })
    const refused = await standard.validate({ id: 'nope', version: 3 })
    expect(refused.issues?.map((issue) => issue.path)).toEqual([['id']])
  })

  it('keep the conversion of the input and of the output apart, and each target apart', () => {
    const zod = publish.input['~standard'].jsonSchema
    const memoized = memoizeJsonSchema(publish.input)['~standard'].jsonSchema
    const draft = { target: 'draft-2020-12' } as const
    const older = { target: 'draft-07' } as const

    const input = memoized.input(draft)
    const output = memoized.output(draft)
    const olderInput = memoized.input(older)

    expect(input).toEqual(zod.input(draft))
    expect(output).toEqual(zod.output(draft))
    expect(olderInput).toEqual(zod.input(older))
    expect(input.required).toEqual(['id', 'version'])
    expect(output.required).toEqual(['id', 'version', 'acknowledgeWarnings', 'group'])
    expect(olderInput).not.toEqual(input)
  })

  it('are converted again when the library is given options, which can change the result', () => {
    const schema = publish.input['~standard']
    const converter = vi.spyOn(schema.jsonSchema, 'input')
    const memoized = memoizeJsonSchema(publish.input)['~standard'].jsonSchema

    memoized.input({ target: 'draft-2020-12' })
    memoized.input({ target: 'draft-2020-12' })
    memoized.input({ target: 'draft-07' })
    memoized.input({ target: 'draft-07', libraryOptions: { unrepresentable: 'any' } })
    memoized.input({ target: 'draft-07', libraryOptions: { unrepresentable: 'any' } })

    expect(converter).toHaveBeenCalledTimes(4)
  })
})
