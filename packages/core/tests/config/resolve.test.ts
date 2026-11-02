import { describe, expect, it } from 'vite-plus/test'
import * as z from 'zod'

import { defineCollection, defineComponent, defineConfig } from '../../src/config/define.ts'
import { resolveConfig } from '../../src/config/resolve.ts'
import { contracts } from '../../src/contracts/index.ts'
import type { ResolveConfig } from '../../src/config/types.ts'
import {
  blogConfig,
  collectionWith,
  configWith,
  frontmatter,
  schemaOf,
  siteOf,
  siteWith,
} from './support.ts'

const playgroundBlog = defineCollection({
  schema: z.object({
    title: z.string().min(1),
    seoTitle: z.string().min(1).max(60).optional(),
    description: z.string().min(1).max(160),
    date: z.iso.date(),
    tags: z.array(z.string().min(1)).min(1),
    translationGroup: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  }),
  routes: { es: '/blog/:slug/', en: '/en/blog/:slug/' },
  translations: { groupBy: 'translationGroup' },
  tags: 'tags',
  sortBy: 'date',
  components: {
    callout: defineComponent({
      props: z.strictObject({ type: z.enum(['info', 'warning', 'tip']) }),
      description: 'A highlighted note in the flow of the text.',
      example: '::callout{type="tip"}\nKeep the slug short.\n::',
    }),
    youtube: defineComponent({
      props: z.strictObject({ id: z.string().regex(/^[\w-]{11}$/) }),
      description: 'A YouTube video, by its id.',
      example: '::youtube{id="dQw4w9WgXcQ"}\n::',
    }),
  },
  contracts: [
    {
      id: 'seo-title-length',
      severity: 'warning',
      description: 'A title of at most 60 characters, or a seoTitle, which search engines show.',
      check: ({ frontmatter: entry }) =>
        entry.title.length <= 60 || entry.seoTitle !== undefined
          ? []
          : [
              {
                path: '/frontmatter/title',
                message: `The title has ${entry.title.length} characters.`,
                fix: 'Shorten the title to 60 characters or fewer, or add a seoTitle.',
              },
            ],
    },
  ],
  styleGuide: 'Short paragraphs, one idea per section, and an example for every claim.',
})

const playground = defineConfig({
  sites: {
    playground: {
      locales: ['es', 'en'],
      defaultLocale: 'es',
      collections: { blog: playgroundBlog },
      styleGuide: 'Spanish for Latin America, with tú, and plain international English.',
    },
  },
})

