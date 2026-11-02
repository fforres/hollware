import type { AutomaticField, AutomaticKind } from './automatic.ts'
import type { StandardJSONSchemaV1, StandardSchemaV1 } from '@standard-schema/spec'
import type { Contract } from '../contracts/types.ts'
import type { Scope } from '../scopes.ts'

/**
 * A schema Hollware can validate with and show to agents: a Standard Schema that also converts to
 * JSON Schema. Zod 4.2 or later is one; any other library that implements both works too.
 */
export type DescribedSchema<Input = unknown, Output = Input> = StandardSchemaV1<Input, Output> &
  StandardJSONSchemaV1<Input, Output>

/** What a schema returns once it accepts a value. */
export type SchemaOutput<Schema extends DescribedSchema> = StandardSchemaV1.InferOutput<Schema>

/** A component an entry may use in its body, such as `::callout{type="tip"}`. */
export interface ComponentDefinition {
  /** Validates the props. It should reject unknown keys. */
  readonly props: DescribedSchema
  /** What the component is for, as `describe_site` shows it. */
  readonly description?: string
  /** An example of its use in Markdown, as `describe_site` shows it. */
  readonly example?: string
}

/**
 * A kind of entry of a site: a blog, docs pages, talks. It is generic over its schema, so that
 * its contracts see the frontmatter the schema returns.
 */
export interface CollectionDefinition<Schema extends DescribedSchema = DescribedSchema> {
  /** The frontmatter every entry must have; `describe_site` shows it as JSON Schema. */
  readonly schema: Schema
  /**
   * The public path of an entry in each locale of the site, with `:slug`:
   * `{ es: '/blog/:slug/', en: '/en/blog/:slug/' }`. Links that match one are internal links.
   */
  readonly routes: Readonly<Record<string, string>>
  /**
   * Translations: the frontmatter field that holds the key the translations of an entry share.
   * Without it, the entries of the collection have no translations.
   */
  readonly translations?: { readonly groupBy: string }
  /** The frontmatter field that holds the entry's tags, an array of strings. */
  readonly tags?: string
  /**
   * The frontmatter field, an ISO 8601 date, that orders the published entries in listings,
   * newest first. Without it, they follow the date of their first publication.
   */
  readonly sortBy?: string
  /**
   * The fields Hollware fills itself, and how (`automatic.ts`): `{ dateModified: 'lastModified' }`.
   * Nobody has to write them, and a site reads them filled.
   */
  readonly automatic?: Readonly<Record<string, AutomaticKind>>
  /** The components the body may use. Any other component is an error. */
  readonly components?: Readonly<Record<string, ComponentDefinition>>
  /**
   * Rules of the collection. The schema, the components, content safety and the size limit are
   * checked anyway.
   */
  readonly contracts?: readonly Contract<SchemaOutput<Schema>>[]
  /** The largest Markdown file accepted, in UTF-8 bytes. 512 KiB when absent. */
  readonly maxMarkdownBytes?: number
  /** Guidance for whoever writes in this collection, in Markdown. */
  readonly styleGuide?: string
  /**
   * How `getNavigation` arranges the published entries, for a sidebar: grouped by the string or
   * enum field `groupBy`, the groups in the order of `groups` (or of the enum), and each group
   * by the number field `orderBy`, then by title.
   */
  readonly navigation?: NavigationDefinition
}

/** How a collection's entries are arranged for navigation. */
export interface NavigationDefinition {
  /** The frontmatter field, a string or an enum, whose value names an entry's group. */
  readonly groupBy?: string
  /** The groups first, in this order; for an enum, values of it. */
  readonly groups?: readonly string[]
  /** The frontmatter field, a number, that orders the entries of a group, lowest first. */
  readonly orderBy?: string
}

