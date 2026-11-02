import { describe, expect, it } from 'vite-plus/test'

import { settingsGroups } from '../app/lib/settings.ts'

const OWNER = ['content:read', 'schema:admin', 'site:owner']

const keys = (scopes: readonly string[]) =>
  settingsGroups(scopes).map((group) => [group.key, group.sections.map((section) => section.key)])

describe('the navigation of the settings', () => {
  it('groups the site, who reaches it, and you, in the order of the sidebar', () => {
    expect(keys(OWNER)).toEqual([
      [
        'site',
        [
          'general',
          'collections',
          'images',
          'webhooks',
          'agents',
          'analytics',
          'backups',
          'redirects',
          'danger',
        ],
      ],
      ['access', ['people', 'signin', 'tokens', 'activity']],
      ['you', ['account']],
    ])
  })

  it('shows the agents, the activity log and the sign-in policy to whoever runs the site, and the backups and the danger zone to an owner only', () => {
    expect(keys(['content:read', 'schema:admin'])).toEqual([
      [
        'site',
        ['general', 'collections', 'images', 'webhooks', 'agents', 'analytics', 'redirects'],
      ],
      ['access', ['people', 'signin', 'tokens', 'activity']],
      ['you', ['account']],
    ])
    expect(keys(['content:read', 'content:publish'])).toEqual([
      ['site', ['general', 'collections', 'images', 'webhooks', 'analytics', 'redirects']],
      ['access', ['people', 'tokens']],
      ['you', ['account']],
    ])
  })

  it('gives each part of the site a page of its own, and matches General alone exactly', () => {
    const site = settingsGroups(OWNER)[0]?.sections ?? []
    expect(site.map(({ to, exact }) => [to, exact])).toEqual([
      ['/settings/site', true],
      ['/settings/collections', false],
      ['/settings/site/images', false],
      ['/settings/site/webhooks', false],
      ['/settings/site/agents', false],
      ['/settings/site/analytics', false],
      ['/settings/site/backups', false],
      ['/settings/site/redirects', false],
      ['/settings/site/danger', false],
    ])
  })
})