describe('resolveConfig', () => {
  it('is a ResolveConfig', () => {
    const resolve: ResolveConfig = resolveConfig
    expect(resolve(playground).sites.size).toBe(1)
  })

  it('resolves a config like the playground to the resolved shape', () => {
    const resolved = resolveConfig(playground)
    expect([...resolved.sites.keys()]).toEqual(['playground'])
    const components = playgroundBlog.components
    expect(siteOf(resolved, 'playground')).toStrictEqual({
      key: 'playground',
      locales: ['es', 'en'],
      defaultLocale: 'es',
      styleGuide: 'Spanish for Latin America, with tú, and plain international English.',
      url: null,
      cors: { origins: [] },
      events: { webhooks: [], indexNow: null },
      audit: { ipAddresses: 'off', retentionDays: null },
      backups: { enabled: true, retentionDays: 30 },
      access: { autoProvision: null },
      agents: [],
      review: { requireAgents: false },
      media: {
        format: 'webp',
        quality: 85,
        maxWidth: 2400,
        widths: [640, 1280],
        keepOriginals: true,
        maxBytes: 104857600,
      },
      collections: new Map([
        [
          'blog',
          {
            name: 'blog',
            schema: playgroundBlog.schema,
            routes: { es: '/blog/:slug/', en: '/en/blog/:slug/' },
            translationGroupField: 'translationGroup',
            tagsField: 'tags',
            sortByField: 'date',
            automaticFields: {},
            components: new Map([
              [
                'callout',
                {
                  props: components?.['callout']?.props,
                  description: 'A highlighted note in the flow of the text.',
                  example: '::callout{type="tip"}\nKeep the slug short.\n::',
                },
              ],
              [
                'youtube',
                {
                  props: components?.['youtube']?.props,
                  description: 'A YouTube video, by its id.',
                  example: '::youtube{id="dQw4w9WgXcQ"}\n::',
                },
              ],
            ]),
            contracts: playgroundBlog.contracts,
            maxMarkdownBytes: 524288,
            styleGuide: 'Short paragraphs, one idea per section, and an example for every claim.',
            navigation: null,
          },
        ],
      ]),
    })
  })

  it('hands on the schema, the props and the contracts as it was given them', () => {
    const collection = siteOf(resolveConfig(playground), 'playground').collections.get('blog')
    expect(collection?.schema).toBe(playgroundBlog.schema)
    expect(collection?.components.get('callout')?.props).toBe(
      playgroundBlog.components?.['callout']?.props,
    )
    expect(collection?.contracts[0]).toBe(playgroundBlog.contracts?.[0])
  })

  it('lets through the contracts that Hollware made, next to the ones a site writes', () => {
    const translationPair = contracts.translationPair()
    const links = contracts.internalLinksResolve({ severity: 'warning' })
    const alt = contracts.imagesHaveAlt()
    const seo = {
      id: 'seo-title-length',
      severity: 'warning',
      description: 'A short title.',
      check: () => [],
    }
    const resolved = resolveConfig(
      blogConfig({
        translations: { groupBy: 'group' },
        contracts: [translationPair, links, alt, seo],
      }),
    )
    const blog = siteOf(resolved, 'demo').collections.get('blog')
    expect(blog?.contracts.map((contract) => contract.id)).toEqual([
      'translation-pair',
      'internal-links-resolve',
      'images-have-alt',
      'seo-title-length',
    ])
    expect(blog?.contracts[0]).toBe(translationPair)
    expect(blog?.contracts[1]).toBe(links)
    expect(blog?.contracts[1]?.severity).toBe('warning')
    expect(blog?.contracts[2]).toBe(alt)
    expect(blog?.contracts[3]).toBe(seo)
  })

  it('fills what the config leaves out: nulls, empty maps and lists, and 512 KiB', () => {
    const schema = z.object({ title: z.string() })
    const resolved = resolveConfig({
      sites: {
        notes: {
          locales: ['en'],
          defaultLocale: 'en',
          collections: { posts: { schema, routes: { en: '/posts/:slug/' } } },
        },
      },
    })
    expect(siteOf(resolved, 'notes')).toStrictEqual({
      key: 'notes',
      locales: ['en'],
      defaultLocale: 'en',
      styleGuide: null,
      url: null,
      cors: { origins: [] },
      events: { webhooks: [], indexNow: null },
      audit: { ipAddresses: 'off', retentionDays: null },
      backups: { enabled: true, retentionDays: 30 },
      access: { autoProvision: null },
      agents: [],
      review: { requireAgents: false },
      media: {
        format: 'webp',
        quality: 85,
        maxWidth: 2400,
        widths: [640, 1280],
        keepOriginals: true,
        maxBytes: 104857600,
      },
      collections: new Map([
        [
          'posts',
          {
            name: 'posts',
            schema,
            routes: { en: '/posts/:slug/' },
            translationGroupField: null,
            tagsField: null,
            sortByField: null,
            automaticFields: {},
            components: new Map(),
            contracts: [],
            maxMarkdownBytes: 524288,
            styleGuide: null,
            navigation: null,
          },
        ],
      ]),
    })
  })

  it('keeps of a component only what the config gives it', () => {
    const props = z.strictObject({})
    const resolved = resolveConfig(
      blogConfig({
        components: {
          badge: { props },
          note: { props, description: 'A note.' },
          quote: { props, example: '::quote' },
        },
      }),
    )
    const components = siteOf(resolved, 'demo').collections.get('blog')?.components
    expect(components?.get('badge')).toStrictEqual({ props })
    expect(components?.get('note')).toStrictEqual({ props, description: 'A note.' })
    expect(components?.get('quote')).toStrictEqual({ props, example: '::quote' })
  })

  it('keeps the order of the config for collections and components, and orders routes by locale', () => {
    const props = z.strictObject({})
    const resolved = resolveConfig({
      sites: {
        demo: siteWith({
          collections: {
            news: collectionWith({
              routes: { en: '/en/news/:slug/', es: '/noticias/:slug/' },
              components: { youtube: { props }, callout: { props } },
            }),
            blog: collectionWith(),
          },
        }),
      },
    })
    const site = siteOf(resolved, 'demo')
    const news = site.collections.get('news')
    expect([...site.collections.keys()]).toEqual(['news', 'blog'])
    expect([...(news?.components.keys() ?? [])]).toEqual(['youtube', 'callout'])
    expect(Object.keys(news?.routes ?? {})).toEqual(['es', 'en'])
  })

  it('accepts collection and component names of up to 63 characters, with hyphens and digits', () => {
    const longest = `a${'b'.repeat(62)}`
    const props = z.strictObject({})
    const resolved = resolveConfig(
      configWith({
        collections: {
          [longest]: collectionWith({ components: { [longest]: { props } } }),
          'a-1': collectionWith({ routes: { es: '/a/:slug/', en: '/en/a/:slug/' } }),
          a1: collectionWith({ routes: { es: '/b/:slug/', en: '/en/b/:slug/' } }),
          'a--b': collectionWith({ routes: { es: '/c/:slug/', en: '/en/c/:slug/' } }),
          'a-': collectionWith({ routes: { es: '/d/:slug/', en: '/en/d/:slug/' } }),
        },
      }),
    )
    const site = siteOf(resolved, 'demo')
    expect([...site.collections.keys()]).toEqual([longest, 'a-1', 'a1', 'a--b', 'a-'])
    expect([...(site.collections.get(longest)?.components.keys() ?? [])]).toEqual([longest])
  })

  it('accepts a site key as the CLI does: digits first, one character, up to 64', () => {
    const keys = ['blog', 'a', '0', '1demo', 'docs-2', 'a-b-c', 'a'.repeat(64), '9'.repeat(64)]
    const resolved = keys.map((key) => [
      ...resolveConfig({ sites: { [key]: siteWith() } }).sites.keys(),
    ])
    expect(resolved).toEqual(keys.map((key) => [key]))
  })

  it('accepts a language, with an optional script and region, as a locale', () => {
    const locales = ['es', 'en', 'pt-BR', 'zh-Hant-TW', 'es-419', 'fil']
    const routes = Object.fromEntries(locales.map((locale) => [locale, `/${locale}/:slug/`]))
    const resolved = resolveConfig(
      configWith({ locales, collections: { blog: collectionWith({ routes }) } }),
    )
    const site = siteOf(resolved, 'demo')
    expect(site.locales).toEqual(['es', 'en', 'pt-BR', 'zh-Hant-TW', 'es-419', 'fil'])
    expect(Object.keys(site.collections.get('blog')?.routes ?? {})).toEqual(site.locales)
  })

  it('accepts a route with :slug inside a segment, and a route that is only :slug', () => {
    const resolved = resolveConfig(
      blogConfig({ routes: { es: '/entradas/p-:slug.html', en: '/:slug' } }),
    )
    expect(siteOf(resolved, 'demo').collections.get('blog')?.routes).toEqual({
      es: '/entradas/p-:slug.html',
      en: '/:slug',
    })
  })

  it('accepts a size of 1 byte and a size of 768 KiB', () => {
    const sizes = [1, 786_432].map((maxMarkdownBytes) => {
      const resolved = resolveConfig(blogConfig({ maxMarkdownBytes }))
      return siteOf(resolved, 'demo').collections.get('blog')?.maxMarkdownBytes
    })
    expect(sizes).toEqual([1, 786432])
  })

  it('accepts fields that are optional, and a schema that is a function', () => {
    const optional = z.object({
      group: z.string().optional(),
      tags: z.array(z.string()).optional(),
      date: z.iso.datetime().optional(),
    })
    const callable = Object.assign(() => 1, schemaOf({ type: 'object', properties: {} }))
    const resolved = resolveConfig(
      configWith({
        collections: {
          blog: collectionWith({
            schema: optional,
            translations: { groupBy: 'group' },
            tags: 'tags',
            sortBy: 'date',
          }),
          docs: collectionWith({
            schema: callable,
            routes: { es: '/docs/:slug/', en: '/en/docs/:slug/' },
          }),
        },
      }),
    )
    const site = siteOf(resolved, 'demo')
    const blog = site.collections.get('blog')
    expect([blog?.translationGroupField, blog?.tagsField, blog?.sortByField]).toEqual([
      'group',
      'tags',
      'date',
    ])
    expect(site.collections.get('docs')?.schema).toBe(callable)
  })

  it('follows the $ref a schema with an id gets: the root, the fields and the props', () => {
    const day = z.iso.date().meta({ id: 'ResolveDay' })
    const label = z.string().meta({ id: 'ResolveLabel' })
    const front = z
      .object({ date: day, tags: z.array(label), group: label })
      .meta({ id: 'ResolveFront' })
    const props = z.strictObject({ type: label }).meta({ id: 'ResolveProps' })
    const resolved = resolveConfig(
      blogConfig({
        schema: front,
        translations: { groupBy: 'group' },
        tags: 'tags',
        sortBy: 'date',
        components: { callout: { props } },
      }),
    )
    const blog = siteOf(resolved, 'demo').collections.get('blog')
    expect([blog?.translationGroupField, blog?.tagsField, blog?.sortByField]).toEqual([
      'group',
      'tags',
      'date',
    ])
    expect(blog?.components.get('callout')?.props).toBe(props)
  })

  it('resolves a deployment of several sites, each with its key', () => {
    const resolved = resolveConfig(configWith())
    const two = resolveConfig({ sites: { alpha: siteWith(), beta: siteWith() } })

    expect([...resolved.sites.keys()]).toHaveLength(1)
    expect([...two.sites.keys()]).toEqual(['alpha', 'beta'])
    expect(siteOf(two, 'beta').key).toBe('beta')
  })

  it('resolves the same config to the same result every time', () => {
    const config = blogConfig({
      translations: { groupBy: 'group' },
      tags: 'tags',
      sortBy: 'date',
      styleGuide: 'Be brief.',
    })
    const first = resolveConfig(config)
    const second = resolveConfig(config)
    expect(second).toEqual(first)
    expect(second).not.toBe(first)
    expect(frontmatter).toBe(siteOf(second, 'demo').collections.get('blog')?.schema)
  })
})