/** A site of the deployment. */
export interface SiteDefinition {
  /** Its locales, such as `['es', 'en']`. */
  readonly locales: readonly [string, ...string[]]
  readonly defaultLocale: string
  readonly collections: Readonly<Record<string, CollectionDefinition>>
  /** Guidance for whoever writes anywhere in the site, in Markdown. */
  readonly styleGuide?: string
  /** The public origin of the site, such as `https://example.com`: entries' URLs start with it. */
  readonly url?: string
  /**
   * The origins whose pages may read the published content of the site from the browser, over
   * the read API with a read token (`hw_read_`). None by default.
   */
  readonly cors?: { readonly origins: readonly string[] }
  /** Who hears about publications. */
  readonly events?: {
    /** Each gets every event, signed with HMAC-SHA256 by the Worker secret named in `secret`. */
    readonly webhooks?: readonly {
      readonly name: string
      readonly url: string
      /** The Worker secret that signs; Hollware's own sealed one when it is left out. */
      readonly secret?: string
    }[]
    /** Tells IndexNow the URLs that changed; `key` is the key itself, which is public. */
    readonly indexNow?: { readonly key: string }
  }
  /**
   * The agents that hear the site's events, each as an agent member of the site, through a webhook
   * or a service binding, with a grant of `scopes` that lasts an hour. None by default.
   */
  readonly agents?: readonly AgentDefinition[]
  /** Whether an approval waits for the agents marked `required`: it does not by default. */
  readonly review?: { readonly requireAgents?: boolean }
  /** Who may come in through a sign-in provider without an invitation: nobody by default. */
  readonly access?: {
    /**
     * People whose verified email is one of `emails` or ends in `@` one of `domains` become
     * members with `role` the first time they sign in; `null` lets nobody in that way.
     */
    readonly autoProvision?: {
      readonly domains?: readonly string[]
      readonly emails?: readonly string[]
      readonly role?: ProvisionRole
    } | null
  }
  /** What the site's activity log keeps: no addresses, and forever, by default. */
  readonly audit?: {
    /** `hashed` keeps a keyed hash of the address of each request; `off` keeps nothing of it. */
    readonly ipAddresses?: 'off' | 'hashed'
    /** How many days a line is kept, 30 to 3650; `null` keeps the log as long as the site. */
    readonly retentionDays?: number | null
  }
  /** The daily backups of the site to the R2 bucket: each day, kept 30 days, by default. */
  readonly backups?: {
    /** `false` makes no backup; those already kept go when their retention passes. */
    readonly enabled?: boolean
    /** How many days each backup is kept, 1 to 365. */
    readonly retentionDays?: number
  }
  /** How the site converts the images it receives: WebP at 85, 2400 pixels wide. */
  readonly media?: {
    readonly format?: 'webp' | 'avif' | 'original'
    readonly quality?: number
    readonly maxWidth?: number
    /** The narrower copies made of each image for `srcset`, in pixels: 640 and 1280 by default. */
    readonly widths?: readonly number[]
    /** Whether the file as it was uploaded is kept besides the one served: true by default. */
    readonly keepOriginals?: boolean
  }
}

/** What `hollware.config.ts` exports. */
export interface HollwareConfig {
  /**
   * The sites of 0.x, by key: the sites now live in D1, and these move there on the
   * first request of a deployment whose D1 has no definition for them. The key is the site's id
   * in the database, so it never changes once content exists.
   */
  readonly sites?: Readonly<Record<string, SiteDefinition>>
  /** How MCP clients and the admin get tokens. */
  readonly auth?: AuthDefinition
  /** How the admin looks in the browser. */
  readonly admin?: AdminDefinition
}

/** The admin of a deployment and its sign-in pages. */
export interface AdminDefinition {
  /**
   * The `https://` URL of an image the browser shows as their icon, in place of Hollware's flame.
   * The Worker serves it from its own origin, so the pages' policy stays `img-src 'self'`.
   */
  readonly favicon?: string
  /**
   * Where the admin lives on the Worker's origin: `'/admin'` (the default), or `'/'` for an origin
   * of its own, such as `https://admin.example.com/`. Its files stay under `/admin/assets/`.
   */
  readonly path?: AdminPath
}

