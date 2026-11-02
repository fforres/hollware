import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  integer,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import { id, siteId, timestamps } from './columns.ts'

export const hollwareMeta = sqliteTable('_hollware_meta', {
  key: text('key').primaryKey().notNull(),
  value: text('value').notNull(),
})

export const sites = sqliteTable('sites', {
  id: text('id').primaryKey(),
  definition: text('definition'),
  version: integer('version').notNull().default(0),
  deletedAt: text('deleted_at'),
  ...timestamps(),
})

export const users = sqliteTable(
  'users',
  {
    id: id('usr'),
    name: text('name'),
    role: text('role').notNull(),
    ...timestamps(),
    email: text('email'),
    emailVerifiedAt: text('email_verified_at'),
    kind: text('kind', { enum: ['person', 'agent'] })
      .notNull()
      .default('person'),
  },
  (t) => [
    check('users_role', sql`${t.role} IN ('owner', 'editor', 'reviewer')`),
    uniqueIndex('users_email').on(t.email),
  ],
)

export const identities = sqliteTable(
  'identities',
  {
    id: id('idn'),
    userId: text('user_id').notNull(),
    provider: text('provider').notNull(),
    subject: text('subject').notNull(),
    email: text('email'),
    ...timestamps(),
  },
  (t) => [
    unique('identities_subject').on(t.provider, t.subject),
    index('identities_user').on(t.userId),
    foreignKey({ name: 'identities_user_fk', columns: [t.userId], foreignColumns: [users.id] }),
  ],
)

export const members = sqliteTable(
  'members',
  {
    id: id('mbr'),
    siteId: siteId(),
    userId: text('user_id').notNull(),
    role: text('role').notNull(),
    ...timestamps(),
  },
  (t) => [
    unique('members_id_site').on(t.id, t.siteId),
    unique('members_person').on(t.siteId, t.userId),
    foreignKey({ name: 'members_site', columns: [t.siteId], foreignColumns: [sites.id] }),
    foreignKey({ name: 'members_user', columns: [t.userId], foreignColumns: [users.id] }),
    check('members_role', sql`${t.role} IN ('owner', 'admin', 'editor', 'author', 'reviewer')`),
  ],
)

export const tokens = sqliteTable(
  'tokens',
  {
    id: id('tok'),
    siteId: siteId(),
    userId: text('user_id').notNull(),
    label: text('label').notNull(),
    hash: text('hash').notNull(),
    kind: text('kind', { enum: ['personal', 'read'] })
      .notNull()
      .default('personal'),
    scopes: text('scopes').notNull(),
    expiresAt: text('expires_at'),
    revokedAt: text('revoked_at'),
    lastUsedAt: text('last_used_at'),
    ...timestamps(),
  },
  (t) => [
    unique('tokens_id_site').on(t.id, t.siteId),
    unique('tokens_hash').on(t.hash),
    foreignKey({ name: 'tokens_site', columns: [t.siteId], foreignColumns: [sites.id] }),
    foreignKey({ name: 'tokens_user', columns: [t.userId], foreignColumns: [users.id] }),
    check('tokens_scopes', sql`json_valid(${t.scopes}) AND json_type(${t.scopes}) = 'array'`),
  ],
)

export const entries = sqliteTable(
  'entries',
  {
    id: id('ent'),
    siteId: siteId(),
    collection: text('collection').notNull(),
    locale: text('locale').notNull(),
    slug: text('slug').notNull(),
    translationGroup: text('translation_group'),
    status: text('status').notNull(),
    version: integer('version').notNull(),
    headRev: text('head_rev').notNull(),
    publishedRev: text('published_rev'),
    publishedAt: text('published_at'),
    publishedSortKey: text('published_sort_key'),
    scheduledAt: text('scheduled_at'),
    deletedAt: text('deleted_at'),
    ...timestamps(),
  },
  (t) => [
    unique('entries_id_site').on(t.id, t.siteId),
    unique('entries_slug').on(t.siteId, t.collection, t.locale, t.slug),
    unique('entries_translation').on(t.siteId, t.collection, t.translationGroup, t.locale),
    index('entries_head').on(t.siteId, t.collection, t.updatedAt, t.id),
    index('entries_head_locale').on(t.siteId, t.collection, t.locale, t.updatedAt, t.id),
    index('entries_published')
      .on(t.siteId, t.collection, t.locale, t.publishedSortKey, t.id)
      .where(sql`${t.status} = 'published'`),
    foreignKey({ name: 'entries_site', columns: [t.siteId], foreignColumns: [sites.id] }),
    check('entries_status', sql`${t.status} IN ('draft', 'scheduled', 'published')`),
    check('entries_version', sql`${t.version} >= 1`),
    check(
      'entries_draft',
      sql`${t.status} <> 'draft' OR (${t.publishedRev} IS NULL AND ${t.publishedSortKey} IS NULL AND ${t.scheduledAt} IS NULL)`,
    ),
    check(
      'entries_published',
      sql`${t.status} <> 'published' OR (${t.publishedRev} IS NOT NULL AND ${t.publishedAt} IS NOT NULL AND ${t.publishedSortKey} IS NOT NULL)`,
    ),
    check('entries_scheduled', sql`${t.status} <> 'scheduled' OR ${t.scheduledAt} IS NOT NULL`),
  ],
)

