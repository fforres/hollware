import { describe, expect, it } from 'vite-plus/test'

import { admitsEmail, emailAddress } from '../../src/config/access.ts'
import { resolveConfig } from '../../src/config/resolve.ts'
import { compileSites } from '../../src/structure/compile.ts'
import { configWith, problemsOf, siteOf } from './support.ts'

const ACCESS = {
  autoProvision: { domains: ['acme.com'], emails: ['ada@else.org'], role: 'author' },
} as const

describe('access of a site', () => {
  it('lets nobody in without an invitation by default', () => {
    expect(siteOf(resolveConfig(configWith()), 'demo').access).toEqual({ autoProvision: null })
  })

  it('keeps the domains and addresses in lowercase, each once, and author as the role by default', () => {
    const site = siteOf(
      resolveConfig(
        configWith({
          access: {
            autoProvision: { domains: ['ACME.com', 'acme.com'], emails: [' Ada@Else.org '] },
          },
        }),
      ),
      'demo',
    )
    expect(site.access).toEqual({
      autoProvision: { domains: ['acme.com'], emails: ['ada@else.org'], role: 'author' },
    })
  })

  it('admits an address by itself or by its domain, never a subdomain or a lookalike', () => {
    expect(admitsEmail(ACCESS, 'grace@acme.com')).toBe(true)
    expect(admitsEmail(ACCESS, 'ADA@else.org')).toBe(true)
    expect(admitsEmail(ACCESS, 'bob@else.org')).toBe(false)
    expect(admitsEmail(ACCESS, 'grace@eu.acme.com')).toBe(false)
    expect(admitsEmail(ACCESS, 'grace@notacme.com')).toBe(false)
    expect(admitsEmail(ACCESS, 'grace@acme.com@evil.com')).toBe(false)
    expect(admitsEmail({ autoProvision: null }, 'grace@acme.com')).toBe(false)
  })

  it('reads an address only when it is one', () => {
    expect(emailAddress(' Ada@Example.COM ')).toBe('ada@example.com')
    expect(emailAddress('ada')).toBe(null)
    expect(emailAddress('@example.com')).toBe(null)
    expect(emailAddress('ada@localhost')).toBe(null)
    expect(emailAddress('a da@example.com')).toBe(null)
  })

  it('compiles the access of a definition read from D1', () => {
    const resolved = compileSites({
      demo: {
        locales: ['en'],
        defaultLocale: 'en',
        collections: {
          pages: { schema: { type: 'object' }, routes: { en: '/:slug/' } },
        },
        access: { autoProvision: { domains: ['acme.com'], role: 'editor' } },
      },
    })
    expect(siteOf(resolved, 'demo').access).toEqual({
      autoProvision: { domains: ['acme.com'], emails: [], role: 'editor' },
    })
  })

  it('lets in reviewers, who read and comment', () => {
    const resolved = compileSites({
      demo: {
        locales: ['en'],
        defaultLocale: 'en',
        collections: {
          pages: { schema: { type: 'object' }, routes: { en: '/:slug/' } },
        },
        access: { autoProvision: { emails: ['ada@acme.com'], role: 'reviewer' } },
      },
    })
    expect(siteOf(resolved, 'demo').access).toEqual({
      autoProvision: { domains: [], emails: ['ada@acme.com'], role: 'reviewer' },
    })
  })
})

const ACCESS_FIX =
  'Declare it as { autoProvision: { domains: ["example.com"], emails: [], role: "author" } }, or { autoProvision: null }.'

describe('problems of the access of a site', () => {
  const cases = [
    {
      name: 'a domain that is not one',
      access: { autoProvision: { domains: ['@acme.com'] } },
      problems: [
        {
          path: 'sites.demo.access.autoProvision.domains[0]',
          message: '"@acme.com" is not a domain',
          fix: 'Write each domain as it follows the @ of an address, such as "example.com".',
        },
        {
          path: 'sites.demo.access.autoProvision',
          message: 'lets nobody in: it lists no domain and no address',
          fix: 'List the domains or the addresses to let in, or set autoProvision to null.',
        },
      ],
    },
    {
      name: 'an address that is not one',
      access: { autoProvision: { domains: ['acme.com'], emails: ['ada'] } },
      problems: [
        {
          path: 'sites.demo.access.autoProvision.emails[0]',
          message: '"ada" is not an email address',
          fix: 'Write each address in full, such as "ada@example.com".',
        },
      ],
    },
    {
      name: 'the role of owner',
      access: { autoProvision: { domains: ['acme.com'], role: 'owner' } },
      problems: [
        {
          path: 'sites.demo.access.autoProvision.role',
          message: 'is "owner"; it must be "reviewer", "author" or "editor"',
          fix: 'An owner or an admin is only ever made by a person: use "reviewer", "author" or "editor".',
        },
      ],
    },
    {
      name: 'the role of admin',
      access: { autoProvision: { domains: ['acme.com'], role: 'admin' } },
      problems: [
        {
          path: 'sites.demo.access.autoProvision.role',
          message: 'is "admin"; it must be "reviewer", "author" or "editor"',
          fix: 'An owner or an admin is only ever made by a person: use "reviewer", "author" or "editor".',
        },
      ],
    },
    {
      name: 'an access that is not an object',
      access: 'everyone',
      problems: [
        {
          path: 'sites.demo.access',
          message: 'is "everyone"; it must be an object',
          fix: ACCESS_FIX,
        },
      ],
    },
  ]
  for (const { name, access, problems } of cases) {
    it(`refuses ${name}`, () => {
      expect(problemsOf(configWith({ access }))).toEqual(problems)
    })
  }
})
