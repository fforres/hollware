import * as z from 'zod'
import {
  acknowledgedWarning,
  collectionName,
  conflict,
  entry,
  entryId,
  entryStatus,
  entrySummary,
  format,
  locale,
  markdown,
  review,
  reviewAction,
  reviewAgent,
  reviewId,
  revisionId,
  revisionSummary,
  reviewComment,
  reviewStatus,
  searchMode,
  siteDescription,
  slug,
  verdict,
  version,
} from './schemas.ts'
import { isSiteKey } from '../config/site-key.ts'
import { ASSET_FORMATS, MAX_ASSET_BYTES } from '../media/index.ts'
import { collectionDefinitionData, siteDefinitionData } from '../structure/definition.ts'
import { defineOperation } from './types.ts'

/**
 * The operations of v0.1, specified once. The outcomes and the effect of each one are
 * the table of the v0.1 plan; `tests/operations.test.ts` holds it literally. Inputs are strict
 * objects, so a misspelled field is an error instead of being ignored.
 */

export const describeSite = defineOperation({
  name: 'describe_site',
  title: 'Describe the site',
  description:
    'Describes the site: its locales, and for each collection the JSON Schema of the frontmatter, the components the body may use, the contracts that writes and publishes are checked against, and the style guides. Read it before writing.',
  input: z.strictObject({}),
  output: z.object({ outcome: z.enum(['ok']), site: siteDescription }),
  scopes: ['content:read'],
  effect: 'read',
  outcomes: { ok: { isError: false } },
})

export const listEntries = defineOperation({
  name: 'list_entries',
  title: 'List entries',
  description:
    'Lists the entries of a collection, newest first, filtered by locale, tag or status. Pass the nextCursor of an answer as cursor to get the next page. Entries in the trash are left out, unless trashed asks for them.',
  input: z.strictObject({
    collection: collectionName,
    locale: locale.optional(),
    tag: z.string().min(1).optional(),
    status: entryStatus.optional(),
    trashed: z
      .boolean()
      .optional()
      .describe(
        'true to list the entries in the trash, last trashed first, instead of the others.',
      ),
    changedSince: z.iso
      .datetime({ offset: true })
      .optional()
      .describe(
        'Only the entries changed at or after this time, as an ISO 8601 date and time: a new revision, a publication, an unpublication, a move or the trash each change an entry. Give the latest updatedAt you read to list what changed since, in the same order.',
      ),
    limit: z.number().int().min(1).max(100).default(20),
    cursor: z.string().min(1).optional(),
  }),
  output: z.object({
    outcome: z.enum(['ok']),
    entries: z.array(entrySummary),
    nextCursor: z.string().nullable().describe('The cursor of the next page, or null.'),
  }),
  scopes: ['content:read'],
  effect: 'read',
  outcomes: { ok: { isError: false } },
})

export const search = defineOperation({
  name: 'search',
  title: 'Search entries',
  description:
    'Searches the published entries of the site, best match first. Full text finds the entries that hold every word of query, in their title, tags and text; semantic finds them by meaning, in any language; hybrid merges both. Narrow it to a collection or a locale. Drafts are not searched: read them with list_entries.',
  input: z.strictObject({
    query: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .describe('The words to find, or a question; punctuation is ignored by full text.'),
    collection: collectionName.optional(),
    locale: locale.optional(),
    limit: z.number().int().min(1).max(50).default(10),
    mode: searchMode
      .optional()
      .describe(
        'fulltext, semantic or hybrid; hybrid when not given. Semantic and hybrid need the semantic search of the deployment: without it the search is full text, and mode in the answer says so.',
      ),
    passages: z
      .boolean()
      .default(false)
      .describe(
        'Also answer, for each result, the passage that matched: the whole section of the entry, with its heading, and the URL of the entry. What a model reads to answer with the content and cite it (retrieval-augmented generation).',
      ),
    minScore: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe(
        'Leave out what matches by meaning less than this (0 to 1), so a question nothing answers finds nothing. Full text matches are kept.',
      ),
  }),
  output: z.object({
    outcome: z.enum(['ok']),
    mode: searchMode.describe('How the search was made.'),
    results: z.array(
      z.object({
        entry: entrySummary,
        snippet: z
          .string()
          .describe(
            'The words around the match, the words found between [ and ]; for a match by meaning, the start of the closest part.',
          ),
        score: z.number().describe('How well it matches: higher is better.'),
        passage: z
          .object({
            heading: z
              .string()
              .nullable()
              .describe('The heading of the section, or null for the opening of the entry.'),
            text: z.string().describe('The text of the section, as a reader reads it.'),
            url: z
              .string()
              .nullable()
              .describe(
                'The URL of the entry on the site, when the site has a url; null otherwise.',
              ),
          })
          .optional()
          .describe('With passages: the section of the entry that matched.'),
      }),
    ),
  }),
  scopes: ['content:read'],
  effect: 'read',
  outcomes: { ok: { isError: false } },
})

export const getEntry = defineOperation({
  name: 'get_entry',
  title: 'Get an entry',
  description:
    'Gets an entry by collection, locale and slug, with its latest revision: the Markdown, the frontmatter, the verdict of its contracts and its last publication.',
  input: z.strictObject({
    collection: collectionName,
    locale,
    slug,
    formats: z
      .array(format)
      .min(1)
      .default(['markdown'])
      .describe('What to return of the revision: markdown, the Comark document, or html.'),
    published: z
      .boolean()
      .default(false)
      .describe(
        'Read the revision that is live instead of the latest one: not_found when the entry is not published.',
      ),
    related: z
      .boolean()
      .default(false)
      .describe(
        'Also return the published entries closest to this one by meaning, in its collection and locale, closest first. Needs the semantic search of the deployment; empty without it.',
      ),
    references: z
      .boolean()
      .default(false)
      .describe(
        'Also return the published entries that the fields of a reference rule name (an author, a series, an event), by field, in the order the field names them.',
      ),
  }),
  output: z.object({
    outcome: z.enum(['ok', 'not_found']),
    entry: entry.optional(),
    related: z.array(entrySummary).optional().describe('When related was asked for.'),
    references: z
      .record(z.string(), z.array(entrySummary))
      .optional()
      .describe(
        'When references was asked for: for each field of a reference rule, the published entries it names; one that is not published is left out.',
      ),
  }),
  scopes: ['content:read'],
  effect: 'read',
  outcomes: { ok: { isError: false }, not_found: { isError: true } },
})

