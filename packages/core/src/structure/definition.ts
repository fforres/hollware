import { AUTOMATIC_KINDS } from '../config/automatic.ts'
import { AGENT_EVENT_KINDS } from '../config/agents.ts'
import { SCOPES } from '../scopes.ts'
import * as z from 'zod'
import { AUDIT_RETENTION_MAX_DAYS, AUDIT_RETENTION_MIN_DAYS } from '../config/audit.ts'
import { MAX_FILE_BYTES } from '../media/index.ts'
import {
  DEFAULT_MEDIA,
  MEDIA_FORMATS,
  MEDIA_MAX_WIDTH,
  MEDIA_MAX_WIDTHS,
  MEDIA_MIN_WIDTH,
} from '../config/media.ts'
import {
  BACKUP_RETENTION_MAX_DAYS,
  BACKUP_RETENTION_MIN_DAYS,
  DEFAULT_BACKUPS,
} from '../config/backups.ts'

const jsonSchema = z
  .record(z.string(), z.unknown())
  .describe('A JSON Schema, draft 2020-12, of an object.')

const severity = z.enum(['error', 'warning'])

export const ruleDefinition = z.strictObject({
  rule: z.string().min(1).describe('The name of a rule of the catalog that describe_site lists.'),
  severity: severity.default('error'),
  params: z
    .record(z.string(), z.unknown())
    .default({})
    .describe('The parameters of the rule, as the catalog describes them.'),
  id: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional()
    .describe(
      'The id of the contract, when a collection lists one rule twice; its name otherwise.',
    ),
})

export const componentDefinitionData = z.strictObject({
  props: jsonSchema.describe('The JSON Schema of the props.'),
  description: z.string().min(1).optional(),
  example: z.string().min(1).optional(),
})

export const collectionDefinitionData = z.strictObject({
  schema: jsonSchema.describe('The JSON Schema of the frontmatter.'),
  routes: z
    .record(z.string(), z.string())
    .describe('The public path of an entry in each locale, with :slug: { "en": "/blog/:slug/" }.'),
  translationGroupField: z.string().min(1).nullable().default(null),
  tagsField: z.string().min(1).nullable().default(null),
  sortByField: z.string().min(1).nullable().default(null),
  automaticFields: z
    .record(z.string(), z.enum(AUTOMATIC_KINDS))
    .default({})
    .describe(
      'The fields Hollware fills itself, so that nobody writes them: { "date": "firstPublished", "dateModified": "lastModified", "readingTime": "readingTime" }. firstPublished and lastModified fill a date field (a date written in the Markdown wins for the first, and a later one for the second); readingTime (minutes at 200 words a minute) and wordCount fill an integer. A site reads them filled; they are never required.',
    ),
  components: z.record(z.string(), componentDefinitionData).default({}),
  rules: z.array(ruleDefinition).default([]),
  maxMarkdownBytes: z.number().int().positive().nullable().default(null),
  styleGuide: z.string().nullable().default(null),
  navigation: z
    .strictObject({
      groupBy: z.string().min(1).optional(),
      groups: z.array(z.string().min(1)).optional(),
      orderBy: z.string().min(1).optional(),
    })
    .nullable()
    .default(null)
    .describe(
      'How getNavigation arranges the published entries for a sidebar: grouped by groupBy, a string or enum field, the groups in the order of groups (or of the enum), and each group by orderBy, a number field, then by title. null lists them by title.',
    ),
})

export const webhookDefinition = z.strictObject({
  name: z.string().min(1),
  url: z.string().min(1).describe('The https URL that receives each event, signed.'),
  secret: z
    .string()
    .min(1)
    .optional()
    .describe(
      'The Worker secret that signs the deliveries. Leave it out for Hollware to make one with make_webhook_secret and keep it sealed.',
    ),
})

export const agentDefinition = z.strictObject({
  name: z.string().min(1).describe('Its name, lowercase words joined by hyphens.'),
  member: z
    .string()
    .min(1)
    .describe('The id of the agent member of the site (usr_…) it acts as, made in the admin.'),
  events: z.array(z.enum(AGENT_EVENT_KINDS)).min(1).describe('The events it hears.'),
  delivery: z
    .discriminatedUnion('kind', [
      z.strictObject({
        kind: z.literal('webhook'),
        url: z.string().min(1).describe('The https URL that receives each event, signed.'),
        secret: z
          .string()
          .min(1)
          .optional()
          .describe(
            'The Worker secret that signs the deliveries; Hollware makes one with make_webhook_secret when it is left out.',
          ),
      }),
      z.strictObject({
        kind: z.literal('binding'),
        binding: z
          .string()
          .min(1)
          .describe('The service binding of the Worker that runs the agent, such as AGENTS.'),
      }),
    ])
    .describe('Where each event goes, with a grant of an hour for the agent to act.'),
  scopes: z
    .array(z.enum(SCOPES))
    .min(1)
    .optional()
    .describe(
      'What its grants may do, within the scopes of an author; content:read, review:read and review:comment when left out.',
    ),
  required: z
    .boolean()
    .default(false)
    .describe('Whether an approval waits for its comment, when review.requireAgents is on.'),
})