export const revisions = sqliteTable(
  'revisions',
  {
    id: id('rev'),
    siteId: siteId(),
    entryId: text('entry_id').notNull(),
    markdown: text('markdown').notNull(),
    frontmatter: text('frontmatter').notNull(),
    document: text('document').notNull(),
    comarkVersion: text('comark_version').notNull(),
    pipelineVersion: text('pipeline_version').notNull(),
    wordCount: integer('word_count').notNull(),
    codeWords: integer('code_words').notNull().default(0),
    verdict: text('verdict').notNull(),
    actorKind: text('actor_kind').notNull(),
    actorUserId: text('actor_user_id').notNull(),
    actorTokenId: text('actor_token_id'),
    actorMeta: text('actor_meta'),
    ...timestamps(),
  },
  (t) => [
    unique('revisions_id_site').on(t.id, t.siteId),
    index('revisions_entry').on(t.entryId, t.createdAt),
    foreignKey({ name: 'revisions_site', columns: [t.siteId], foreignColumns: [sites.id] }),
    foreignKey({
      name: 'revisions_entry',
      columns: [t.entryId, t.siteId],
      foreignColumns: [entries.id, entries.siteId],
    }),
    foreignKey({ name: 'revisions_user', columns: [t.actorUserId], foreignColumns: [users.id] }),
    foreignKey({
      name: 'revisions_token',
      columns: [t.actorTokenId, t.siteId],
      foreignColumns: [tokens.id, tokens.siteId],
    }),
    check('revisions_actor_kind', sql`${t.actorKind} IN ('token', 'user', 'oauth_client')`),
    check(
      'revisions_json',
      sql`json_valid(${t.frontmatter}) AND json_valid(${t.document}) AND json_valid(${t.verdict}) AND (${t.actorMeta} IS NULL OR json_valid(${t.actorMeta}))`,
    ),
    check('revisions_word_count', sql`${t.wordCount} >= 0`),
  ],
)

export const revisionTags = sqliteTable(
  'revision_tags',
  {
    id: id('tag'),
    siteId: siteId(),
    revisionId: text('revision_id').notNull(),
    tag: text('tag').notNull(),
    ...timestamps(),
  },
  (t) => [
    unique('revision_tags_id_site').on(t.id, t.siteId),
    unique('revision_tags_tag').on(t.revisionId, t.tag),
    index('revision_tags_by_tag').on(t.siteId, t.tag),
    foreignKey({ name: 'revision_tags_site', columns: [t.siteId], foreignColumns: [sites.id] }),
    foreignKey({
      name: 'revision_tags_revision',
      columns: [t.revisionId, t.siteId],
      foreignColumns: [revisions.id, revisions.siteId],
    }),
  ],
)