export const getTranslations = defineOperation({
  name: 'get_translations',
  title: 'Get the translations of an entry',
  description:
    'Gets the entries of a translation group of a collection, one per locale. The group is the value of the field that describe_site names as translationGroupField.',
  input: z.strictObject({
    collection: collectionName,
    translationGroup: z.string().min(1),
  }),
  output: z.object({
    outcome: z.enum(['ok', 'not_found']),
    entries: z.array(entrySummary).optional(),
  }),
  scopes: ['content:read'],
  effect: 'read',
  outcomes: { ok: { isError: false }, not_found: { isError: true } },
})

export const createDraft = defineOperation({
  name: 'create_draft',
  title: 'Create a draft',
  description:
    'Creates an entry from a Markdown file and saves it as a draft at version 1. Contract errors do not stop the draft: it is saved, and the verdict says what to fix before publishing. It is refused only when it cannot be stored: the file is too large, its frontmatter or syntax does not parse, or the slug or translation is taken. An entry in the trash keeps its slug and translation: the answer is in_trash with that entry, and restore_entry brings it back. Hollware stores the canonical Markdown of Comark, which means what you wrote: keep editing from the markdown of the answer.',
  input: z.strictObject({ collection: collectionName, locale, slug, markdown }),
  output: z.object({
    outcome: z.enum(['saved', 'refused', 'in_trash']),
    entry: entrySummary
      .optional()
      .describe('With saved, the new draft; with in_trash, the entry in the trash that holds it.'),
    markdown: markdown
      .optional()
      .describe('With saved, the Markdown stored: the canonical form of the file that was sent.'),
    verdict: verdict.optional(),
  }),
  scopes: ['content:write'],
  effect: 'write',
  outcomes: { saved: { isError: false }, refused: { isError: true }, in_trash: { isError: true } },
})

export const updateDraft = defineOperation({
  name: 'update_draft',
  title: 'Update a draft',
  description:
    'Saves a new revision of an entry from the whole Markdown file, if the entry is still at the version you read; otherwise it answers conflict with the current version, and nothing is saved. A file whose canonical form is the latest revision answers unchanged. Contract errors do not stop the save; the verdict says what to fix. Hollware stores the canonical Markdown of Comark, which means what you wrote: keep editing from the markdown of the answer.',
  input: z.strictObject({ id: entryId, version, markdown }),
  output: z.object({
    outcome: z.enum(['saved', 'unchanged', 'conflict', 'not_found', 'refused']),
    entry: entrySummary.optional(),
    markdown: markdown
      .optional()
      .describe(
        'With saved or unchanged, the Markdown stored: the canonical form of the file that was sent.',
      ),
    verdict: verdict.optional(),
    conflict: conflict.optional(),
  }),
  scopes: ['content:write'],
  effect: 'edit',
  outcomes: {
    saved: { isError: false },
    unchanged: { isError: false },
    conflict: { isError: true },
    not_found: { isError: true },
    refused: { isError: true },
  },
})

export const listRevisions = defineOperation({
  name: 'list_revisions',
  title: 'List the revisions of an entry',
  description:
    'Lists every revision of an entry, newest first: who wrote it and how, when, its title, what the contracts said, and whether it is the latest, the one the site shows, or was ever published. Read one with get_revision; go back to one with restore_revision. Pass the nextCursor of an answer as cursor to get the next page.',
  input: z.strictObject({
    id: entryId,
    limit: z.number().int().min(1).max(100).default(20),
    cursor: z.string().min(1).optional(),
  }),
  output: z.object({
    outcome: z.enum(['ok', 'not_found']),
    revisions: z.array(revisionSummary).optional(),
    nextCursor: z.string().nullable().optional().describe('The cursor of the next page, or null.'),
  }),
  scopes: ['content:read'],
  effect: 'read',
  outcomes: { ok: { isError: false }, not_found: { isError: true } },
})

export const getRevision = defineOperation({
  name: 'get_revision',
  title: 'Get a revision of an entry',
  description:
    'Gets one revision of an entry by its id, as list_revisions names it: the whole Markdown file it held, and who wrote it and when. Compare it with the latest revision of get_entry to see what changed.',
  input: z.strictObject({ id: revisionId }),
  output: z.object({
    outcome: z.enum(['ok', 'not_found']),
    revision: revisionSummary.extend({ markdown }).optional(),
  }),
  scopes: ['content:read'],
  effect: 'read',
  outcomes: { ok: { isError: false }, not_found: { isError: true } },
})

export const restoreRevision = defineOperation({
  name: 'restore_revision',
  title: 'Go back to a revision',
  description:
    "Saves an earlier revision's Markdown as a new revision of the entry, if the entry is still at the version you read: nothing is deleted, and the history keeps every revision, the restored one included. It is a draft until it is published, as any change. Answers as update_draft does; unchanged when the latest revision already holds that Markdown.",
  input: z.strictObject({
    id: entryId,
    version,
    revision: revisionId.describe('The revision to go back to, of this entry.'),
  }),
  output: z.object({
    outcome: z.enum(['saved', 'unchanged', 'conflict', 'not_found', 'refused']),
    entry: entrySummary.optional(),
    verdict: verdict.optional(),
    conflict: conflict.optional(),
  }),
  scopes: ['content:write'],
  effect: 'edit',
  outcomes: {
    saved: { isError: false },
    unchanged: { isError: false },
    conflict: { isError: true },
    not_found: { isError: true },
    refused: { isError: true },
  },
})

export const validate = defineOperation({
  name: 'validate',
  title: 'Validate a Markdown file',
  description:
    'Checks a Markdown file against every contract of the collection, as publish would, without saving anything: the verdict lists each problem with its fix.',
  input: z.strictObject({ collection: collectionName, locale, slug, markdown }),
  output: z.object({ outcome: z.enum(['ok']), verdict }),
  scopes: ['content:read'],
  effect: 'read',
  outcomes: { ok: { isError: false } },
})

