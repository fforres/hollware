import type { ResolvedMedia } from '../config/types.ts'

export const IMAGE_FORMATS = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
  'image/svg+xml',
] as const
export type ImageFormat = (typeof IMAGE_FORMATS)[number]

/** Kept as they arrive: Cloudflare Images never sees them, so they have no size limit of its own. */
export const FILE_FORMATS = ['video/mp4', 'video/webm', 'application/pdf'] as const
export type FileFormat = (typeof FILE_FORMATS)[number]

export const ASSET_FORMATS = [...IMAGE_FORMATS, ...FILE_FORMATS] as const
export type AssetFormat = (typeof ASSET_FORMATS)[number]

/** The largest image Hollware takes, in bytes: the binding takes 20 MB, this keeps room. */
export const MAX_ASSET_BYTES = 10 * 1024 * 1024

/** The largest file a site takes when its media setting names no `maxBytes`: 100 MB. */
export const DEFAULT_MAX_FILE_BYTES = 100 * 1024 * 1024

/** The largest `maxBytes` a site may set: the largest object R2 writes in one put. */
export const MAX_FILE_BYTES = 5_000_000_000

/** The extension a format is served and exported with. */
export const EXTENSIONS: Readonly<Record<AssetFormat, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'application/pdf': 'pdf',
}

export const isImageFormat = (format: string): format is ImageFormat =>
  IMAGE_FORMATS.some((candidate) => candidate === format)

const startsWith = (bytes: Uint8Array, at: number, expected: readonly number[]) =>
  expected.every((byte, index) => bytes[at + index] === byte)
const ascii = (text: string) => Array.from({ length: text.length }, (_, at) => text.charCodeAt(at))

/**
 * The format of a file, read from its bytes and never from its name or a header: `null` for
 * anything else. An SVG is text that opens on `<svg` or on an XML declaration followed by one.
 */