export const publications = sqliteTable(
  'publications',
  {
    id: id('pub'),
    siteId: siteId(),
    entryId: text('entry_id').notNull(),
    action: text('action').notNull(),
    revisionId: text('revision_id'),
    verdict: text('verdict'),
    acknowledged: text('acknowledged').notNull(),
    actorKind: text('actor_kind').notNull(),
    actorUserId: text('actor_user_id').notNull(),
    actorTokenId: text('actor_token_id'),
    actorMeta: text('actor_meta'),
    ...timestamps(),
  },
  (t) => [
    unique('publications_id_site').on(t.id, t.siteId),
    index('publications_entry').on(t.entryId, t.createdAt),
    foreignKey({ name: 'publications_site', columns: [t.siteId], foreignColumns: [sites.id] }),
    foreignKey({
      name: 'publications_entry',
      columns: [t.entryId, t.siteId],
      foreignColumns: [entries.id, entries.siteId],
    }),
    foreignKey({
      name: 'publications_revision',
      columns: [t.revisionId, t.siteId],
      foreignColumns: [revisions.id, revisions.siteId],
    }),
    foreignKey({
      name: 'publications_user',
      columns: [t.actorUserId],
      foreignColumns: [users.id],
    }),
    foreignKey({
      name: 'publications_token',
      columns: [t.actorTokenId, t.siteId],
      foreignColumns: [tokens.id, tokens.siteId],
    }),
    check('publications_action', sql`${t.action} IN ('publish', 'unpublish')`),
    check(
      'publications_shape',
      sql`(${t.action} = 'publish' AND ${t.revisionId} IS NOT NULL AND ${t.verdict} IS NOT NULL) OR (${t.action} = 'unpublish' AND ${t.revisionId} IS NULL AND ${t.verdict} IS NULL)`,
    ),
    check('publications_actor_kind', sql`${t.actorKind} IN ('token', 'user', 'oauth_client')`),
    check(
      'publications_json',
      sql`json_valid(${t.acknowledged}) AND json_type(${t.acknowledged}) = 'array' AND (${t.verdict} IS NULL OR json_valid(${t.verdict})) AND (${t.actorMeta} IS NULL OR json_valid(${t.actorMeta}))`,
    ),
  ],
)

export const schedules = sqliteTable(
  'schedules',
  {
    id: id('sch'),
    siteId: siteId(),
    entryId: text('entry_id').notNull(),
    scheduledAt: text('scheduled_at').notNull(),
    version: integer('version').notNull(),
    acknowledged: text('acknowledged').notNull(),
    actorKind: text('actor_kind').notNull(),
    actorUserId: text('actor_user_id').notNull(),
    actorTokenId: text('actor_token_id'),
    actorMeta: text('actor_meta'),
    ...timestamps(),
  },
  (t) => [
    unique('schedules_id_site').on(t.id, t.siteId),
    unique('schedules_entry').on(t.siteId, t.entryId),
    index('schedules_due').on(t.scheduledAt),
    foreignKey({ name: 'schedules_site', columns: [t.siteId], foreignColumns: [sites.id] }),
    foreignKey({
      name: 'schedules_entry_fk',
      columns: [t.entryId, t.siteId],
      foreignColumns: [entries.id, entries.siteId],
    }),
    foreignKey({ name: 'schedules_user', columns: [t.actorUserId], foreignColumns: [users.id] }),
    foreignKey({
      name: 'schedules_token',
      columns: [t.actorTokenId, t.siteId],
      foreignColumns: [tokens.id, tokens.siteId],
    }),
    check('schedules_actor_kind', sql`${t.actorKind} IN ('token', 'user', 'oauth_client')`),
    check(
      'schedules_json',
      sql`json_valid(${t.acknowledged}) AND json_type(${t.acknowledged}) = 'array' AND (${t.actorMeta} IS NULL OR json_valid(${t.actorMeta}))`,
    ),
  ],
)

export const anonymizations = sqliteTable(
  'anonymizations',
  {
    id: id('anm'),
    siteId: siteId(),
    userId: text('user_id').notNull(),
    ...timestamps(),
  },
  (t) => [
    unique('anonymizations_id_site').on(t.id, t.siteId),
    foreignKey({ name: 'anonymizations_site', columns: [t.siteId], foreignColumns: [sites.id] }),
  ],
)

export const entryPurges = sqliteTable(
  'entry_purges',
  {
    id: id('prg'),
    siteId: siteId(),
    entryId: text('entry_id').notNull(),
    purgedBy: text('purged_by').notNull(),
    ...timestamps(),
  },
  (t) => [
    unique('entry_purges_id_site').on(t.id, t.siteId),
    unique('entry_purges_entry').on(t.siteId, t.entryId),
    foreignKey({ name: 'entry_purges_site', columns: [t.siteId], foreignColumns: [sites.id] }),
  ],
)