export const publish = defineOperation({
  name: 'publish',
  title: 'Publish an entry',
  description:
    'Publishes the latest revision of an entry, if the entry is still at the version you read, and with group, other entries in the same step. It is blocked while the contracts report errors. Warnings have to be acknowledged: an answer of needs_acknowledgement lists them, and publish again with them in acknowledgeWarnings. Publish entries that link to each other as one group. Without content:publish, the same checks run and the answer is pending_review: a person who may publish approves the revision, with its group, or asks for changes, and a new revision of any of them cancels the request. A review is for now: never with publishAt.',
  input: z.strictObject({
    id: entryId,
    version,
    acknowledgeWarnings: z
      .array(acknowledgedWarning)
      .default([])
      .describe('The warnings you accept, as needs_acknowledgement listed them.'),
    group: z
      .array(z.strictObject({ id: entryId, version }))
      .max(99)
      .default([])
      .describe(
        'Other entries to publish in the same step, each with the version you read: all of them are published, or none. A link between two of them counts as published, and an acknowledged warning holds for every entry that reports it.',
      ),
    publishAt: z.iso
      .datetime({ offset: true })
      .optional()
      .describe(
        'Publish at this time instead of now, as an ISO 8601 date and time: the entry is checked now and waits as scheduled, and it is published within a minute of the time, if nobody changes it before. One entry at a time, never with group.',
      ),
  }),
  output: z.object({
    outcome: z.enum([
      'published',
      'scheduled',
      'blocked',
      'needs_acknowledgement',
      'pending_review',
      'conflict',
      'not_found',
    ]),
    entry: entrySummary.optional(),
    verdict: verdict.optional(),
    conflict: conflict.optional(),
    review: review
      .optional()
      .describe('With pending_review: the request, as list_reviews shows it.'),
    failedEntry: entryId
      .optional()
      .describe(
        'In a group, the entry that kept the group from being published: blocked, stale, missing, or with a warning to acknowledge.',
      ),
  }),
  scopes: ['content:write'],
  effect: 'write',
  outcomes: {
    published: { isError: false },
    scheduled: { isError: false },
    blocked: { isError: true },
    needs_acknowledgement: { isError: false },
    pending_review: { isError: false },
    conflict: { isError: true },
    not_found: { isError: true },
  },
})

export const unpublish = defineOperation({
  name: 'unpublish',
  title: 'Unpublish an entry',
  description:
    'Takes an entry off the public site and keeps it, with its revisions, as a draft. An entry that is not published stays as it is.',
  input: z.strictObject({ id: entryId }),
  output: z.object({
    outcome: z.enum(['unpublished', 'not_found']),
    entry: entrySummary.optional(),
  }),
  scopes: ['content:publish'],
  effect: 'destructive',
  outcomes: { unpublished: { isError: false }, not_found: { isError: true } },
})

const redirect = z.object({
  collection: z.string(),
  locale: z.string(),
  from: z.string().describe('The slug the entry had: its old path is answered with a 301.'),
  to: z.string().describe('The slug the entry has now.'),
  fromPath: z
    .string()
    .nullable()
    .describe('The old path on the site, from the route of the collection.'),
  toPath: z.string().nullable().describe('The path now.'),
  entryId,
})

export const moveEntry = defineOperation({
  name: 'move_entry',
  title: 'Change the slug of an entry',
  description:
    "Gives an entry another slug, and so another path on the site, if the entry is still at the version you read; it keeps its revisions and its translations. An entry that was ever published keeps its old slug as a redirect (list_redirects), so a site answers the old path with a 301 and links and search engines follow. Moving a published entry takes content:publish; the site's pages of it are purged. A slug another entry of the collection and locale holds answers taken.",
  input: z.strictObject({ id: entryId, version, slug: slug.describe('The new slug.') }),
  output: z.object({
    outcome: z.enum(['moved', 'unchanged', 'taken', 'conflict', 'not_found']),
    entry: entrySummary.optional(),
    redirect: redirect.optional().describe('With moved, for an entry that was ever published.'),
    conflict: conflict.optional(),
  }),
  scopes: ['content:write'],
  effect: 'edit',
  outcomes: {
    moved: { isError: false },
    unchanged: { isError: false },
    taken: { isError: true },
    conflict: { isError: true },
    not_found: { isError: true },
  },
})

export const listRedirects = defineOperation({
  name: 'list_redirects',
  title: 'List the redirects of the site',
  description:
    "Lists the old paths of the site's entries that moved (move_entry) and where each goes now, newest first: what a site answers with a 301. Narrow it to a collection or a locale; pass the nextCursor of an answer as cursor for the next page.",
  input: z.strictObject({
    collection: collectionName.optional(),
    locale: locale.optional(),
    limit: z.number().int().min(1).max(500).default(100),
    cursor: z.string().min(1).optional(),
  }),
  output: z.object({
    outcome: z.enum(['ok']),
    redirects: z.array(redirect),
    nextCursor: z.string().nullable(),
  }),
  scopes: ['content:read'],
  effect: 'read',
  outcomes: { ok: { isError: false } },
})

export const listBackups = defineOperation({
  name: 'list_backups',
  title: 'List the backups of the site',
  description:
    "Lists the daily backups of the site, newest first: one JSON file a day, made by the cron after 03:00 UTC and kept 30 days in the deployment's R2 bucket BACKUPS, or MEDIA without it, with the definition of the site, the Markdown of every entry, its redirects and the list of its images. Download one at GET /v1/backups/<date> with a token of an owner, or with hollware backup get, which writes it as files, the images included, that hollware import takes back. unavailable without a bucket.",
  input: z.strictObject({}),
  output: z.object({
    outcome: z.enum(['ok', 'unavailable']),
    backups: z
      .array(
        z.object({ date: z.string().describe('YYYY-MM-DD, in UTC.'), bytes: z.number().int() }),
      )
      .optional(),
  }),
  scopes: ['site:owner'],
  effect: 'read',
  outcomes: { ok: { isError: false }, unavailable: { isError: true } },
})

export const scheduleUnpublish = defineOperation({
  name: 'schedule_unpublish',
  title: 'Unpublish an entry at a time',
  description:
    'Takes a published entry off the site at a time, as an ISO 8601 date and time: for an offer, an event or a notice that ends. It stays published until then, and the cron unpublishes it within a minute of the time, in your name, if you may still publish. A time that has passed unpublishes it now. Scheduling again moves the time; unpublishAt null cancels it. get_entry says when, as unpublishAt.',
  input: z.strictObject({
    id: entryId,
    unpublishAt: z.iso
      .datetime({ offset: true })
      .nullable()
      .describe('When to unpublish it, or null to cancel the unpublication it has.'),
  }),
  output: z.object({
    outcome: z.enum(['scheduled', 'unpublished', 'cancelled', 'not_published', 'not_found']),
    entry: entrySummary.optional(),
    unpublishAt: z.string().nullable().optional().describe('With scheduled: the time, in UTC.'),
  }),
  scopes: ['content:publish'],
  effect: 'destructive',
  outcomes: {
    scheduled: { isError: false },
    unpublished: { isError: false },
    cancelled: { isError: false },
    not_published: { isError: true },
    not_found: { isError: true },
  },
})

