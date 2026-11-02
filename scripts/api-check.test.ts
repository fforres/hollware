import { describe, expect, it } from 'vite-plus/test'

import {
  acceptedBreaks,
  asksForMajor,
  inPreMode,
  majorsSince,
  promisedTag,
  verdictOf,
} from './api-check.ts'

describe('the release that holds the promise of the public API', () => {
  it('is none before 1.0.0-rc.0, whatever 0.x says', () => {
    expect(promisedTag(['@hollware/core@0.10.0', '@hollware/core@0.11.0', 'hollware@1.0.0'])).toBe(
      null,
    )
  })

  it('is the newest candidate, by number, before 1.0.0', () => {
    expect(
      promisedTag([
        '@hollware/core@0.11.0',
        '@hollware/core@1.0.0-rc.2',
        '@hollware/core@1.0.0-rc.10',
        '@hollware/core@1.0.0-rc.9',
      ]),
    ).toBe('@hollware/core@1.0.0-rc.10')
  })

  it('is the release over its candidates, and the newest minor after it', () => {
    expect(promisedTag(['@hollware/core@1.0.0-rc.3', '@hollware/core@1.0.0'])).toBe(
      '@hollware/core@1.0.0',
    )
    expect(
      promisedTag(['@hollware/core@1.0.0', '@hollware/core@1.2.0', '@hollware/core@1.10.1']),
    ).toBe('@hollware/core@1.10.1')
  })
})

describe('a break of the public API carried by a major version', () => {
  const major = "---\n'@hollware/server': major\n'@hollware/nuxt': major\n---\n\nThe beacon goes.\n"
  const minor = "---\n'@hollware/admin': minor\n---\n\nA new section.\n"

  it('reads the bump of each package in the front matter, and only there', () => {
    expect(asksForMajor(major)).toBe(true)
    expect(asksForMajor('---\n"hollware": major\n---\n')).toBe(true)
    expect(asksForMajor(minor)).toBe(false)
    expect(asksForMajor("---\n'@hollware/core': patch\n---\n\nNot a major version: major\n")).toBe(
      false,
    )
  })

  it('counts a major changeset made since the release, pending or moved to pre/ by a version commit', () => {
    const changesets = [
      { name: 'beacon.md', text: major },
      { name: 'admin.md', text: minor },
      { name: 'old-major.md', text: major },
    ]
    expect(majorsSince(changesets, new Set(['old-major.md']))).toEqual(['beacon.md'])
    expect(majorsSince(changesets, new Set(['beacon.md', 'old-major.md']))).toEqual([])
  })
})

describe('what the check answers to a change of the public API', () => {
  it('lets through what breaks nothing, in pre mode or not', () => {
    expect([verdictOf([], [], false), verdictOf([], [], true)]).toEqual(['fits', 'fits'])
  })

  it('takes a break with a major changeset, and refuses one without it', () => {
    expect(verdictOf(['exports a: is gone'], ['beacon.md'], false)).toBe('carried')
    expect(verdictOf(['exports a: is gone'], [], false)).toBe('refused')
  })

  it('refuses every break of a release candidate, whatever its changesets say', () => {
    expect(verdictOf(['exports a: is gone'], ['beacon.md'], true)).toBe('frozen')
    expect(verdictOf(['exports a: is gone'], [], true)).toBe('frozen')
  })

  it('reads pre mode from .changeset/pre.json, and nothing else', () => {
    expect([
      inPreMode('{ "mode": "pre", "tag": "rc" }'),
      inPreMode('{ "mode": "exit", "tag": "rc" }'),
      inPreMode(null),
      inPreMode('not json'),
    ]).toEqual([true, false, false, false])
  })
})

describe('a break the maintainer accepted for one minor version', () => {
  const accepted = JSON.stringify({
    against: '@hollware/core@1.4.0',
    reason: 'Only the maintainer runs Hollware.',
    breaks: ['mcp delete_site: now asks for site:owner'],
  })

  it('is each line it lists, against the release it names, with a reason', () => {
    expect([...acceptedBreaks(accepted, '@hollware/core@1.4.0')]).toEqual([
      'mcp delete_site: now asks for site:owner',
    ])
  })

  it('is nothing against another release, without a reason, or from a file that is no JSON', () => {
    const unreasoned = JSON.stringify({ ...JSON.parse(accepted), reason: ' ' })
    expect(
      [
        acceptedBreaks(accepted, '@hollware/core@1.5.0'),
        acceptedBreaks(unreasoned, '@hollware/core@1.4.0'),
        acceptedBreaks('{', '@hollware/core@1.4.0'),
        acceptedBreaks(null, '@hollware/core@1.4.0'),
      ].map((set) => set.size),
    ).toEqual([0, 0, 0, 0])
  })
})