export const redirects = sqliteTable(
  'redirects',
  {
    id: id('rdr'),
    siteId: siteId(),
    collection: text('collection').notNull(),
    locale: text('locale').notNull(),
    fromSlug: text('from_slug').notNull(),
    entryId: text('entry_id').notNull(),
    ...timestamps(),
  },
  (t) => [
    unique('redirects_id_site').on(t.id, t.siteId),
    unique('redirects_from').on(t.siteId, t.collection, t.locale, t.fromSlug),
    index('redirects_entry').on(t.siteId, t.entryId),
    foreignKey({ name: 'redirects_site', columns: [t.siteId], foreignColumns: [sites.id] }),
    foreignKey({
      name: 'redirects_entry_fk',
      columns: [t.entryId, t.siteId],
      foreignColumns: [entries.id, entries.siteId],
    }),
  ],
)

export const unpublishes = sqliteTable(
  'unpublishes',
  {
    id: id('unp'),
    siteId: siteId(),
    entryId: text('entry_id').notNull(),
    unpublishAt: text('unpublish_at').notNull(),
    actorKind: text('actor_kind').notNull(),
    actorUserId: text('actor_user_id').notNull(),
    actorTokenId: text('actor_token_id'),
    actorMeta: text('actor_meta'),
    ...timestamps(),
  },
  (t) => [
    unique('unpublishes_id_site').on(t.id, t.siteId),
    unique('unpublishes_entry').on(t.siteId, t.entryId),
    index('unpublishes_due').on(t.unpublishAt),
    foreignKey({ name: 'unpublishes_site', columns: [t.siteId], foreignColumns: [sites.id] }),
    foreignKey({
      name: 'unpublishes_entry_fk',
      columns: [t.entryId, t.siteId],
      foreignColumns: [entries.id, entries.siteId],
    }),
    foreignKey({ name: 'unpublishes_user', columns: [t.actorUserId], foreignColumns: [users.id] }),
    foreignKey({
      name: 'unpublishes_token',
      columns: [t.actorTokenId, t.siteId],
      foreignColumns: [tokens.id, tokens.siteId],
    }),
    check('unpublishes_actor_kind', sql`${t.actorKind} IN ('token', 'user', 'oauth_client')`),
    check('unpublishes_json', sql`${t.actorMeta} IS NULL OR json_valid(${t.actorMeta})`),
  ],
)

export const outbox = sqliteTable(
  'outbox',
  {
    id: id('evt'),
    siteId: siteId(),
    kind: text('kind').notNull(),
    entryId: text('entry_id'),
    payload: text('payload').notNull(),
    sentAt: text('sent_at'),
    abandonedAt: text('abandoned_at'),
    ...timestamps(),
  },
  (t) => [
    unique('outbox_id_site').on(t.id, t.siteId),
    index('outbox_unsent').on(t.sentAt, t.createdAt),
    foreignKey({ name: 'outbox_site', columns: [t.siteId], foreignColumns: [sites.id] }),
    check(
      'outbox_kind',
      sql`${t.kind} IN ('entry.published', 'entry.unpublished', 'site.changed', 'review.requested', 'review.decided')`,
    ),
    check('outbox_entry', sql`(${t.kind} = 'site.changed') = (${t.entryId} IS NULL)`),
    check('outbox_json', sql`json_valid(${t.payload}) AND json_type(${t.payload}) = 'object'`),
  ],
)

export const deliveries = sqliteTable(
  'deliveries',
  {
    id: id('dlv'),
    siteId: siteId(),
    eventId: text('event_id').notNull(),
    subscriber: text('subscriber').notNull(),
    attempts: integer('attempts').notNull(),
    deliveredAt: text('delivered_at'),
    lastError: text('last_error'),
    ...timestamps(),
  },
  (t) => [
    unique('deliveries_id_site').on(t.id, t.siteId),
    unique('deliveries_event_subscriber').on(t.eventId, t.subscriber),
    foreignKey({ name: 'deliveries_site', columns: [t.siteId], foreignColumns: [sites.id] }),
    foreignKey({
      name: 'deliveries_event',
      columns: [t.eventId, t.siteId],
      foreignColumns: [outbox.id, outbox.siteId],
    }),
    check('deliveries_attempts', sql`${t.attempts} >= 0`),
  ],
)

