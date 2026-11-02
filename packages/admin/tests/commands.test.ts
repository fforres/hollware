import { describe, expect, it } from 'vite-plus/test'

import { en } from '../app/i18n/en.ts'
import { es } from '../app/i18n/es.ts'
import { commandGroups, type CommandInput, type EntryCommands } from '../app/lib/commands.ts'

const entry = (slug: string, title?: string, collection = 'blog') => ({
  collection,
  locale: 'en',
  slug,
  frontmatter: title === undefined ? {} : { title },
})

const base: CommandInput = {
  query: '',
  site: 'blog',
  role: 'owner',
  scopes: ['content:read', 'content:write', 'content:publish', 'schema:admin', 'site:owner'],
  sites: [
    { site: 'blog', role: 'owner' },
    { site: 'docs', role: 'editor' },
  ],
  collections: ['blog'],
  entry: null,
  found: [],
  drafts: [],
  waiting: [],
  switchSite: () => {},
}

const calls: string[] = []
const open = (over: Partial<EntryCommands> = {}): EntryCommands => ({
  status: 'draft',
  canPublish: true,
  source: false,
  lossy: false,
  canPreview: true,
  publish: () => calls.push('publish'),
  schedule: () => calls.push('schedule'),
  toggleSource: () => calls.push('source'),
  preview: () => calls.push('preview'),
  ...over,
})

const ids = (input: CommandInput) => commandGroups(input, en).map((group) => group.id)
const group = (input: CommandInput, id: string, m = en) =>
  commandGroups(input, m).find((one) => one.id === id)
const labels = (input: CommandInput, id: string, m = en) =>
  group(input, id, m)?.items.map((item) => item.label)

describe('the commands of ⌘K', () => {
  it('lead with the open entry, then go and create, and switch to another site', () => {
    expect(ids(base)).toEqual(['go', 'create', 'sites'])
    expect(ids({ ...base, entry: open() })).toEqual(['entry', 'go', 'create', 'sites'])
  })

  it('act on the open draft: publish, schedule, its Markdown and a preview, each calling it', () => {
    calls.length = 0
    const items = group({ ...base, entry: open() }, 'entry')?.items ?? []
    expect(items.map((item) => [item.label, item.icon])).toEqual([
      ['Publish', 'i-lucide-send'],
      ['Schedule', 'i-lucide-calendar-clock'],
      ['View Markdown', 'i-lucide-code'],
      ['Preview on the site', 'i-lucide-eye'],
    ])
    for (const item of items) item.onSelect?.()
    expect(calls).toEqual(['publish', 'schedule', 'source', 'preview'])
  })

  it('leave out what the open entry cannot do', () => {
    expect(
      labels(
        {
          ...base,
          entry: open({ status: 'published', canPublish: false, source: true, canPreview: false }),
        },
        'entry',
      ),
    ).toEqual(['Edit visually'])
    expect(labels({ ...base, entry: open({ status: 'scheduled', lossy: true }) }, 'entry')).toEqual(
      ['Publish', 'Preview on the site'],
    )
  })

  it('find published entries and the drafts whose title or slug holds two letters or more', () => {
    const drafts = [entry('hello-world', 'Hello world'), entry('notes'), entry('other', 'Other')]
    expect(labels({ ...base, query: 'h', drafts }, 'drafts')).toBeUndefined()
    expect(labels({ ...base, query: 'NOT', drafts }, 'drafts')).toEqual(['notes'])
    expect(group({ ...base, query: 'hello', drafts }, 'drafts')?.items[0]).toEqual({
      label: 'Hello world',
      suffix: 'blog · en',
      icon: 'i-lucide-file-pen-line',
      to: '/entries/blog/en/hello-world',
    })
    const found = [{ entry: entry('kept', 'Kept'), snippet: 'a [kept] word' }]
    expect(group({ ...base, found }, 'published')?.items[0]).toEqual({
      label: 'Kept',
      suffix: 'blog · en',
      description: 'a kept word',
      icon: 'i-lucide-file-text',
      to: '/entries/blog/en/kept',
    })
  })

  it('show at most eight drafts', () => {
    const drafts = Array.from({ length: 10 }, (_, index) => entry(`post-${index}`))
    expect(labels({ ...base, query: 'post', drafts }, 'drafts')).toHaveLength(8)
  })

  it('go to every page, each collection, and each part of the settings that the role sees', () => {
    const go = group(base, 'go')?.items.map((item) => [item.label, item.to])
    expect(go).toEqual([
      ['Home', '/'],
      ['Reviews', '/reviews'],
      ['Entries', '/entries'],
      ['Images', '/images'],
      ['Entries of blog', '/entries?collection=blog'],
      ['Settings: General', '/settings/site'],
      ['Settings: Collections', '/settings/collections'],
      ['Settings: Images', '/settings/site/images'],
      ['Settings: Webhooks', '/settings/site/webhooks'],
      ['Settings: Agents', '/settings/site/agents'],
      ['Settings: Analytics', '/settings/site/analytics'],
      ['Settings: Backups', '/settings/site/backups'],
      ['Settings: Redirects', '/settings/site/redirects'],
      ['Settings: Danger zone', '/settings/site/danger'],
      ['Settings: People', '/settings/people'],
      ['Settings: Sign-in', '/settings/site/signin'],
      ['Settings: Tokens', '/settings/tokens'],
      ['Settings: Activity', '/settings/activity'],
      ['Settings: Account', '/settings/account'],
      ['Collection blog', '/settings/collections/blog'],
    ])
    const admin = labels({ ...base, scopes: ['content:read', 'schema:admin'] }, 'go') ?? []
    const editor = labels({ ...base, scopes: ['content:read', 'content:publish'] }, 'go') ?? []
    expect([admin.includes('Settings: Danger zone'), admin.includes('Settings: Activity')]).toEqual(
      [false, true],
    )
    expect([editor.includes('Settings: Agents'), editor.includes('Settings: Backups')]).toEqual([
      false,
      false,
    ])
  })

  it('create an entry, a collection, a site, an invitation and a token', () => {
    expect(group(base, 'create')?.items.map((item) => [item.label, item.to])).toEqual([
      ['New entry', '/entries/new'],
      ['New collection', '/settings/collections'],
      ['New site', '/settings/site#sites'],
      ['Invite someone', '/settings/people'],
      ['New token', '/settings/tokens'],
    ])
  })

  it('switch to every other site, with the role there', () => {
    const switched: string[] = []
    const sites = group({ ...base, switchSite: (site) => switched.push(site) }, 'sites')
    expect(sites?.items.map((item) => [item.label, item.suffix])).toEqual([['docs', 'editor']])
    sites?.items[0]?.onSelect?.()
    expect(switched).toEqual(['docs'])
  })

  it('list the reviews that wait, by who asked', () => {
    const waiting = [{ entry: entry('a', 'A'), requestedBy: 'u1', requestedByName: 'Ana' }]
    expect(group({ ...base, waiting }, 'reviews')?.items).toEqual([
      { label: 'A', suffix: 'asked by Ana', icon: 'i-lucide-inbox', to: '/reviews' },
    ])
  })

  it('speak the language of the admin', () => {
    expect(labels({ ...base, entry: open() }, 'entry', es)).toEqual([
      'Publicar',
      'Programar',
      'Ver Markdown',
      'Vista previa en el sitio',
    ])
    expect(labels(base, 'go', es)).toContain('Configuración: Zona de peligro')
    expect(group(base, 'sites', es)?.label).toBe('Cambiar de sitio')
  })
})