export const siteDefinitionData = z.strictObject({
  locales: z.array(z.string().min(1)).min(1),
  defaultLocale: z.string().min(1),
  url: z.string().min(1).nullable().default(null),
  styleGuide: z.string().nullable().default(null),
  cors: z.strictObject({ origins: z.array(z.string().min(1)) }).default({ origins: [] }),
  events: z
    .strictObject({
      webhooks: z.array(webhookDefinition).default([]),
      indexNow: z
        .strictObject({ key: z.string().min(1) })
        .nullable()
        .default(null),
    })
    .default({ webhooks: [], indexNow: null }),
  audit: z
    .strictObject({
      ipAddresses: z
        .enum(['off', 'hashed'])
        .default('off')
        .describe(
          'Whether the activity log keeps the address of each request, as a hash keyed by the site, or nothing of it.',
        ),
      retentionDays: z
        .number()
        .int()
        .min(AUDIT_RETENTION_MIN_DAYS)
        .max(AUDIT_RETENTION_MAX_DAYS)
        .nullable()
        .default(null)
        .describe(
          'The days each line of the activity log is kept; null keeps it as long as the site.',
        ),
    })
    .default({ ipAddresses: 'off', retentionDays: null })
    .describe('What the activity log of the site keeps. Only an owner should change it.'),
  backups: z
    .strictObject({
      enabled: z
        .boolean()
        .default(DEFAULT_BACKUPS.enabled)
        .describe(
          'Whether the cron writes a backup of the site each day after 03:00 UTC to the R2 bucket of the deployment: the definition and the Markdown of every entry, never the images. false makes none; those already kept go when their retention passes.',
        ),
      retentionDays: z
        .number()
        .int()
        .min(BACKUP_RETENTION_MIN_DAYS)
        .max(BACKUP_RETENTION_MAX_DAYS)
        .default(DEFAULT_BACKUPS.retentionDays)
        .describe('How many days each daily backup is kept, 1 to 365.'),
    })
    .default({ ...DEFAULT_BACKUPS })
    .describe('The daily backups of the site. Only an owner should change it.'),
  media: z
    .strictObject({
      format: z
        .enum(MEDIA_FORMATS)
        .default(DEFAULT_MEDIA.format)
        .describe(
          'What JPEG, PNG and GIF images become when they arrive: "webp", "avif", or "original" to keep them as they came. SVG is never converted.',
        ),
      quality: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(DEFAULT_MEDIA.quality)
        .describe('The quality of photographs, 1 to 100. PNG images are always kept lossless.'),
      maxWidth: z
        .number()
        .int()
        .min(MEDIA_MIN_WIDTH)
        .max(MEDIA_MAX_WIDTH)
        .default(DEFAULT_MEDIA.maxWidth)
        .describe('The widest an image is kept, in pixels; a wider one is scaled down, never up.'),
      widths: z
        .array(z.number().int().min(MEDIA_MIN_WIDTH).max(MEDIA_MAX_WIDTH))
        .max(MEDIA_MAX_WIDTHS)
        .refine(
          (widths) => widths.every((width, at) => at === 0 || width > (widths[at - 1] ?? 0)),
          'Smallest first, each width once.',
        )
        .default([...DEFAULT_MEDIA.widths])
        .describe(
          'The widths, in pixels and smallest first, of the narrower copies made of each image when it is uploaded, for srcset: an image gets those narrower than itself. [] makes none; each copy is one more conversion of Cloudflare Images.',
        ),
      keepOriginals: z
        .boolean()
        .default(DEFAULT_MEDIA.keepOriginals)
        .describe(
          'Whether the file as it was uploaded is kept in R2 besides the one served, for a later change of format. false keeps only the file served and its copies, which takes less storage; the images uploaded before keep theirs.',
        ),
      maxBytes: z
        .number()
        .int()
        .min(1)
        .max(MAX_FILE_BYTES)
        .default(DEFAULT_MEDIA.maxBytes)
        .describe(
          'The largest video (MP4, WebM) or PDF the site takes, in bytes: 104857600 (100 MB) by default, up to 5000000000. One upload request carries at most what the Cloudflare plan of the zone allows: 100 MB on Free and Pro, 200 MB on Business, 500 MB on Enterprise. Images stay at 10 MB, what Cloudflare Images converts.',
        ),
    })
    .default({ ...DEFAULT_MEDIA, widths: [...DEFAULT_MEDIA.widths] })
    .describe('How the site converts the images it receives.'),
  access: z
    .strictObject({
      autoProvision: z
        .strictObject({
          domains: z
            .array(z.string().min(1))
            .default([])
            .describe('The domains whose addresses come in, such as "example.com".'),
          emails: z
            .array(z.string().min(1))
            .default([])
            .describe('The addresses that come in, such as "ada@example.com".'),
          role: z
            .enum(['author', 'editor'])
            .default('author')
            .describe('The role each of them gets in the site.'),
        })
        .nullable()
        .default(null)
        .describe(
          'Who becomes a member the first time they sign in through a provider with a verified email that matches; null lets nobody in without an invitation.',
        ),
    })
    .default({ autoProvision: null })
    .describe('Who may come in without an invitation. Only an owner should change it.'),
  agents: z
    .array(agentDefinition)
    .default([])
    .describe('The agents that hear the events of the site. Only an owner should change it.'),
  review: z
    .strictObject({
      requireAgents: z
        .boolean()
        .default(false)
        .describe(
          'Whether approve_review waits for a comment of every agent marked required; an owner may override it.',
        ),
    })
    .default({ requireAgents: false })
    .describe('How reviews are decided. Only an owner should change it.'),
  collections: z.record(z.string(), collectionDefinitionData),
})

export type RuleDefinition = z.output<typeof ruleDefinition>
export type CollectionDefinitionData = z.output<typeof collectionDefinitionData>
export type SiteDefinitionData = z.output<typeof siteDefinitionData>
export type AgentDefinitionData = z.output<typeof agentDefinition>
/** A definition as a person or an agent writes it, with the defaults left out. */
export type SiteDefinitionInput = z.input<typeof siteDefinitionData>