export const deleteEntry = defineOperation({
  name: 'delete_entry',
  title: 'Move an entry to the trash',
  description:
    'Moves a draft to the trash, if it is still at the version you read: every operation treats it as gone, its pending review is cancelled, and nothing is deleted. It keeps its slug and translation, and restore_entry brings it back as the draft it was. A published or scheduled entry answers published: unpublish it first.',
  input: z.strictObject({ id: entryId, version }),
  output: z.object({
    outcome: z.enum(['trashed', 'published', 'conflict', 'not_found']),
    entry: entrySummary.optional(),
    conflict: conflict.optional(),
  }),
  scopes: ['content:write'],
  effect: 'destructive',
  outcomes: {
    trashed: { isError: false },
    published: { isError: true },
    conflict: { isError: true },
    not_found: { isError: true },
  },
})

export const restoreEntry = defineOperation({
  name: 'restore_entry',
  title: 'Bring an entry back from the trash',
  description:
    'Brings an entry back from the trash as the draft it was, with its revisions, at the next version. An entry that is not in the trash answers not_trashed.',
  input: z.strictObject({ id: entryId }),
  output: z.object({
    outcome: z.enum(['restored', 'not_trashed', 'not_found']),
    entry: entrySummary.optional(),
  }),
  scopes: ['content:write'],
  effect: 'write',
  outcomes: {
    restored: { isError: false },
    not_trashed: { isError: true },
    not_found: { isError: true },
  },
})

export const getReview = defineOperation({
  name: 'get_review',
  title: 'Read a review',
  description:
    'Reads one review with every entry it changes: for each, what is published, what is proposed and the unified diff between them, and the comments, those about an entry or its lines included.',
  input: z.strictObject({
    id: reviewId,
    entryId: entryId
      .optional()
      .describe('Only this entry of the review: for a review too large for one answer.'),
  }),
  output: z.object({
    outcome: z.enum(['ok', 'not_found']),
    review: review
      .extend({
        comments: z.array(reviewComment).describe('What was said about it, oldest first.'),
        agents: z
          .array(reviewAgent)
          .describe('The agents that review it, as the site declares them, and how far each got.'),
      })
      .optional(),
    items: z
      .array(
        z.object({
          entry: entrySummary,
          action: reviewAction,
          excluded: z.boolean().describe('Whether the approval left this entry as it was.'),
          published: markdown
            .nullable()
            .describe('The Markdown published when the review was asked, or null.'),
          proposed: markdown
            .nullable()
            .describe('The Markdown the review publishes, or null when it unpublishes.'),
          diff: z
            .string()
            .describe('The unified diff from published to proposed, with three lines of context.'),
        }),
      )
      .optional(),
  }),
  scopes: ['review:read'],
  effect: 'read',
  outcomes: { ok: { isError: false }, not_found: { isError: true } },
})

export const listReviews = defineOperation({
  name: 'list_reviews',
  title: 'List the reviews',
  description:
    'Lists the requests to publish, newest first, with the entry each one is for: the pending ones unless you name another status, and those of one entry when you name it.',
  input: z.strictObject({
    status: reviewStatus.default('pending'),
    limit: z.number().int().min(1).max(100).default(50),
    entryId: entryId.optional().describe('Only the requests for this entry.'),
  }),
  output: z.object({
    outcome: z.enum(['ok']),
    reviews: z.array(
      review.extend({
        entry: entrySummary,
        items: z
          .number()
          .int()
          .min(0)
          .describe('How many entries the review changes: get_review shows each one.'),
        comments: z.array(reviewComment).describe('What was said about it, oldest first.'),
        agents: z
          .array(reviewAgent)
          .describe('The agents that review it, as the site declares them, and how far each got.'),
      }),
    ),
  }),
  scopes: ['review:read'],
  effect: 'read',
  outcomes: { ok: { isError: false } },
})

export const approveReview = defineOperation({
  name: 'approve_review',
  title: 'Approve a review',
  description:
    'Publishes what a review asked for, in your name, after the contracts run again as publish runs them: every entry of the review in one step, all or none, but those you exclude. The warnings the request acknowledged count as acknowledged; a new one answers needs_acknowledgement, and you approve again with it in acknowledgeWarnings.',
  input: z.strictObject({
    id: reviewId,
    acknowledgeWarnings: z
      .array(acknowledgedWarning)
      .default([])
      .describe('Warnings you accept besides those the request acknowledged.'),
    exclude: z
      .array(entryId)
      .max(100)
      .default([])
      .describe(
        'Entries of the review to leave as they are: the rest is published or unpublished, and the review is closed for all of them.',
      ),
    override: z
      .boolean()
      .default(false)
      .describe(
        'Approve without the comments of the required agents, which agents_pending asked for. Only an owner (schema:admin) may, and the activity log keeps it.',
      ),
  }),
  output: z.object({
    outcome: z.enum([
      'published',
      'blocked',
      'needs_acknowledgement',
      'agents_pending',
      'conflict',
      'not_pending',
      'not_found',
    ]),
    agents: z
      .array(reviewAgent)
      .optional()
      .describe('With agents_pending: the required agents that have not commented yet.'),
    review: review.optional(),
    entry: entrySummary.optional(),
    verdict: verdict.optional(),
    conflict: conflict.optional(),
    failedEntry: entryId
      .optional()
      .describe(
        'In a review of several entries, the entry that kept it from being approved: blocked, moved since the request, missing, or with a warning to acknowledge.',
      ),
  }),
  scopes: ['content:publish'],
  effect: 'write',
  outcomes: {
    published: { isError: false },
    blocked: { isError: true },
    needs_acknowledgement: { isError: false },
    agents_pending: { isError: true },
    conflict: { isError: true },
    not_pending: { isError: true },
    not_found: { isError: true },
  },
})