export type AdminPath = '/admin' | '/'

/**
 * A provider people sign in with. A client secret is the name of the Worker secret that holds
 * it, never the secret itself. Google, Microsoft and GitHub take their kind as their id unless
 * `id` says otherwise.
 */
export type ProviderDefinition =
  | {
      readonly kind: 'google'
      readonly id?: string
      readonly clientId: string
      readonly clientSecret: string
    }
  | {
      readonly kind: 'microsoft'
      readonly id?: string
      /** The id or domain of one directory: `common`, `organizations` and `consumers` are refused. */
      readonly tenant: string
      readonly clientId: string
      readonly clientSecret: string
    }
  | {
      readonly kind: 'github'
      readonly id?: string
      readonly clientId: string
      readonly clientSecret: string
    }
  | {
      readonly kind: 'oidc'
      readonly id: string
      /** What the sign-in page calls it. */
      readonly name: string
      /** The issuer, whose `/.well-known/openid-configuration` names its endpoints. */
      readonly issuer: string
      readonly clientId: string
      readonly clientSecret: string
      /** `openid email profile` by default; `openid` is always among them. */
      readonly scopes?: readonly string[]
    }
  | {
      readonly kind: 'cloudflare-access'
      readonly id?: string
      /** The team domain, such as `example.cloudflareaccess.com`. */
      readonly teamDomain: string
      /** The Application Audience (AUD) tag of the Access application. */
      readonly audience: string
    }

/** The OAuth server of a deployment. */
export interface AuthDefinition {
  /**
   * Whether a client may register itself (RFC 7591), for MCP clients that cannot present a
   * Client ID Metadata Document. Off by default: a registration is a write to KV that anyone can
   * make, and MCP 2026-07-28 prefers metadata documents.
   */
  readonly dynamicClientRegistration?: boolean
  /** Whether people may sign in with a passkey: true by default. */
  readonly passkeys?: boolean
  /** The providers people sign in with, in the order the sign-in page lists them. */
  readonly providers?: readonly ProviderDefinition[]
}

/** A collection once the config is resolved: checked, with every default filled in. */
export interface ResolvedCollection {
  readonly name: string
  readonly schema: DescribedSchema
  readonly routes: Readonly<Record<string, string>>
  readonly translationGroupField: string | null
  readonly tagsField: string | null
  readonly sortByField: string | null
  /** The fields Hollware fills itself, with the shape of each value. */
  readonly automaticFields: Readonly<Record<string, AutomaticField>>
  readonly components: ReadonlyMap<string, ComponentDefinition>
  /** The contracts of the collection; the built-in ones run besides them. */
  readonly contracts: readonly Contract<unknown>[]
  readonly maxMarkdownBytes: number
  readonly styleGuide: string | null
  readonly navigation: ResolvedNavigation | null
}

/** A collection's navigation once resolved: `groups` are the given ones, or the enum's values. */
export interface ResolvedNavigation {
  readonly groupBy: string | null
  readonly groups: readonly string[] | null
  readonly orderBy: string | null
}

/** A site once the config is resolved. */
export interface ResolvedSite {
  readonly key: string
  readonly locales: readonly string[]
  readonly defaultLocale: string
  readonly styleGuide: string | null
  readonly collections: ReadonlyMap<string, ResolvedCollection>
  /** The public origin of the site, or `null`. */
  readonly url: string | null
  /** The origins that may call the read API from a page, each as `URL.origin` gives it. */
  readonly cors: { readonly origins: readonly string[] }
  readonly events: ResolvedEvents
  readonly audit: ResolvedAudit
  readonly backups: ResolvedBackups
  readonly media: ResolvedMedia
  readonly access: ResolvedAccess
  readonly agents: readonly ResolvedAgent[]
  readonly review: ResolvedReview
}

/** An event an agent may hear. */
export type AgentEventKind =
  | 'review.requested'
  | 'review.decided'
  | 'entry.published'
  | 'entry.unpublished'
  | 'site.changed'