export const passkeys = sqliteTable(
  'passkeys',
  {
    id: id('pky'),
    userId: text('user_id').notNull(),
    credentialId: text('credential_id').notNull(),
    publicKey: text('public_key').notNull(),
    counter: integer('counter').notNull(),
    transports: text('transports').notNull(),
    label: text('label').notNull(),
    lastUsedAt: text('last_used_at'),
    ...timestamps(),
  },
  (t) => [
    unique('passkeys_credential').on(t.credentialId),
    index('passkeys_user').on(t.userId),
    foreignKey({ name: 'passkeys_user_fk', columns: [t.userId], foreignColumns: [users.id] }),
    check('passkeys_counter', sql`${t.counter} >= 0`),
    check(
      'passkeys_json',
      sql`json_valid(${t.transports}) AND json_type(${t.transports}) = 'array'`,
    ),
  ],
)

export const invitations = sqliteTable(
  'invitations',
  {
    id: id('inv'),
    siteId: siteId(),
    hash: text('hash').notNull(),
    role: text('role').notNull(),
    userId: text('user_id'),
    expiresAt: text('expires_at').notNull(),
    usedAt: text('used_at'),
    ...timestamps(),
    email: text('email'),
    revokedAt: text('revoked_at'),
    sentAt: text('sent_at'),
  },
  (t) => [
    unique('invitations_id_site').on(t.id, t.siteId),
    unique('invitations_hash').on(t.hash),
    foreignKey({ name: 'invitations_site', columns: [t.siteId], foreignColumns: [sites.id] }),
    foreignKey({ name: 'invitations_user', columns: [t.userId], foreignColumns: [users.id] }),
    check('invitations_role', sql`${t.role} IN ('owner', 'admin', 'editor', 'author', 'reviewer')`),
  ],
)

export const authChallenges = sqliteTable(
  'auth_challenges',
  {
    id: id('chl'),
    challenge: text('challenge').notNull(),
    purpose: text('purpose').notNull(),
    invitationId: text('invitation_id'),
    userId: text('user_id'),
    expiresAt: text('expires_at').notNull(),
    ...timestamps(),
    provider: text('provider'),
    nonce: text('nonce'),
    codeVerifier: text('code_verifier'),
    returnTo: text('return_to'),
  },
  (t) => [
    check(
      'auth_challenges_purpose',
      sql`${t.purpose} IN ('register', 'authenticate', 'federate', 'enroll', 'accept')`,
    ),
  ],
)

export const sessions = sqliteTable(
  'sessions',
  {
    id: id('ses'),
    userId: text('user_id').notNull(),
    hash: text('hash').notNull(),
    expiresAt: text('expires_at').notNull(),
    ...timestamps(),
  },
  (t) => [
    unique('sessions_hash').on(t.hash),
    foreignKey({ name: 'sessions_user', columns: [t.userId], foreignColumns: [users.id] }),
  ],
)

export const reviews = sqliteTable(
  'reviews',
  {
    id: id('rvw'),
    siteId: siteId(),
    entryId: text('entry_id').notNull(),
    revisionId: text('revision_id').notNull(),
    status: text('status').notNull(),
    acknowledged: text('acknowledged').notNull(),
    requestedBy: text('requested_by').notNull(),
    requestedMeta: text('requested_meta'),
    decidedBy: text('decided_by'),
    decidedAt: text('decided_at'),
    note: text('note'),
    ...timestamps(),
  },
  (t) => [
    unique('reviews_id_site').on(t.id, t.siteId),
    uniqueIndex('reviews_pending')
      .on(t.siteId, t.entryId)
      .where(sql`${t.status} = 'pending'`),
    index('reviews_queue').on(t.siteId, t.status, t.createdAt),
    foreignKey({ name: 'reviews_site', columns: [t.siteId], foreignColumns: [sites.id] }),
    foreignKey({
      name: 'reviews_entry',
      columns: [t.entryId, t.siteId],
      foreignColumns: [entries.id, entries.siteId],
    }),
    foreignKey({
      name: 'reviews_revision',
      columns: [t.revisionId, t.siteId],
      foreignColumns: [revisions.id, revisions.siteId],
    }),
    foreignKey({ name: 'reviews_requester', columns: [t.requestedBy], foreignColumns: [users.id] }),
    foreignKey({ name: 'reviews_decider', columns: [t.decidedBy], foreignColumns: [users.id] }),
    check(
      'reviews_status',
      sql`${t.status} IN ('pending', 'approved', 'changes_requested', 'rejected', 'cancelled')`,
    ),
    check(
      'reviews_decided',
      sql`(${t.status} IN ('pending', 'cancelled')) OR (${t.decidedBy} IS NOT NULL AND ${t.decidedAt} IS NOT NULL)`,
    ),
    check(
      'reviews_json',
      sql`json_valid(${t.acknowledged}) AND json_type(${t.acknowledged}) = 'array' AND (${t.requestedMeta} IS NULL OR json_valid(${t.requestedMeta}))`,
    ),
  ],
)