export const requestReview = defineOperation({
  name: 'request_review',
  title: 'Ask for a review',
  description:
    'Asks a person who may publish to review the latest revision of an entry, after the same checks publish makes, if the entry is still at the version you read. With group and unpublish, one review holds every change, which the reviewer approves as one step. It never publishes, whatever your scopes: the answer is pending_review, or why not (blocked by the contracts, warnings to acknowledge, a conflict). A new revision of any of its entries cancels the request.',
  input: z.strictObject({
    id: entryId,
    version,
    acknowledgeWarnings: z
      .array(acknowledgedWarning)
      .default([])
      .describe('The warnings you accept, as needs_acknowledgement listed them.'),
    group: z
      .array(z.strictObject({ id: entryId, version }))
      .max(99)
      .default([])
      .describe(
        'Other entries to publish in the same review, each with the version you read: the review publishes all of them, or none.',
      ),
    unpublish: z
      .array(z.strictObject({ id: entryId, version }))
      .max(99)
      .default([])
      .describe(
        'Published entries the same review takes off the site, each with the version you read.',
      ),
  }),
  output: z.object({
    outcome: z.enum([
      'pending_review',
      'blocked',
      'needs_acknowledgement',
      'conflict',
      'not_found',
    ]),
    entry: entrySummary.optional(),
    verdict: verdict.optional(),
    conflict: conflict.optional(),
    review: review
      .optional()
      .describe(
        'With pending_review: the request, as list_reviews shows it. With conflict: the pending review that already holds failedEntry, when one does.',
      ),
    failedEntry: entryId
      .optional()
      .describe(
        'The entry that kept the review from being asked: blocked, stale, missing, not published, in another pending review, or with a warning to acknowledge.',
      ),
  }),
  scopes: ['content:write'],
  effect: 'write',
  outcomes: {
    pending_review: { isError: false },
    blocked: { isError: true },
    needs_acknowledgement: { isError: false },
    conflict: { isError: true },
    not_found: { isError: true },
  },
})

export const commentReview = defineOperation({
  name: 'comment_review',
  title: 'Comment on a review',
  description:
    'Adds a comment to a pending review, for the person who decides it and for the author: what to change, what reads well, what the contracts cannot check. It neither approves nor closes the review.',
  input: z.strictObject({
    id: reviewId,
    body: z.string().trim().min(1).max(4000).describe('The comment, in Markdown.'),
    entryId: entryId
      .optional()
      .describe('The entry of the review the comment is about; the whole review without it.'),
    lines: z
      .strictObject({ from: z.number().int().min(1), to: z.number().int().min(1) })
      .optional()
      .describe(
        'With entryId, the lines of its proposed Markdown the comment is about, as get_review numbers them.',
      ),
  }),
  output: z.object({
    outcome: z.enum(['commented', 'not_pending', 'not_found']),
    comment: reviewComment.optional(),
  }),
  scopes: ['review:comment'],
  effect: 'write',
  outcomes: {
    commented: { isError: false },
    not_pending: { isError: true },
    not_found: { isError: true },
  },
})

export const requestChanges = defineOperation({
  name: 'request_changes',
  title: 'Ask for changes',
  description:
    'Closes a pending review without publishing, with a note that says what to change. The author saves a new revision and asks again.',
  input: z.strictObject({
    id: reviewId,
    note: z.string().trim().min(1).max(4000).describe('What to change, for the author.'),
  }),
  output: z.object({
    outcome: z.enum(['changes_requested', 'not_pending', 'not_found']),
    review: review.optional(),
  }),
  scopes: ['content:publish'],
  effect: 'edit',
  outcomes: {
    changes_requested: { isError: false },
    not_pending: { isError: true },
    not_found: { isError: true },
  },
})

export const rejectReview = defineOperation({
  name: 'reject_review',
  title: 'Reject a review',
  description:
    'Closes a pending review without publishing, saying why this change is not to be published at all: unlike request_changes, it does not ask the author for another try. The entry stays as it is, published or not.',
  input: z.strictObject({
    id: reviewId,
    reason: z.string().trim().min(1).max(4000).describe('Why it is rejected, for the author.'),
  }),
  output: z.object({
    outcome: z.enum(['rejected', 'not_pending', 'not_found']),
    review: review.optional(),
  }),
  scopes: ['content:publish'],
  effect: 'edit',
  outcomes: {
    rejected: { isError: false },
    not_pending: { isError: true },
    not_found: { isError: true },
  },
})

/** The analytics a site can read its page views from: the site's own, never Hollware's. */
export const ANALYTICS_PROVIDERS = ['cloudflare', 'ga4', 'plausible', 'posthog'] as const

/** One of `ANALYTICS_PROVIDERS`. */
export type AnalyticsProvider = (typeof ANALYTICS_PROVIDERS)[number]

const analyticsProvider = z
  .enum(ANALYTICS_PROVIDERS)
  .describe(
    'Where the site measures its readers: cloudflare (Web Analytics), posthog, plausible or ga4.',
  )

/** What a connection to analytics keeps besides its credential: nothing in it is a secret. */
export const analyticsSettings = z.strictObject({
  hosts: z
    .array(
      z
        .string()
        .max(253)
        .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/, {
          message: 'Not a host name, such as www.example.com.',
        }),
    )
    .max(10)
    .optional()
    .describe(
      "Hosts whose views count for the site, such as www.example.com. The host of the site's url always counts.",
    ),
  accountId: z
    .string()
    .regex(/^[0-9a-f]{32}$/, { message: 'Not a Cloudflare account id: 32 hexadecimal digits.' })
    .optional()
    .describe(
      'cloudflare: the account, the 32 characters after dash.cloudflare.com/ in the address of the dashboard. Required for cloudflare.',
    ),
  host: z
    .string()
    .max(200)
    .regex(/^https:\/\/[a-z0-9.-]+(:\d{1,5})?$/, {
      message: 'Not an https origin, such as https://plausible.example.com.',
    })
    .optional()
    .describe(
      'posthog or plausible: the https origin of the instance. PostHog Cloud (US or EU) is found from the key; plausible.io when not given.',
    ),
  projectId: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('posthog: the project. Found from the key when not given.'),
  siteId: z
    .string()
    .min(1)
    .max(253)
    .optional()
    .describe("plausible: the site id, its domain. The host of the site's url when not given."),
  propertyId: z
    .string()
    .regex(/^\d{1,20}$/, { message: 'Not a GA4 property id: digits only.' })
    .optional()
    .describe('ga4: the property id, digits only. Required for ga4.'),
})