export function sniffImage(bytes: Uint8Array): ImageFormat | null {
  if (startsWith(bytes, 0, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (startsWith(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (startsWith(bytes, 0, ascii('RIFF')) && startsWith(bytes, 8, ascii('WEBP'))) {
    return 'image/webp'
  }
  if (startsWith(bytes, 4, ascii('ftyp')) && /^avi[fs]$/.test(text(bytes.subarray(8, 12)))) {
    return 'image/avif'
  }
  if (startsWith(bytes, 0, ascii('GIF87a')) || startsWith(bytes, 0, ascii('GIF89a'))) {
    return 'image/gif'
  }
  const head = text(bytes.subarray(0, 512)).replace(BOM, '').trimStart()
  return opensOnSvg(head) ? 'image/svg+xml' : null
}

const MP4_BRANDS = /^(?:isom|iso[2-9]|mp4[12]|avc1|M4V |M4VP|dash|mmp4|f4v )$/

/**
 * The format of a file Hollware keeps as it came, read from its bytes: an MP4 by the brand of
 * its `ftyp` box, a WebM by the doctype of its EBML header, a PDF by its `%PDF-` header.
 */
export function sniffFile(bytes: Uint8Array): FileFormat | null {
  if (startsWith(bytes, 4, ascii('ftyp')) && MP4_BRANDS.test(text(bytes.subarray(8, 12)))) {
    return 'video/mp4'
  }
  if (startsWith(bytes, 0, [0x1a, 0x45, 0xdf, 0xa3])) {
    return text(bytes.subarray(4, 64)).includes('webm') ? 'video/webm' : null
  }
  return startsWith(bytes, 0, ascii('%PDF-')) ? 'application/pdf' : null
}

/** What a file is, image or not, read from its bytes: `null` for anything Hollware does not take. */
export const sniffAsset = (bytes: Uint8Array): AssetFormat | null =>
  sniffImage(bytes) ?? sniffFile(bytes)

function opensOnSvg(head: string): boolean {
  if (/^<svg[\s>/]/i.test(head)) return true
  if (!/^<\?xml/i.test(head)) return false
  const declarationEnd = head.indexOf('?>')
  if (declarationEnd < 0 || head.slice(0, declarationEnd).includes('>')) return false
  let rest = head.slice(declarationEnd + 2).trimStart()
  while (rest.startsWith('<!--')) {
    const commentEnd = rest.indexOf('-->', 4)
    if (commentEnd < 0) return false
    rest = rest.slice(commentEnd + 3).trimStart()
  }
  return /^<svg[\s>/]/i.test(rest)
}

const BOM = new RegExp(`^${String.fromCodePoint(0xfeff)}`)

function text(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
}

/** Why an SVG is refused, and what to do: an SVG is taken only when nothing in it can run. */
export interface SvgProblem {
  readonly reason: string
  readonly fix: string
}

const SVG_FIX =
  'Export the SVG again without scripts, embedded HTML, event handlers or external references (any SVG optimizer does it), or upload it as PNG.'

const SVG_REFUSALS: readonly { readonly pattern: RegExp; readonly reason: string }[] = [
  { pattern: /<!DOCTYPE|<!ENTITY/i, reason: 'it declares a DOCTYPE or an entity' },
  {
    pattern: /&(?!(?:amp|lt|gt|quot|apos);)/i,
    reason: 'it holds a character reference (&#…;) or an entity other than the five of XML',
  },
  { pattern: /\\/, reason: 'it holds a backslash, which CSS reads as an escape' },
  {
    pattern: /attributeName\s*=\s*["']?\s*(?:xlink:)?href/i,
    reason: 'it animates a link (<set> or <animate> of href)',
  },
  { pattern: /<script[\s>/]/i, reason: 'it holds a <script>' },
  { pattern: /<foreignObject[\s>/]/i, reason: 'it holds a <foreignObject>, which embeds HTML' },
  { pattern: /<(?:iframe|embed|object|audio|video)[\s>/]/i, reason: 'it embeds another document' },
  { pattern: /\son[a-z]+\s*=/i, reason: 'it has an event handler (an on… attribute)' },
  { pattern: /\bjavascript\s*:|\bdata\s*:/i, reason: 'it holds a javascript: or data: URL' },
  {
    pattern: /(?:xlink:)?href\s*=\s*["']?\s*(?!#)[^"'\s>]/i,
    reason: 'it links outside the file (an href that does not start with #)',
  },
  {
    pattern: /@import|url\(\s*["']?\s*(?!["'\s#])/i,
    reason: 'its styles load something from outside',
  },
]

/** `null` when an SVG holds nothing that can run or reach out, else the first thing that can. */
export function checkSvg(source: string): SvgProblem | null {
  for (const { pattern, reason } of SVG_REFUSALS) {
    if (pattern.test(source)) return { reason, fix: SVG_FIX }
  }
  return null
}

/** What the binding is asked for, or `null` to keep the file as it came. */
export interface Conversion {
  readonly format: 'image/webp' | 'image/avif'
  /**
   * Always given: the binding's default is lossless, not 85. 100 for PNG, which holds
   * screenshots, diagrams and logos: lossless keeps their edges.
   */
  readonly quality: number
  /** Always given: without it the binding keeps one frame of an animation. */
  readonly anim: boolean
  /** The width to scale down to, when the image is wider than the site allows. */
  readonly width?: number
}

/**
 * What a file of `format`, `width` pixels wide (null for an SVG), becomes under `media`: JPEG,
 * PNG and GIF become the site's format; a WebP or an AVIF keeps its own and is only scaled down
 * when it is wider than the site allows; `original` and SVG keep every file as it came.
 */
export function conversionOf(
  format: ImageFormat,
  width: number | null,
  media: ResolvedMedia,
): Conversion | null {
  if (format === 'image/svg+xml' || media.format === 'original') return null
  const tooWide = width !== null && width > media.maxWidth
  const modern = format === 'image/webp' || format === 'image/avif'
  if (modern && !tooWide) return null
  const target = modern ? format : media.format === 'avif' ? 'image/avif' : 'image/webp'
  return {
    format: target,
    quality: format === 'image/png' ? 100 : media.quality,
    anim: true,
    ...(tooWide ? { width: media.maxWidth } : {}),
  }
}

/**
 * The widths of the narrower copies an image gets when it is uploaded, for `srcset`: the site's
 * `widths` narrower than the file served. None for an SVG, which scales by itself, none when the
 * site keeps files as they came, and none for a file that is not WebP or AVIF, which is what the
 * copies are made as.
 */
export function variantWidthsOf(
  format: string,
  width: number | null,
  media: ResolvedMedia,
): number[] {
  if (width === null || media.format === 'original') return []
  if (format !== 'image/webp' && format !== 'image/avif') return []
  return media.widths.filter((candidate) => candidate < width)
}

/** What the binding is asked for to make the copy `width` pixels wide of a file served as `format`. */
export function variantConversion(
  format: 'image/webp' | 'image/avif',
  originalFormat: ImageFormat,
  width: number,
  media: ResolvedMedia,
): Conversion {
  return {
    format,
    quality: originalFormat === 'image/png' ? 100 : media.quality,
    anim: true,
    width,
  }
}

/** What a reader needs of an image to lay it out and pick its copy. */
export interface ImageSizes {
  /** In pixels; `null` for an SVG. */
  readonly width: number | null
  readonly height: number | null
  /** The widths of its narrower copies, smallest first: each is served at `<url>/<width>`. */
  readonly widths: readonly number[]
  /** What it shows, for an `img` whose author gave no alt of its own. */
  readonly alt?: string
}

/** The `srcset` of an image served at `url`: its copies and itself, or `null` when it has no copy. */
export function srcsetOf(url: string, image: ImageSizes): string | null {
  if (image.width === null || image.widths.length === 0) return null
  return [
    ...image.widths.map((width) => `${url}/${width} ${width}w`),
    `${url} ${image.width}w`,
  ].join(', ')
}

export const sizesOf = (width: number) => `(min-width: ${width}px) ${width}px, 100vw`

/**
 * The id of an asset: `ast_` and 26 hex of the SHA-256 of its site's key and the SHA-256 of its
 * original bytes. The same file is the same asset in a site, and another one in another site:
 * ids are unique in a deployment, which serves several sites. Assets uploaded by 1.0.0-rc.2 and
 * before keep the id they got from the bytes alone.
 */
export async function assetIdOf(site: string, sha256Hex: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${site}:${sha256Hex}`),
  )
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `ast_${hex.slice(0, 26)}`
}

export const ASSET_SCHEME = 'asset:'
const ASSET_REFERENCE = /^asset:(ast_[0-9a-f]{26})$/

export function assetIdIn(value: string): string | null {
  return ASSET_REFERENCE.exec(value.trim())?.[1] ?? null
}

/** The ids of the assets a value (a frontmatter, a document) names, each once, in order. */
export function assetIdsIn(value: unknown): string[] {
  const ids = new Set<string>()
  const visit = (node: unknown, depth: number): void => {
    if (depth > 200) return
    if (typeof node === 'string') {
      const id = assetIdIn(node)
      if (id !== null) ids.add(id)
    } else if (Array.isArray(node)) {
      for (const child of node) visit(child, depth + 1)
    } else if (typeof node === 'object' && node !== null) {
      for (const child of Object.values(node)) visit(child, depth + 1)
    }
  }
  visit(value, 0)
  return [...ids]
}

function imageProps(
  props: Readonly<Record<string, unknown>>,
  url: string,
  image: ImageSizes | undefined,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = { ...props, src: url }
  const own = props['alt']
  if (image?.alt !== undefined && (typeof own !== 'string' || own.trim() === '')) {
    resolved['alt'] = image.alt
  }
  if (image === undefined || image.width === null) return resolved
  const srcset = srcsetOf(url, image)
  if (srcset !== null) {
    resolved['srcset'] = srcset
    resolved['sizes'] = sizesOf(image.width)
  }
  if (props['width'] === undefined && props['height'] === undefined && image.height !== null) {
    resolved['width'] = String(image.width)
    resolved['height'] = String(image.height)
  }
  return resolved
}

/**
 * A copy of a value (a frontmatter, a document) with every string that is an `asset:` reference
 * replaced by the URL `urlOf` gives its id. With `imageOf`, an `img` element of a document whose
 * `src` is a reference also gets its size, `srcset` and `sizes` (`imageProps`). Everything else is
 * copied as it is.
 */
export function resolveAssetReferences<T>(
  value: T,
  urlOf: (id: string) => string,
  imageOf?: (id: string) => ImageSizes | undefined,
): T {
  const visit = (node: unknown): unknown => {
    if (typeof node === 'string') {
      const id = assetIdIn(node)
      return id === null ? node : urlOf(id)
    }
    if (Array.isArray(node)) {
      const props: unknown = node[1]
      if (
        imageOf !== undefined &&
        node[0] === 'img' &&
        typeof props === 'object' &&
        props !== null &&
        !Array.isArray(props)
      ) {
        const src: unknown = Reflect.get(props, 'src')
        const id = typeof src === 'string' ? assetIdIn(src) : null
        if (id !== null) {
          const resolved = visit(props)
          return [
            'img',
            imageProps(resolved as Record<string, unknown>, urlOf(id), imageOf(id)),
            ...node.slice(2).map(visit),
          ]
        }
      }
      return node.map(visit)
    }
    if (typeof node === 'object' && node !== null) {
      const copy: Record<string, unknown> = {}
      for (const [key, child] of Object.entries(node)) {
        Object.defineProperty(copy, key, {
          value: visit(child),
          enumerable: true,
          writable: true,
          configurable: true,
        })
      }
      return copy
    }
    return node
  }
  return visit(value) as T
}