export const reviewItems = sqliteTable(
  'review_items',
  {
    id: id('rvi'),
    siteId: siteId(),
    reviewId: text('review_id').notNull(),
    entryId: text('entry_id').notNull(),
    revisionId: text('revision_id'),
    baseRevisionId: text('base_revision_id'),
    action: text('action').notNull(),
    excluded: integer('excluded').notNull().default(0),
    active: integer('active').notNull(),
    ...timestamps(),
  },
  (t) => [
    unique('review_items_id_site').on(t.id, t.siteId),
    uniqueIndex('review_items_active')
      .on(t.siteId, t.entryId)
      .where(sql`${t.active} = 1`),
    index('review_items_review').on(t.siteId, t.reviewId),
    foreignKey({ name: 'review_items_site', columns: [t.siteId], foreignColumns: [sites.id] }),
    foreignKey({
      name: 'review_items_review_fk',
      columns: [t.reviewId, t.siteId],
      foreignColumns: [reviews.id, reviews.siteId],
    }),
    foreignKey({
      name: 'review_items_entry',
      columns: [t.entryId, t.siteId],
      foreignColumns: [entries.id, entries.siteId],
    }),
    foreignKey({
      name: 'review_items_revision',
      columns: [t.revisionId, t.siteId],
      foreignColumns: [revisions.id, revisions.siteId],
    }),
    foreignKey({
      name: 'review_items_base',
      columns: [t.baseRevisionId, t.siteId],
      foreignColumns: [revisions.id, revisions.siteId],
    }),
    check('review_items_action', sql`${t.action} IN ('publish', 'unpublish')`),
    check(
      'review_items_revision_of_action',
      sql`(${t.action} = 'publish') = (${t.revisionId} IS NOT NULL)`,
    ),
    check('review_items_flags', sql`${t.excluded} IN (0, 1) AND ${t.active} IN (0, 1)`),
  ],
)

