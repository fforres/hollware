import { describe, expect, it } from 'vite-plus/test'
import * as z from 'zod'

import type { Phase } from '../../src/contracts/index.ts'
import type { DisallowedMarker } from '../../src/markdown/types.ts'
import { collectionOf, markdownOf, run } from './support.ts'

const PHASES: Phase[] = ['write', 'publish']

const withComponents = collectionOf({
  components: {
    youtube: { props: z.strictObject({ id: z.string() }) },
    callout: { props: z.strictObject({ type: z.string() }) },
  },
})
const withoutComponents = collectionOf()

function runMarkers(markers: readonly DisallowedMarker[], collection = withComponents) {
  return run({ collection, markdown: markdownOf({ disallowed: markers }) })
}

function error(
  contract: string,
  message: string,
  fix: string,
  params: Record<string, string>,
  line?: number,
) {
  return {
    contract,
    severity: 'error',
    path: '/body',
    message,
    fix,
    params,
    ...(line ? { line } : {}),
  }
}

const CALLOUT_AND_YOUTUBE = 'callout, youtube'
const MARKDOWN_OR_COMPONENTS = `Remove the HTML and use Markdown or one of the allowed components: ${CALLOUT_AND_YOUTUBE}.`
const ATTRIBUTE_FIX =
  'Links keep href and title, images keep src, alt, title, width and height, and a component takes only the props its schema declares.'
const URL_FIX =
  'Use an https: or http: URL, an asset:ast_… reference that upload_asset gave, a mailto: address, a path of this site that starts with /, or an anchor that starts with #.'

