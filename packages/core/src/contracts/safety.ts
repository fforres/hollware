import type { ResolvedCollection } from '../config/types.ts'
import type { DisallowedMarker } from '../markdown/types.ts'
import { registerBuiltIn } from './registry.ts'
import { runtimeOf } from './runtime.ts'
import { clip, quote } from './text.ts'
import type { Contract } from './types.ts'

interface Wording {
  readonly message: string
  readonly fix: string
  readonly params: Readonly<Record<string, string>>
}

function allowedComponents(collection: ResolvedCollection): string[] {
  return [...collection.components.keys()].toSorted()
}

function markerContract(
  kind: DisallowedMarker['kind'],
  description: string,
  wording: (marker: DisallowedMarker, collection: ResolvedCollection) => Wording,
): Contract<unknown> {
  return registerBuiltIn(
    {
      id: kind,
      severity: 'error',
      description,
      check(context) {
        const { collection } = runtimeOf(kind, context)
        return context.markdown.extracted.disallowed
          .filter((marker) => marker.kind === kind)
          .map((marker) => ({
            path: '/body',
            ...wording(marker, collection),
            line: marker.line,
          }))
      },
    },
    { readsFrontmatter: false },
  )
}

export const RAW_HTML = markerContract(
  'raw-html',
  'The body holds Markdown and the components of the collection, never raw HTML.',
  (marker, collection) => {
    const components = allowedComponents(collection)
    return {
      message: `Raw HTML is not allowed: the body has a <${clip(marker.name)}> tag.`,
      params: { tag: clip(marker.name), components: components.join(', ') },
      fix: `Remove the HTML and use Markdown${components.length === 0 ? '' : ` or one of the allowed components: ${components.join(', ')}`}.`,
    }
  },
)

export const UNKNOWN_COMPONENT = markerContract(
  'unknown-component',
  'The body uses only the components that the collection declares.',
  (marker, collection) => {
    const components = allowedComponents(collection)
    return {
      message: `The component ${quote(marker.name)} does not exist in this collection.`,
      params: { name: clip(marker.name), components: components.join(', ') },
      fix:
        components.length === 0
          ? 'This collection allows no components: remove it and use Markdown.'
          : `Use one of the allowed components: ${components.join(', ')}.`,
    }
  },
)

export const DISALLOWED_ATTRIBUTE = markerContract(
  'disallowed-attribute',
  'Links, images and code carry only the attributes Markdown produces, and a component only the props its schema declares.',
  (marker) => ({
    message: `The attribute ${quote(marker.name)} is not allowed.`,
    params: { name: clip(marker.name) },
    fix: `Remove the attribute ${quote(marker.name)}. Links keep href and title, images keep src, alt, title, width and height, and a component takes only the props its schema declares.`,
  }),
)

export const UNSAFE_URL = markerContract(
  'unsafe-url',
  'Links and images use an https: or http: URL, an asset: reference, a path of the site or an anchor; links may also use mailto:.',
  (marker) => ({
    message: `The URL ${quote(marker.name)} is not allowed.`,
    params: { url: clip(marker.name) },
    fix: 'Use an https: or http: URL, an asset:ast_… reference that upload_asset gave, a mailto: address, a path of this site that starts with /, or an anchor that starts with #.',
  }),
)
