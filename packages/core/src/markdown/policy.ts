export const MARKER_TAG = 'hollware-marker'

export const RAW_HTML_PREFIX = 'hollware-raw:'

export const LEFT_OUT_TAG = 'hollware-left-out:'

export const PROPS_KEY = /^\$p(\d+)$/

export const LINE_KEY = '$line'

export const OPEN_KEY = '$open'

export const MAX_DEPTH = 100

export const MAX_ELEMENT_DEPTH = 49

export const NATIVE_TAGS: ReadonlySet<string> = new Set([
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'a',
  'img',
  'ul',
  'ol',
  'li',
  'pre',
  'code',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'blockquote',
  'hr',
  'br',
  'strong',
  'em',
  'del',
  'span',
  'input',
  'template',
])

export const INLINE_TAGS: ReadonlySet<string> = new Set([
  'a',
  'img',
  'code',
  'strong',
  'em',
  'del',
  'span',
  'input',
])

export const ALERT_TYPES: readonly string[] = ['note', 'tip', 'important', 'warning', 'caution']

type ValueRule = (value: unknown) => boolean

const text: ValueRule = (value) => typeof value === 'string'
const exactly =
  (...allowed: readonly string[]): ValueRule =>
  (value) =>
    typeof value === 'string' && allowed.includes(value)
const matching =
  (pattern: RegExp): ValueRule =>
  (value) =>
    typeof value === 'string' && pattern.test(value)

const languageClasses: ValueRule = (value) => {
  if (typeof value !== 'string') return false
  const names = value.split(/\s+/).filter((name) => name !== '')
  return names.length > 0 && names.every((name) => /^language-[\w+#.-]+$/.test(name))
}

const lineNumbers: ValueRule = (value) =>
  Array.isArray(value) && value.every((line: unknown) => Number.isSafeInteger(line))

const alignment = new Map<string, ValueRule>([
  ['style', exactly('text-align:left', 'text-align:right', 'text-align:center')],
])

const ATTRIBUTE_RULES: ReadonlyMap<string, ReadonlyMap<string, ValueRule>> = new Map([
  [
    'a',
    new Map([
      ['href', text],
      ['title', text],
    ]),
  ],
  [
    'img',
    new Map([
      ['src', text],
      ['alt', text],
      ['title', text],
      ['width', text],
      ['height', text],
    ]),
  ],
  ['code', new Map([['class', languageClasses]])],
  [
    'pre',
    new Map([
      ['language', text],
      ['filename', text],
      ['highlights', lineNumbers],
      ['meta', text],
    ]),
  ],
  ['ol', new Map([['start', matching(/^\d{1,9}$/)]])],
  ['ul', new Map([['class', exactly('contains-task-list')]])],
  ['li', new Map([['class', exactly('task-list-item')]])],
  ['blockquote', new Map([['as', exactly(...ALERT_TYPES)]])],
  ['th', alignment],
  ['td', alignment],
  [
    'input',
    new Map([
      ['class', exactly('task-list-item-checkbox')],
      ['type', exactly('checkbox')],
      [':disabled', exactly('true')],
      [':checked', exactly('true')],
    ]),
  ],
  ['template', new Map([['name', matching(/^[\w-]+$/)]])],
])

export function isAllowedAttribute(tag: string, key: string, value: unknown): boolean {
  const rule = ATTRIBUTE_RULES.get(tag)?.get(key)
  return rule !== undefined && rule(value)
}

export function displayAttribute(key: string): string {
  return key.startsWith(':') ? key.slice(1) : key
}

export function attributeName(key: string): string {
  return key
    .toLowerCase()
    .replace(/^(?::|v-bind:)/, '')
    .replace(/^(?:@|v-on:)/, 'on')
    .replaceAll(':', '')
}

const SINK_NAMES: ReadonlySet<string> = new Set([
  'srcdoc',
  'formaction',
  'innerhtml',
  'dangerouslysetinnerhtml',
  'textcontent',
])

export function isForbiddenAttribute(name: string): boolean {
  return name.startsWith('on') || SINK_NAMES.has(name)
}

const NAMED_ENTITY = new Map([
  ['colon', ':'],
  ['Tab', '\t'],
  ['NewLine', '\n'],
])

function decodeEntities(value: string): string {
  let current = value
  for (let pass = 0; pass < 3; pass++) {
    const next = current.replace(
      /&(?:#[xX]([0-9a-fA-F]+)|#(\d+)|(colon|Tab|NewLine));?/g,
      (
        match: string,
        hex: string | undefined,
        decimal: string | undefined,
        name: string | undefined,
      ) => {
        if (name !== undefined) return NAMED_ENTITY.get(name) ?? match
        const code =
          hex !== undefined ? Number.parseInt(hex, 16) : Number.parseInt(decimal ?? '', 10)
        return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : match
      },
    )
    if (next === current) break
    current = next
  }
  return current
}

export function trimLeadingControls(value: string): string {
  let at = 0
  while (at < value.length && value.charCodeAt(at) <= 0x20) at++
  return value.slice(at)
}

export function urlScheme(value: string): string | undefined {
  const decoded = value.includes('&') ? decodeEntities(value) : value
  const colon = decoded.indexOf(':')
  if (colon === -1) return undefined
  const head = trimLeadingControls(decoded.slice(0, colon).replace(/[\t\n\r]/g, ''))
  return /^[A-Za-z][A-Za-z0-9+.-]*$/.test(head) ? head.toLowerCase() : undefined
}

export type UrlKind = 'link' | 'image'

const LINK_SCHEMES: ReadonlySet<string> = new Set(['http', 'https', 'mailto', 'asset'])
const IMAGE_SCHEMES: ReadonlySet<string> = new Set(['http', 'https', 'asset'])

export function isSafeUrl(value: string, kind: UrlKind): boolean {
  const scheme = urlScheme(value)
  return scheme === undefined || (kind === 'link' ? LINK_SCHEMES : IMAGE_SCHEMES).has(scheme)
}

const NAME_LENGTH = 100

export function shorten(value: string): string {
  return value.length > NAME_LENGTH ? `${value.slice(0, NAME_LENGTH - 3)}...` : value
}

export function setOwn(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  })
}

export function parseJson(value: string): unknown {
  try {
    const parsed: unknown = JSON.parse(value)
    return typeof parsed === 'number' && !Number.isFinite(parsed) ? value : parsed
  } catch {
    return value
  }
}

export function isBinding(key: string): boolean {
  return key.startsWith(':') || key.startsWith('v-bind:')
}

export function urlValue(key: string, value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  if (!isBinding(key)) return value
  const parsed = parseJson(value)
  return typeof parsed === 'string' ? parsed : value
}