/** The settings of a connection, as `analyticsSettings` parses them. */
export type AnalyticsSettings = z.output<typeof analyticsSettings>

export const getAnalytics = defineOperation({
  name: 'get_analytics',
  title: 'Read the analytics connection',
  description:
    'The analytics the site reads its page views from, without its credential: the provider, its settings and when it was last checked. not_connected when there is none.',
  input: z.strictObject({}),
  output: z.object({
    outcome: z.enum(['connected', 'not_connected']),
    provider: analyticsProvider.optional(),
    settings: analyticsSettings.optional(),
    connectedAt: z.string().optional().describe('When the connection was made, in ISO 8601.'),
    checkedAt: z
      .string()
      .optional()
      .describe('When the provider last answered with views, in ISO 8601.'),
  }),
  scopes: ['schema:admin'],
  effect: 'read',
  outcomes: { connected: { isError: false }, not_connected: { isError: false } },
})

export const connectAnalytics = defineOperation({
  name: 'connect_analytics',
  title: 'Connect the analytics of the site',
  description:
    'Connects the site to the analytics it already has, so content_stats can say what readers read: Cloudflare Web Analytics, PostHog, Plausible or GA4. It asks the provider for the last 7 days with the credential first, and saves nothing unless the provider answers; the credential is then kept sealed and never shown again. A new connection replaces the old one. Prefer the admin (Site, Analytics) or `hollware analytics connect`, so the credential does not pass through an agent. refused when the provider turned the credential down, with the permission to give it; unreachable when it did not answer; unavailable when the deployment has no HOLLWARE_SECRET to seal it with.',
  input: z.strictObject({
    provider: analyticsProvider,
    credential: z
      .string()
      .min(1)
      .max(16_384)
      .describe(
        'A read-only credential: cloudflare, an API token with Account Analytics Read; posthog, a personal API key with Query read; plausible, a Stats API key; ga4, the JSON key of a service account that can view the property.',
      ),
    settings: analyticsSettings.optional(),
  }),
  output: z.object({
    outcome: z.enum(['connected', 'refused', 'unreachable', 'invalid', 'unavailable']),
    settings: analyticsSettings
      .optional()
      .describe('With connected: the settings as saved, with what was found from the credential.'),
    views: z.number().optional().describe('With connected: the views of the last 7 days.'),
    paths: z.number().optional().describe('With connected: how many paths had views.'),
    message: z.string().optional().describe('Without connected: what the provider said.'),
    fix: z.string().optional().describe('Without connected: what to do next.'),
  }),
  scopes: ['schema:admin'],
  effect: 'write',
  outcomes: {
    connected: { isError: false },
    refused: { isError: true },
    unreachable: { isError: true },
    invalid: { isError: true },
    unavailable: { isError: true },
  },
})

export const disconnectAnalytics = defineOperation({
  name: 'disconnect_analytics',
  title: 'Disconnect the analytics of the site',
  description:
    'Forgets the analytics connection of the site and its credential. content_stats is unavailable until another is connected.',
  input: z.strictObject({}),
  output: z.object({ outcome: z.enum(['disconnected', 'not_connected']) }),
  scopes: ['schema:admin'],
  effect: 'write',
  outcomes: { disconnected: { isError: false }, not_connected: { isError: true } },
})

export const contentStats = defineOperation({
  name: 'content_stats',
  title: 'Read what readers read',
  description:
    'The most read pages of the sites that read this one, over the last days, most read first, each with the published entry it shows when it shows one, from the analytics the site connected. Use it to pick what to update. unavailable when the site has connected none.',
  input: z.strictObject({
    days: z.number().int().min(1).max(90).default(30).describe('How many days back to count.'),
    limit: z.number().int().min(1).max(50).default(10),
  }),
  output: z.object({
    outcome: z.enum(['ok', 'unavailable']),
    since: z.string().optional().describe('The start of the count, in ISO 8601.'),
    source: analyticsProvider
      .optional()
      .describe('With ok: the analytics the views come from. cloudflare samples them.'),
    pages: z
      .array(
        z.object({
          path: z.string(),
          views: z.number().describe('Page views, sampling accounted for.'),
          entry: entrySummary.nullable().describe('The published entry at that path, or null.'),
        }),
      )
      .optional(),
    fix: z.string().optional().describe('With unavailable: what to do next.'),
  }),
  scopes: ['content:read'],
  effect: 'read',
  outcomes: { ok: { isError: false }, unavailable: { isError: true } },
})

const siteKey = z
  .string()
  .refine(isSiteKey, {
    message: 'Not a site key: lowercase words joined by hyphens, such as my-site.',
  })
  .describe('The key of a site: lowercase letters and digits joined by hyphens, such as my-site.')

const structureVersion = z
  .number()
  .int()
  .min(0)
  .describe(
    'The version of the structure you read with get_structure. Another one answers conflict.',
  )

const confirm = z
  .boolean()
  .default(false)
  .describe(
    'true to go ahead when needs_confirmation listed what the change does to existing entries.',
  )

const problem = z.object({
  path: z.string().describe('Where, from the root: sites.<key>.collections.<name>.schema.'),
  message: z.string(),
  fix: z.string(),
})

const impact = z.object({
  removedCollections: z
    .array(z.object({ name: z.string(), entries: z.number().int() }))
    .describe('Collections the change removes, with how many entries each holds.'),
  removedLocales: z
    .array(z.object({ locale: z.string(), entries: z.number().int() }))
    .describe('Locales the change removes, with how many entries each holds.'),
  refused: z
    .array(
      z.object({
        collection: z.string(),
        entries: z
          .number()
          .int()
          .describe('Entries whose latest frontmatter the new schema refuses.'),
        examples: z.array(z.string()).describe('A few of their slugs.'),
      }),
    )
    .describe(
      'Collections whose new schema refuses entries they hold; they stay, and their next write is checked against it.',
    ),
})

const structureChange = z.object({
  outcome: z.enum(['updated', 'unchanged', 'invalid', 'needs_confirmation', 'conflict']),
  version: z.number().int().optional().describe('The version of the structure now.'),
  problems: z.array(problem).optional().describe('With invalid: every problem, each with its fix.'),
  impact: impact.optional().describe('With needs_confirmation: what the change would do.'),
  currentVersion: z.number().int().optional().describe('With conflict: the version to read again.'),
  message: z.string().optional().describe('With conflict: what happened.'),
  fix: z.string().optional().describe('With conflict: what to do next.'),
})