export const entryEmbeddings = sqliteTable(
  'entry_embeddings',
  {
    id: id('emb'),
    siteId: siteId(),
    entryId: text('entry_id').notNull(),
    revisionId: text('revision_id').notNull(),
    model: text('model').notNull(),
    chunkerVersion: text('chunker_version').notNull(),
    pieces: integer('pieces').notNull(),
    related: text('related').notNull().default('[]'),
    ...timestamps(),
  },
  (t) => [
    unique('entry_embeddings_id_site').on(t.id, t.siteId),
    unique('entry_embeddings_entry').on(t.siteId, t.entryId),
    foreignKey({ name: 'entry_embeddings_site', columns: [t.siteId], foreignColumns: [sites.id] }),
    foreignKey({
      name: 'entry_embeddings_entry_fk',
      columns: [t.entryId, t.siteId],
      foreignColumns: [entries.id, entries.siteId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'entry_embeddings_revision_fk',
      columns: [t.revisionId, t.siteId],
      foreignColumns: [revisions.id, revisions.siteId],
    }),
    check('entry_embeddings_pieces', sql`${t.pieces} >= 1`),
  ],
)

export const siteChanges = sqliteTable(
  'site_changes',
  {
    id: id('sit'),
    siteId: siteId(),
    version: integer('version').notNull(),
    actorUserId: text('actor_user_id'),
    actorMeta: text('actor_meta'),
    before: text('before'),
    after: text('after'),
    ...timestamps(),
  },
  (t) => [
    unique('site_changes_id_site').on(t.id, t.siteId),
    unique('site_changes_version').on(t.siteId, t.version),
    foreignKey({ name: 'site_changes_site', columns: [t.siteId], foreignColumns: [sites.id] }),
    foreignKey({ name: 'site_changes_user', columns: [t.actorUserId], foreignColumns: [users.id] }),
    check(
      'site_changes_json',
      sql`(${t.before} IS NULL OR json_valid(${t.before})) AND (${t.after} IS NULL OR json_valid(${t.after})) AND (${t.actorMeta} IS NULL OR json_valid(${t.actorMeta}))`,
    ),
  ],
)

export const siteSecrets = sqliteTable(
  'site_secrets',
  {
    id: id('sec'),
    siteId: siteId(),
    name: text('name').notNull(),
    sealed: text('sealed').notNull(),
    ...timestamps(),
  },
  (t) => [
    unique('site_secrets_id_site').on(t.id, t.siteId),
    unique('site_secrets_name').on(t.siteId, t.name),
    foreignKey({ name: 'site_secrets_site', columns: [t.siteId], foreignColumns: [sites.id] }),
  ],
)

export const siteAnalytics = sqliteTable(
  'site_analytics',
  {
    id: id('ana'),
    siteId: siteId(),
    provider: text('provider', { enum: ['cloudflare', 'ga4', 'plausible', 'posthog'] }).notNull(),
    settings: text('settings').notNull(),
    sealed: text('sealed').notNull(),
    checkedAt: text('checked_at'),
    ...timestamps(),
  },
  (t) => [
    unique('site_analytics_id_site').on(t.id, t.siteId),
    unique('site_analytics_site').on(t.siteId),
    foreignKey({ name: 'site_analytics_site_fk', columns: [t.siteId], foreignColumns: [sites.id] }),
    check('site_analytics_json', sql`json_valid(${t.settings})`),
    check(
      'site_analytics_provider',
      sql`${t.provider} IN ('cloudflare', 'ga4', 'plausible', 'posthog')`,
    ),
  ],
)

export const reviewComments = sqliteTable(
  'review_comments',
  {
    id: id('rvc'),
    siteId: siteId(),
    reviewId: text('review_id').notNull(),
    authorId: text('author_id').notNull(),
    authorMeta: text('author_meta'),
    body: text('body').notNull(),
    ...timestamps(),
    entryId: text('entry_id'),
    lineFrom: integer('line_from'),
    lineTo: integer('line_to'),
  },
  (t) => [
    unique('review_comments_id_site').on(t.id, t.siteId),
    index('review_comments_review').on(t.siteId, t.reviewId, t.createdAt),
    foreignKey({ name: 'review_comments_site', columns: [t.siteId], foreignColumns: [sites.id] }),
    foreignKey({
      name: 'review_comments_review_fk',
      columns: [t.reviewId, t.siteId],
      foreignColumns: [reviews.id, reviews.siteId],
    }),
    foreignKey({
      name: 'review_comments_author',
      columns: [t.authorId],
      foreignColumns: [users.id],
    }),
    check('review_comments_body', sql`length(${t.body}) BETWEEN 1 AND 4000`),
  ],
)

export const auditLog = sqliteTable(
  'audit_log',
  {
    id: id('aud'),
    siteId: siteId(),
    action: text('action').notNull(),
    outcome: text('outcome').notNull(),
    errorCode: text('error_code'),
    actorKind: text('actor_kind').notNull(),
    actorUserId: text('actor_user_id'),
    actorTokenId: text('actor_token_id'),
    actorClientId: text('actor_client_id'),
    actorMeta: text('actor_meta'),
    targetType: text('target_type'),
    targetId: text('target_id'),
    detail: text('detail'),
    requestId: text('request_id'),
    ipHash: text('ip_hash'),
    ...timestamps(),
  },
  (t) => [
    unique('audit_log_id_site').on(t.id, t.siteId),
    index('audit_log_site_time').on(t.siteId, t.createdAt, t.id),
    index('audit_log_actor').on(t.siteId, t.actorUserId, t.createdAt),
    index('audit_log_target').on(t.siteId, t.targetType, t.targetId, t.createdAt),
    foreignKey({ name: 'audit_log_site', columns: [t.siteId], foreignColumns: [sites.id] }),
    check('audit_log_outcome', sql`${t.outcome} IN ('ok', 'denied', 'failed')`),
    check(
      'audit_log_actor_kind',
      sql`${t.actorKind} IN ('user', 'token', 'oauth_client', 'system')`,
    ),
    check(
      'audit_log_json',
      sql`(${t.actorMeta} IS NULL OR json_valid(${t.actorMeta})) AND (${t.detail} IS NULL OR json_valid(${t.detail}))`,
    ),
    check(
      'audit_log_sizes',
      sql`length(${t.action}) <= 64 AND (${t.detail} IS NULL OR length(${t.detail}) <= 2000) AND (${t.actorMeta} IS NULL OR length(${t.actorMeta}) <= 2000)`,
    ),
  ],
)

export const assets = sqliteTable(
  'assets',
  {
    id: id('ast'),
    siteId: siteId(),
    sha256: text('sha256').notNull(),
    format: text('format').notNull(),
    width: integer('width'),
    height: integer('height'),
    bytes: integer('bytes').notNull(),
    widths: text('widths').notNull().default('[]'),
    originalFormat: text('original_format').notNull(),
    originalBytes: integer('original_bytes').notNull(),
    alt: text('alt').notNull(),
    filename: text('filename').notNull(),
    createdBy: text('created_by').notNull(),
    ...timestamps(),
  },
  (t) => [
    unique('assets_id_site').on(t.id, t.siteId),
    unique('assets_sha256').on(t.siteId, t.sha256),
    index('assets_site_time').on(t.siteId, t.createdAt, t.id),
    foreignKey({ name: 'assets_site', columns: [t.siteId], foreignColumns: [sites.id] }),
    foreignKey({ name: 'assets_creator', columns: [t.createdBy], foreignColumns: [users.id] }),
    check(
      'assets_formats',
      sql`${t.format} IN ('image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'image/svg+xml') AND ${t.originalFormat} IN ('image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'image/svg+xml')`,
    ),
    check(
      'assets_sizes',
      sql`${t.bytes} > 0 AND ${t.originalBytes} BETWEEN 1 AND 10485760 AND length(${t.alt}) BETWEEN 1 AND 500 AND length(${t.filename}) BETWEEN 1 AND 200 AND length(${t.sha256}) = 64`,
    ),
  ],
)

export const agentGrants = sqliteTable(
  'agent_grants',
  {
    id: id('agt'),
    siteId: siteId(),
    userId: text('user_id').notNull(),
    agent: text('agent').notNull(),
    reviewId: text('review_id'),
    hash: text('hash').notNull(),
    scopes: text('scopes').notNull(),
    expiresAt: text('expires_at').notNull(),
    revokedAt: text('revoked_at'),
    ...timestamps(),
  },
  (t) => [
    unique('agent_grants_id_site').on(t.id, t.siteId),
    unique('agent_grants_hash').on(t.hash),
    index('agent_grants_expiry').on(t.expiresAt),
    foreignKey({ name: 'agent_grants_site', columns: [t.siteId], foreignColumns: [sites.id] }),
    foreignKey({ name: 'agent_grants_user', columns: [t.userId], foreignColumns: [users.id] }),
    foreignKey({
      name: 'agent_grants_review',
      columns: [t.reviewId, t.siteId],
      foreignColumns: [reviews.id, reviews.siteId],
    }),
    check('agent_grants_scopes', sql`json_valid(${t.scopes}) AND json_type(${t.scopes}) = 'array'`),
  ],
)

export const reviewAgentRuns = sqliteTable(
  'review_agent_runs',
  {
    id: id('rar'),
    siteId: siteId(),
    reviewId: text('review_id').notNull(),
    agent: text('agent').notNull(),
    status: text('status').notNull(),
    ...timestamps(),
  },
  (t) => [
    unique('review_agent_runs_id_site').on(t.id, t.siteId),
    unique('review_agent_runs_review_agent').on(t.reviewId, t.agent),
    index('review_agent_runs_review').on(t.siteId, t.reviewId),
    foreignKey({ name: 'review_agent_runs_site', columns: [t.siteId], foreignColumns: [sites.id] }),
    foreignKey({
      name: 'review_agent_runs_review_fk',
      columns: [t.reviewId, t.siteId],
      foreignColumns: [reviews.id, reviews.siteId],
    }),
    check('review_agent_runs_status', sql`${t.status} IN ('queued', 'commented', 'failed')`),
  ],
)