describe('the content-safety contracts', () => {
  it('say nothing about a body without markers', async () => {
    expect((await runMarkers([])).errors).toStrictEqual([])
  })

  const cases: [string, DisallowedMarker, ReturnType<typeof error>[], boolean?][] = [
    [
      'raw HTML, offering the components that exist',
      { kind: 'raw-html', name: 'script', line: 2 },
      [
        error(
          'raw-html',
          'Raw HTML is not allowed: the body has a <script> tag.',
          MARKDOWN_OR_COMPONENTS,
          { tag: 'script', components: CALLOUT_AND_YOUTUBE },
          2,
        ),
      ],
    ],
    [
      'raw HTML in a collection with no components',
      { kind: 'raw-html', name: 'div', line: 6 },
      [
        error(
          'raw-html',
          'Raw HTML is not allowed: the body has a <div> tag.',
          'Remove the HTML and use Markdown.',
          { tag: 'div', components: '' },
          6,
        ),
      ],
      false,
    ],
    [
      'an unknown component, a typo of one that exists',
      { kind: 'unknown-component', name: 'youtub', line: 4 },
      [
        error(
          'unknown-component',
          'The component "youtub" does not exist in this collection.',
          `Use one of the allowed components: ${CALLOUT_AND_YOUTUBE}.`,
          { name: 'youtub', components: CALLOUT_AND_YOUTUBE },
          4,
        ),
      ],
    ],
    [
      'an unknown component in a collection with no components',
      { kind: 'unknown-component', name: 'callout', line: 4 },
      [
        error(
          'unknown-component',
          'The component "callout" does not exist in this collection.',
          'This collection allows no components: remove it and use Markdown.',
          { name: 'callout', components: '' },
          4,
        ),
      ],
      false,
    ],
    [
      'a disallowed attribute',
      { kind: 'disallowed-attribute', name: 'onerror', line: 7 },
      [
        error(
          'disallowed-attribute',
          'The attribute "onerror" is not allowed.',
          `Remove the attribute "onerror". ${ATTRIBUTE_FIX}`,
          { name: 'onerror' },
          7,
        ),
      ],
    ],
    [
      'an unsafe URL',
      { kind: 'unsafe-url', name: 'javascript:alert(1)', line: 8 },
      [
        error(
          'unsafe-url',
          'The URL "javascript:alert(1)" is not allowed.',
          URL_FIX,
          {
            url: 'javascript:alert(1)',
          },
          8,
        ),
      ],
    ],
    [
      'a marker without a line',
      { kind: 'unsafe-url', name: 'data:text/html,x' },
      [
        error('unsafe-url', 'The URL "data:text/html,x" is not allowed.', URL_FIX, {
          url: 'data:text/html,x',
        }),
      ],
    ],
    [
      'a URL that is long, clipped to 80 characters',
      { kind: 'unsafe-url', name: `javascript:${'a'.repeat(300)}`, line: 1 },
      [
        error(
          'unsafe-url',
          `The URL "javascript:${'a'.repeat(69)}…" is not allowed.`,
          URL_FIX,
          { url: `javascript:${'a'.repeat(69)}…` },
          1,
        ),
      ],
    ],
    [
      'a tag name that is long, clipped to 80 characters',
      { kind: 'raw-html', name: 't'.repeat(100), line: 1 },
      [
        error(
          'raw-html',
          `Raw HTML is not allowed: the body has a <${'t'.repeat(80)}…> tag.`,
          MARKDOWN_OR_COMPONENTS,
          { tag: `${'t'.repeat(80)}…`, components: CALLOUT_AND_YOUTUBE },
          1,
        ),
      ],
    ],
  ]

  it.each(cases)('report %s', async (_name, marker, expected, hasComponents = true) => {
    const verdict = await runMarkers([marker], hasComponents ? withComponents : withoutComponents)
    expect(verdict.errors).toStrictEqual(expected)
    expect(verdict.warnings).toStrictEqual([])
    expect(verdict.ok).toBe(false)
  })

  it('report one error for each marker, each contract only the markers of its own kind', async () => {
    const verdict = await runMarkers([
      { kind: 'unsafe-url', name: 'javascript:alert(1)', line: 8 },
      { kind: 'raw-html', name: 'script', line: 2 },
      { kind: 'disallowed-attribute', name: 'onerror', line: 7 },
      { kind: 'unknown-component', name: 'youtub', line: 4 },
      { kind: 'raw-html', name: 'iframe', line: 12 },
    ])
    expect(verdict.errors.map((violation) => [violation.contract, violation.line])).toStrictEqual([
      ['raw-html', 2],
      ['raw-html', 12],
      ['unknown-component', 4],
      ['disallowed-attribute', 7],
      ['unsafe-url', 8],
    ])
    expect(verdict.errors[1]?.message).toBe('Raw HTML is not allowed: the body has a <iframe> tag.')
  })

  it('report the markers of a kind by line, whatever the order the pipeline found them in', async () => {
    const verdict = await runMarkers([
      { kind: 'raw-html', name: 'b', line: 9 },
      { kind: 'raw-html', name: 'i' },
      { kind: 'raw-html', name: 'u', line: 3 },
    ])
    expect(verdict.errors.map((violation) => violation.message)).toStrictEqual([
      'Raw HTML is not allowed: the body has a <i> tag.',
      'Raw HTML is not allowed: the body has a <u> tag.',
      'Raw HTML is not allowed: the body has a <b> tag.',
    ])
  })

  it('offer the components in alphabetical order, not in the order of the config', async () => {
    const reversed = collectionOf({
      components: {
        zebra: { props: z.strictObject({}) },
        apple: { props: z.strictObject({}) },
        mango: { props: z.strictObject({}) },
      },
    })
    const verdict = await runMarkers([{ kind: 'unknown-component', name: 'x', line: 1 }], reversed)
    expect(verdict.errors[0]?.fix).toBe('Use one of the allowed components: apple, mango, zebra.')
  })

  it('apply in both phases', async () => {
    for (const phase of PHASES) {
      const verdict = await run({
        phase,
        collection: withComponents,
        markdown: markdownOf({ disallowed: [{ kind: 'raw-html', name: 'b', line: 1 }] }),
      })
      expect(verdict.errors).toHaveLength(1)
      expect(verdict.phase).toBe(phase)
    }
  })
})