const STRUCTURE_OUTCOMES = {
  updated: { isError: false },
  unchanged: { isError: false },
  invalid: { isError: true },
  needs_confirmation: { isError: false },
  conflict: { isError: true },
} as const

export const getStructure = defineOperation({
  name: 'get_structure',
  title: 'Get the structure of the site',
  description:
    'Gets the definition of the site as update_site and set_collection take it: its locales, URL, CORS origins, events, style guide, and each collection with the JSON Schema of its frontmatter, its routes, components and rules; with its version, and the catalog of rules a collection may use, each with the JSON Schema of its parameters.',
  input: z.strictObject({}),
  output: z.object({
    outcome: z.enum(['ok']),
    site: z.string(),
    version: z.number().int(),
    definition: siteDefinitionData,
    catalog: z.array(
      z.object({
        name: z.string(),
        description: z.string(),
        params: z.record(z.string(), z.unknown()).describe('The JSON Schema of its parameters.'),
      }),
    ),
  }),
  scopes: ['content:read'],
  effect: 'read',
  outcomes: { ok: { isError: false } },
})

export const updateSite = defineOperation({
  name: 'update_site',
  title: 'Change the structure of the site',
  description:
    'Replaces the definition of the site with another, at once and with no deploy: read it with get_structure, change it, and send it with the version you read. Every problem is answered at its path with its fix, and nothing changes. A change that removes a collection or a locale with entries, or a schema that refuses entries the site holds, answers needs_confirmation with what it would do; send it again with confirm to go ahead. Entries are never deleted: a removed collection keeps them out of reach until it comes back.',
  input: z.strictObject({ version: structureVersion, definition: siteDefinitionData, confirm }),
  output: structureChange.describe('What became of the definition.'),
  scopes: ['schema:admin'],
  effect: 'destructive',
  outcomes: STRUCTURE_OUTCOMES,
})

export const setCollection = defineOperation({
  name: 'set_collection',
  title: 'Add, change or remove a collection',
  description:
    'Adds the collection name to the site, replaces it, or removes it with collection null, leaving the rest of the definition as it is; with the version of the structure you read. Answers as update_site does.',
  input: z.strictObject({
    version: structureVersion,
    name: z
      .string()
      .regex(/^[a-z][a-z0-9-]*$/)
      .describe('The name of the collection: lowercase letters, digits and hyphens, such as blog.'),
    collection: collectionDefinitionData
      .nullable()
      .describe('The collection, or null to remove it.'),
    confirm,
  }),
  output: structureChange.describe('What became of the collection.'),
  scopes: ['schema:admin'],
  effect: 'destructive',
  outcomes: STRUCTURE_OUTCOMES,
})

export const createSite = defineOperation({
  name: 'create_site',
  title: 'Create a site',
  description:
    'Creates a site in this deployment, with its definition, and makes you its owner. It is served at once; to work in it, get a token of that site (the admin switches to it).',
  input: z.strictObject({ key: siteKey, definition: siteDefinitionData }),
  output: z.object({
    outcome: z.enum(['created', 'taken', 'invalid']),
    version: z.number().int().optional(),
    problems: z
      .array(problem)
      .optional()
      .describe('With invalid: every problem, each with its fix.'),
  }),
  scopes: ['site:owner'],
  effect: 'write',
  outcomes: { created: { isError: false }, taken: { isError: true }, invalid: { isError: true } },
})

export const deleteSite = defineOperation({
  name: 'delete_site',
  title: 'Put a site in the trash',
  description:
    'Puts a site you own in the trash: it is served no more, and its tokens stop working. Nothing is deleted; restore_site brings it back, from a token of another site you own. The first call answers needs_confirmation with how many entries the site holds; call again with confirm.',
  input: z.strictObject({ key: siteKey, confirm }),
  output: z.object({
    outcome: z.enum(['trashed', 'needs_confirmation', 'not_found']),
    entries: z
      .number()
      .int()
      .optional()
      .describe('With needs_confirmation: the entries the site holds.'),
  }),
  scopes: ['site:owner'],
  effect: 'destructive',
  outcomes: {
    trashed: { isError: false },
    needs_confirmation: { isError: false },
    not_found: { isError: true },
  },
})

export const restoreSite = defineOperation({
  name: 'restore_site',
  title: 'Bring a site back from the trash',
  description:
    'Brings back a site you own from the trash, as it was: served again, with its entries and tokens.',
  input: z.strictObject({ key: siteKey }),
  output: z.object({ outcome: z.enum(['restored', 'not_found']) }),
  scopes: ['site:owner'],
  effect: 'write',
  outcomes: { restored: { isError: false }, not_found: { isError: true } },
})

export const makeWebhookSecret = defineOperation({
  name: 'make_webhook_secret',
  title: 'Make the secret of a webhook',
  description:
    "Makes a new secret for a webhook of the site, or for an agent of the site delivered by webhook, that names no Worker secret of its own, keeps it sealed, and answers it once: give it to the receiver, which checks each delivery's signature with it. A new one replaces the old at once. unavailable when the deployment has no HOLLWARE_SECRET to seal it with.",
  input: z.strictObject({
    webhook: z
      .string()
      .min(1)
      .describe('The name of the webhook, or of the agent, as the definition of the site has it.'),
  }),
  output: z.object({
    outcome: z.enum(['made', 'not_found', 'unavailable']),
    secret: z.string().optional().describe('With made: the secret, shown this once.'),
  }),
  scopes: ['schema:admin'],
  effect: 'write',
  outcomes: {
    made: { isError: false },
    not_found: { isError: true },
    unavailable: { isError: true },
  },
})

const assetId = z
  .string()
  .regex(/^ast_[0-9a-f]{26}$/)
  .describe('The id of an asset, such as ast_3f1c… (26 hexadecimal characters).')

