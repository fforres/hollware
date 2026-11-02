import type { CollectionDefinitionData, SiteDefinitionData } from './definition.ts'

type Definition = SiteDefinitionData
type CollectionDefinition = CollectionDefinitionData

export const PRESETS = ['blog', 'docs', 'empty'] as const

export type Preset = (typeof PRESETS)[number]

export function routesFor(
  name: string,
  locales: readonly string[],
  defaultLocale: string,
): Record<string, string> {
  return Object.fromEntries(
    locales.map((locale) => [
      locale,
      locale === defaultLocale ? `/${name}/:slug/` : `/${locale}/${name}/:slug/`,
    ]),
  )
}

export function collectionPreset(
  preset: Preset,
  name: string,
  locales: readonly string[],
  defaultLocale: string,
): CollectionDefinition {
  const translated = locales.length > 1
  const base = {
    routes: routesFor(name, locales, defaultLocale),
    translationGroupField: null,
    tagsField: null,
    sortByField: null,
    automaticFields: {},
    components: {},
    rules: [],
    maxMarkdownBytes: null,
    styleGuide: null,
    navigation: null,
  }
  switch (preset) {
    case 'empty':
      return {
        ...base,
        schema: {
          type: 'object',
          properties: { title: { type: 'string', minLength: 1 } },
          required: ['title'],
        },
      }
    case 'blog':
      return {
        ...base,
        schema: {
          type: 'object',
          properties: {
            title: { type: 'string', minLength: 1 },
            description: { type: 'string', minLength: 1, maxLength: 160 },
            date: { type: 'string', format: 'date' },
            tags: { type: 'array', items: { type: 'string', minLength: 1 } },
            ...(translated ? { translationGroup: { type: 'string', minLength: 1 } } : {}),
          },
          required: ['title', 'description', ...(translated ? ['translationGroup'] : [])],
        },
        translationGroupField: translated ? 'translationGroup' : null,
        tagsField: 'tags',
        sortByField: 'date',
        automaticFields: { date: 'firstPublished' },
        rules: [
          { rule: 'images-have-alt', severity: 'error', params: {} },
          { rule: 'internal-links-resolve', severity: 'warning', params: {} },
          ...(translated
            ? [{ rule: 'translation-pair', severity: 'warning' as const, params: {} }]
            : []),
        ],
      }
    case 'docs':
      return {
        ...base,
        schema: {
          type: 'object',
          properties: {
            title: { type: 'string', minLength: 1, maxLength: 70 },
            description: { type: 'string', minLength: 1, maxLength: 160 },
            section: { type: 'string', minLength: 1 },
            order: { type: 'integer', minimum: 0 },
          },
          required: ['title', 'description'],
        },
        navigation: { groupBy: 'section', orderBy: 'order' },
        rules: [
          { rule: 'images-have-alt', severity: 'error', params: {} },
          { rule: 'internal-links-resolve', severity: 'warning', params: {} },
        ],
      }
  }
}

/** A new site: its locales, and one collection from the preset. */
export function sitePreset(
  preset: Preset,
  locales: readonly string[],
  defaultLocale: string,
): Definition {
  const name = preset === 'empty' ? 'pages' : preset
  const collections = { [name]: collectionPreset(preset, name, locales, defaultLocale) }
  return {
    locales: [...locales],
    defaultLocale,
    url: null,
    styleGuide: null,
    cors: { origins: [] },
    events: { webhooks: [], indexNow: null },
    audit: { ipAddresses: 'off', retentionDays: null },
    backups: { enabled: true, retentionDays: 30 },
    media: {
      format: 'webp',
      quality: 85,
      maxWidth: 2400,
      widths: [640, 1280],
      keepOriginals: true,
      maxBytes: 104857600,
    },
    access: { autoProvision: null },
    agents: [],
    review: { requireAgents: false },
    collections,
  }
}