/** An agent as a site declares it. */
export interface AgentDefinition {
  readonly name: string
  /** The id of an agent member of the site (`usr_…`), whose grants it gets. */
  readonly member: string
  readonly events: readonly AgentEventKind[]
  readonly delivery:
    | { readonly kind: 'webhook'; readonly url: string; readonly secret?: string }
    | { readonly kind: 'binding'; readonly binding: string }
  /** What its grants may do, within an author's scopes; read and comment by default. */
  readonly scopes?: readonly Scope[]
  /** Whether an approval waits for its comment when `review.requireAgents` is on. */
  readonly required?: boolean
}

export interface ResolvedAgent {
  readonly name: string
  readonly member: string
  readonly events: readonly AgentEventKind[]
  readonly delivery:
    | { readonly kind: 'webhook'; readonly url: string; readonly secret: string | null }
    | { readonly kind: 'binding'; readonly binding: string }
  readonly scopes: readonly Scope[]
  readonly required: boolean
}

export interface ResolvedReview {
  readonly requireAgents: boolean
}

/** The roles a site may give whoever it lets in without an invitation. */
export type ProvisionRole = 'reviewer' | 'author' | 'editor'

/** Who comes in through a sign-in provider without an invitation, with lowercase addresses. */
export interface ResolvedAccess {
  readonly autoProvision: {
    readonly domains: readonly string[]
    readonly emails: readonly string[]
    readonly role: ProvisionRole
  } | null
}

/** The daily backups of a site: whether the cron makes them, and how long each is kept. */
export interface ResolvedBackups {
  readonly enabled: boolean
  readonly retentionDays: number
}

export interface ResolvedMedia {
  readonly format: 'webp' | 'avif' | 'original'
  readonly quality: number
  readonly maxWidth: number
  readonly widths: readonly number[]
  readonly keepOriginals: boolean
}

/** What the activity log of a site keeps. */
export interface ResolvedAudit {
  readonly ipAddresses: 'off' | 'hashed'
  readonly retentionDays: number | null
}

export interface ResolvedWebhook {
  readonly name: string
  readonly url: string
  readonly secret: string | null
}

export interface ResolvedEvents {
  readonly webhooks: readonly ResolvedWebhook[]
  readonly indexNow: { readonly key: string } | null
}

/** The config once resolved, at the start of the Worker: one site or more. */
export interface ResolvedConfig {
  readonly sites: ReadonlyMap<string, ResolvedSite>
  readonly auth: ResolvedAuth
  readonly admin: ResolvedAdmin
}

/** The admin once the config is resolved: `favicon` is `null` for Hollware's own. */
export interface ResolvedAdmin {
  readonly favicon: string | null
  readonly path: AdminPath
}

/** The OAuth server once the config is resolved. */
export interface ResolvedAuth {
  readonly dynamicClientRegistration: boolean
  readonly passkeys: boolean
  readonly providers: readonly ResolvedProvider[]
}

/** A provider once the config is resolved: its id, and the name the sign-in page shows. */
export type ResolvedProvider =
  | {
      readonly kind: 'google' | 'github'
      readonly id: string
      readonly name: string
      readonly clientId: string
      readonly clientSecret: string
    }
  | {
      readonly kind: 'microsoft'
      readonly id: string
      readonly name: string
      readonly tenant: string
      readonly clientId: string
      readonly clientSecret: string
    }
  | {
      readonly kind: 'oidc'
      readonly id: string
      readonly name: string
      readonly issuer: string
      readonly clientId: string
      readonly clientSecret: string
      readonly scopes: readonly string[]
    }
  | {
      readonly kind: 'cloudflare-access'
      readonly id: string
      readonly name: string
      readonly teamDomain: string
      readonly audience: string
    }

/**
 * Checks a config and fills in its defaults. It throws one error that lists every problem, each
 * with its fix, so that a broken config stops the Worker at startup with an actionable message.
 */
export type ResolveConfig = (config: HollwareConfig) => ResolvedConfig