const asset = z.object({
  id: assetId,
  reference: z
    .string()
    .describe(
      'What content writes to name it: img: asset:ast_… in the frontmatter, ![alt](asset:ast_…) in Markdown for an image, [text](asset:ast_…) for a link to a video or a PDF.',
    ),
  url: z.string().describe('Where the Worker serves it, to anyone, cached for a year.'),
  format: z.enum(ASSET_FORMATS).describe('What it is served as.'),
  width: z.number().int().nullable().describe('In pixels; null for an SVG, a video or a PDF.'),
  height: z.number().int().nullable(),
  bytes: z.number().int().describe('The size of the file served.'),
  widths: z
    .array(z.number().int())
    .optional()
    .describe(
      'The widths of its narrower copies, smallest first, each served at <url>/<width>: the media widths of the site narrower than the image, made when it was uploaded. Absent from a Hollware before 1.0.0-rc.3.',
    ),
  srcset: z
    .string()
    .nullable()
    .optional()
    .describe(
      'Its copies and itself as the srcset of an img, such as "<url>/640 640w, <url> 1600w"; null when it has no copy.',
    ),
  originalFormat: z.enum(ASSET_FORMATS).describe('What it was sent as.'),
  originalBytes: z.number().int(),
  alt: z.string().describe('What it shows, for whoever cannot see it.'),
  filename: z.string().describe('The name it was sent with.'),
  createdAt: z.string(),
})

const MAX_BASE64 = Math.ceil(MAX_ASSET_BYTES / 3) * 4

export const uploadAsset = defineOperation({
  name: 'upload_asset',
  title: 'Upload an image, a video or a PDF',
  description:
    "Uploads a file to the site: an image (JPEG, PNG, WebP, AVIF, GIF or SVG, at most 10 MB), or a video (MP4, WebM) or a PDF, up to the site's media maxBytes (100 MB by default). Send it in base64 as data (at most 10 MB), or name a public https url that Hollware downloads and streams to R2. A larger file from a computer goes to PUT /v1/assets, which streams the request body, or, past what one request carries, up in parts of 50 MiB: POST /v1/uploads, PUT /v1/uploads/<id>/parts/<n>, POST /v1/uploads/<id>/complete. What it is comes from its bytes, never from its name. The site's media setting converts an image once (to WebP at 85 by default; PNG lossless; GIF with its frames; nothing wider than its maxWidth) and makes the narrower copies of its widths for srcset (640 and 1280 pixels by default), and an SVG is kept as it is when nothing in it can run, or refused with what to remove. A video or a PDF is kept as it came. The same file uploaded again answers exists with the same asset. Write its reference in content: img: asset:ast_… in the frontmatter, ![alt](asset:ast_…) in Markdown for an image, or [text](asset:ast_…) for a link to a video or a PDF.",
  input: z.strictObject({
    filename: z.string().min(1).max(200).describe('Its name, such as continuum.png.'),
    alt: z
      .string()
      .min(1)
      .max(500)
      .describe(
        'What the image shows, for whoever cannot see it, or what the video or the PDF holds: required.',
      ),
    data: z
      .string()
      .min(1)
      .max(MAX_BASE64)
      .optional()
      .describe('The file, in base64, at most 10 MB. Send data or url, not both.'),
    url: z
      .string()
      .min(1)
      .max(2048)
      .optional()
      .describe(
        'A public https URL of the file, which Hollware downloads. Send data or url, not both.',
      ),
  }),
  output: z.object({
    outcome: z.enum(['created', 'exists', 'refused', 'unavailable']),
    asset: asset.optional(),
    problem: z
      .object({ message: z.string(), fix: z.string() })
      .optional()
      .describe('With refused or unavailable: what is wrong, and what to do.'),
  }),
  scopes: ['content:write'],
  effect: 'write',
  outcomes: {
    created: { isError: false },
    exists: { isError: false },
    refused: { isError: true },
    unavailable: { isError: true },
  },
})

export const listAssets = defineOperation({
  name: 'list_assets',
  title: 'List the images, videos and PDFs of the site',
  description:
    'Lists the images, videos and PDFs of the site, newest first, with their reference, URL, size and alt. Pass the nextCursor of an answer as cursor to get the next page.',
  input: z.strictObject({
    limit: z.number().int().min(1).max(100).default(20),
    cursor: z.string().min(1).optional(),
  }),
  output: z.object({
    outcome: z.enum(['ok']),
    assets: z.array(asset),
    nextCursor: z.string().nullable().describe('The cursor of the next page, or null.'),
  }),
  scopes: ['content:read'],
  effect: 'read',
  outcomes: { ok: { isError: false } },
})

export const getAsset = defineOperation({
  name: 'get_asset',
  title: 'Get an image',
  description:
    'Gets an image of the site by its id: its reference, URL, size and alt. The file as it was uploaded is at GET /v1/assets/<id>/original, with a personal token.',
  input: z.strictObject({ id: assetId }),
  output: z.object({
    outcome: z.enum(['ok', 'not_found']),
    asset: asset.optional(),
  }),
  scopes: ['content:read'],
  effect: 'read',
  outcomes: { ok: { isError: false }, not_found: { isError: true } },
})

export const updateAsset = defineOperation({
  name: 'update_asset',
  title: 'Change the alt of an image',
  description:
    'Changes what an image shows for whoever cannot see it, its alt: every entry that shows it with no alt of its own reads the new one. The file never changes: a new picture is a new upload.',
  input: z.strictObject({
    id: assetId,
    alt: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .describe('What the image shows, for whoever cannot see it.'),
  }),
  output: z.object({
    outcome: z.enum(['updated', 'unchanged', 'not_found']),
    asset: asset.optional(),
  }),
  scopes: ['content:write'],
  effect: 'edit',
  outcomes: {
    updated: { isError: false },
    unchanged: { isError: false },
    not_found: { isError: true },
  },
})

/** Every operation, sorted by name: the order of `tools/list`. */
export const OPERATIONS = [
  approveReview,
  commentReview,
  connectAnalytics,
  contentStats,
  createDraft,
  createSite,
  deleteEntry,
  deleteSite,
  describeSite,
  disconnectAnalytics,
  getAnalytics,
  getAsset,
  getEntry,
  getReview,
  getRevision,
  getStructure,
  getTranslations,
  listAssets,
  listBackups,
  listEntries,
  listRedirects,
  listReviews,
  listRevisions,
  makeWebhookSecret,
  moveEntry,
  publish,
  rejectReview,
  requestChanges,
  requestReview,
  restoreEntry,
  restoreRevision,
  restoreSite,
  scheduleUnpublish,
  search,
  setCollection,
  unpublish,
  updateAsset,
  updateDraft,
  updateSite,
  uploadAsset,
  validate,
] as const

export type Operation = (typeof OPERATIONS)[number]

export type OperationName = Operation['name']

/** The spec of an operation, by its name. */
export type OperationByName<Name extends OperationName> = Extract<Operation, { name: Name }>
