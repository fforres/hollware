import type { Messages } from '../i18n/en.ts'
import { entryPath, titleOf } from './entries.ts'
import { personName } from './people.ts'
import { settingsGroups } from './settings.ts'

export interface Command {
  readonly label: string
  readonly icon: string
  readonly suffix?: string
  readonly description?: string
  readonly to?: string
  readonly kbds?: string[]
  readonly disabled?: boolean
  readonly onSelect?: () => void
}

export interface CommandGroup {
  readonly id: string
  readonly label: string
  readonly items: Command[]
  readonly ignoreFilter?: boolean
}

export interface EntryCommands {
  readonly status: 'draft' | 'scheduled' | 'published'
  readonly canPublish: boolean
  readonly source: boolean
  readonly lossy: boolean
  readonly canPreview: boolean
  readonly publish: () => void
  readonly schedule: () => void
  readonly toggleSource: () => void
  readonly preview: () => void
}

interface Found {
  readonly entry: {
    readonly collection: string
    readonly locale: string
    readonly slug: string
    readonly frontmatter: Readonly<Record<string, unknown>>
  }
  readonly snippet: string
}

interface Listed {
  readonly collection: string
  readonly locale: string
  readonly slug: string
  readonly frontmatter: Readonly<Record<string, unknown>>
}

interface Waiting {
  readonly entry: Listed
  readonly requestedBy: string
  readonly requestedByName?: string | null
}

export interface CommandInput {
  readonly query: string
  readonly site: string | null
  readonly role: string | null
  readonly scopes: readonly string[]
  readonly sites: readonly { readonly site: string; readonly role: string }[]
  readonly collections: readonly string[]
  readonly entry: EntryCommands | null
  readonly found: readonly Found[]
  readonly drafts: readonly Listed[]
  readonly waiting: readonly Waiting[]
  readonly switchSite: (site: string) => void
}

const MOST = 8

export function entryCommands(entry: EntryCommands, m: Messages): Command[] {
  return [
    ...(entry.canPublish
      ? [{ label: m.entry.publish, icon: 'i-lucide-send', onSelect: entry.publish }]
      : []),
    ...(entry.status === 'draft'
      ? [{ label: m.entry.schedule, icon: 'i-lucide-calendar-clock', onSelect: entry.schedule }]
      : []),
    ...(entry.lossy
      ? []
      : [
          {
            label: entry.source ? m.entry.editVisually : m.entry.viewMarkdown,
            icon: entry.source ? 'i-lucide-pen-line' : 'i-lucide-code',
            kbds: ['meta', 'shift', 'm'],
            onSelect: entry.toggleSource,
          },
        ]),
    ...(entry.canPreview
      ? [{ label: m.entry.previewOnSite, icon: 'i-lucide-eye', onSelect: entry.preview }]
      : []),
  ]
}

function matches(query: string, entry: Listed): boolean {
  const term = query.trim().toLowerCase()
  return (
    term.length >= 2 &&
    (titleOf(entry).toLowerCase().includes(term) || entry.slug.toLowerCase().includes(term))
  )
}

export function commandGroups(input: CommandInput, m: Messages): CommandGroup[] {
  const groups: CommandGroup[] = []
  if (input.entry !== null) {
    groups.push({ id: 'entry', label: m.search.thisEntry, items: entryCommands(input.entry, m) })
  }
  groups.push(
    {
      id: 'published',
      label: m.search.published,
      ignoreFilter: true,
      items: input.found.slice(0, MOST).map(({ entry, snippet }) => ({
        label: titleOf(entry),
        suffix: `${entry.collection} · ${entry.locale}`,
        description: snippet.replace(/[[\]]/g, ''),
        icon: 'i-lucide-file-text',
        to: entryPath(entry),
      })),
    },
    {
      id: 'drafts',
      label: m.search.drafts,
      ignoreFilter: true,
      items: input.drafts
        .filter((entry) => matches(input.query, entry))
        .slice(0, MOST)
        .map((entry) => ({
          label: titleOf(entry),
          suffix: `${entry.collection} · ${entry.locale}`,
          icon: 'i-lucide-file-pen-line',
          to: entryPath(entry),
        })),
    },
    {
      id: 'reviews',
      label: m.search.waiting,
      items: input.waiting.map((review) => ({
        label: titleOf(review.entry),
        suffix: m.search.askedBy(
          personName(review.requestedBy, review.requestedByName ?? null, m.people.formerPerson),
        ),
        icon: 'i-lucide-inbox',
        to: '/reviews',
      })),
    },
    {
      id: 'go',
      label: m.search.goTo,
      items: [
        { label: m.nav.home, icon: 'i-lucide-house', to: '/' },
        { label: m.nav.reviews, icon: 'i-lucide-inbox', to: '/reviews' },
        { label: m.nav.entries, icon: 'i-lucide-file-text', to: '/entries' },
        { label: m.nav.images, icon: 'i-lucide-image', to: '/images' },
        ...input.collections.map((name) => ({
          label: m.search.entriesOf(name),
          icon: 'i-lucide-layers',
          to: `/entries?collection=${encodeURIComponent(name)}`,
        })),
        ...settingsGroups(input.scopes).flatMap((group) =>
          group.sections.map((section) => ({
            label: m.search.inSettings(m.settings.sections[section.key]),
            icon: section.icon,
            to: section.to,
          })),
        ),
        ...input.collections.map((name) => ({
          label: m.search.collection(name),
          icon: 'i-lucide-layers',
          to: `/settings/collections/${encodeURIComponent(name)}`,
        })),
      ],
    },
    {
      id: 'create',
      label: m.search.create,
      items: [
        { label: m.search.newEntry, icon: 'i-lucide-plus', kbds: ['c'], to: '/entries/new' },
        { label: m.search.newCollection, icon: 'i-lucide-plus', to: '/settings/collections' },
        { label: m.search.newSite, icon: 'i-lucide-plus', to: '/settings/site#sites' },
        { label: m.search.invite, icon: 'i-lucide-user-plus', to: '/settings/people' },
        { label: m.search.newToken, icon: 'i-lucide-key-round', to: '/settings/tokens' },
      ],
    },
    {
      id: 'sites',
      label: m.search.switchSite,
      items: input.sites
        .filter((membership) => membership.site !== input.site)
        .map((membership) => ({
          label: membership.site,
          suffix: m.roles[membership.role] ?? membership.role,
          icon: 'i-lucide-globe',
          onSelect: () => input.switchSite(membership.site),
        })),
    },
  )
  return groups.filter((group) => group.items.length > 0)
}
