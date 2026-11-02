import {
  describeSite,
  EXTENSIONS,
  getAsset,
  getEntry,
  listEntries,
  listRedirects,
  schemas,
  sniffAsset,
  type AssetFormat,
} from '@hollware/core'
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { parseFlags } from '../args.ts'
import { CliError, UsageError } from '../errors.ts'
import { printable } from '../format.ts'
import { openSession, ToolFailure, type Session } from '../import/session.ts'
import type { Io } from '../io.ts'
import { readVersion } from '../version.ts'
import { withFrontmatterValues } from '../import/frontmatter-values.ts'
import { mcpEndpoint, readToken, redact, withoutToken } from './import.ts'

export const EXPORT_USAGE = [
  'Usage: hollware export <directory> --url <hollware url> (--token-file <file> | token on stdin)',
  '                       [--site <key>] [--collection <name>]... [--locale <code>]...',
  '                       [--published] [--assets <dir> --assets-url <path>] [--dry-run]',
  '',
  'Writes the entries of a running Hollware, read over MCP, as Markdown files at',
  '<directory>/<collection>/<locale>/<slug>.md: the layout "hollware import" reads. Each file is',
  'the revision byte for byte as Hollware keeps it, frontmatter included, so an import of the',
  'export into the same site changes nothing. Entries in the trash are left out. The directory',
  'must be empty or not exist: nothing of yours is overwritten.',
  '',
  'Options:',
  '  --url <url>          The address of your Hollware, such as https://cms.example.com (MCP is at <url>/mcp)',
  '  --token-file <file>  A file with a personal token; without it, the token is read from stdin',
  '  --site <key>         Stop unless the token is of this site (a token reads the one site it is of)',
  '  --collection <name>  Export only this collection; repeat it for several',
  '  --locale <code>      Export only this locale; repeat it for several',
  '  --published          Export only the published entries, as they are published; by default the',
  '                       latest revision of every entry, drafts included; with it, redirects.json',
  '                       holds the 301s of the entries that moved (move_entry), for a site to serve',
  '  --assets <dir>       Write the images the entries show to <dir>, as the site serves them,',
  '                       and point each asset: reference at --assets-url: for a site that',
  '                       serves its images itself. Without it, the images go to <directory>/_assets',
  '                       as they were uploaded, with assets.json, which "hollware import" uploads again',
  '  --assets-url <path>  With --assets: the path the site serves <dir> at, such as /images/cms/',
  '  --dry-run            List the files it would write, and write nothing',
  '  --help               Show this help',
  '',
  'The token needs content:read.',
].join('\n')

const PAGE_SIZE = 100

const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/

export async function exportContent(argv: readonly string[], io: Io): Promise<number> {
  const { values, positionals } = parseFlags({
    args: [...argv],
    allowPositionals: true,
    options: {
      url: { type: 'string' },
      'token-file': { type: 'string' },
      site: { type: 'string' },
      collection: { type: 'string', multiple: true },
      locale: { type: 'string', multiple: true },
      published: { type: 'boolean' },
      assets: { type: 'string' },
      'assets-url': { type: 'string' },
      'dry-run': { type: 'boolean' },
      help: { type: 'boolean' },
    },
  })
  if (values.help === true) {
    io.out(EXPORT_USAGE)
    return 0
  }
  const [directory, ...extra] = positionals
  if (directory === undefined || extra.length > 0) {
    throw new UsageError('export takes one directory: hollware export <directory> --url <url>.')
  }
  if (values.url === undefined) {
    throw new UsageError(
      '--url is required: the address of your Hollware, such as https://cms.example.com.',
    )
  }
  if ((values.assets === undefined) !== (values['assets-url'] === undefined)) {
    throw new UsageError(
      '--assets and --assets-url go together: where to write the images, and the path the site serves them at.',
    )
  }
  const endpoint = mcpEndpoint(values.url)
  const root = resolve(io.cwd, directory)
  checkTarget(root, directory)
  const assets =
    values.assets === undefined || values['assets-url'] === undefined
      ? undefined
      : {
          root: resolve(io.cwd, values.assets),
          directory: values.assets,
          url: values['assets-url'],
        }
  if (assets !== undefined) checkTarget(assets.root, assets.directory)
  const token = await readToken(io, values['token-file'])
  try {
    return await exportEntries({
      io,
      token,
      endpoint,
      directory,
      root,
      site: values.site,
      collections: values.collection,
      locales: values.locale,
      published: values.published === true,
      assets,
      dryRun: values['dry-run'] === true,
    })
  } catch (error) {
    throw withoutToken(error, token)
  }
}

export function checkTarget(root: string, directory: string): void {
  let names: string[]
  try {
    names = readdirSync(root)
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? error.code : undefined
    if (code === 'ENOENT') return
    if (code === 'ENOTDIR') throw new CliError(`${printable(directory)} is not a directory.`)
    throw new CliError(
      `could not read ${printable(directory)}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  if (names.length > 0) {
    throw new CliError(
      `${printable(directory)} is not empty: export into a new or an empty directory, so that no file is overwritten. Nothing was written.`,
    )
  }
}

interface Plan {
  io: Io
  token: string
  endpoint: URL
  directory: string
  root: string
  site: string | undefined
  collections: readonly string[] | undefined
  locales: readonly string[] | undefined
  published: boolean
  assets: { root: string; directory: string; url: string } | undefined
  dryRun: boolean
}

interface ExportImage {
  path: string
  bytes: Uint8Array
}

const ASSET_REFERENCE = /asset:(ast_[0-9a-f]{26})/g

interface ExportFile {
  collection: string
  locale: string
  slug: string
  path: string
  markdown: string
}

async function exportEntries(plan: Plan): Promise<number> {
  const { io, token, directory, root, published, dryRun } = plan
  const out = (message: string): void => io.out(redact(message, token))
  const session = await openSession(plan.endpoint, token, readVersion())
  let files: ExportFile[]
  let images: ExportImage[]
  let moved: { from: string; to: string; status: 301 }[] = []
  let siteKey: string
  try {
    const { site } = await session.call(describeSite, {})
    siteKey = site.key
    if (plan.site !== undefined && plan.site !== site.key) {
      throw new CliError(
        `the token is of the site ${printable(JSON.stringify(site.key))}, not ${printable(JSON.stringify(plan.site))}: a personal token reads the one site it is of. Use a token of ${printable(plan.site)}.`,
      )
    }
    const collections = chosen(
      'collection',
      site.collections.map((collection) => collection.name),
      plan.collections,
    )
    const locales =
      plan.locales === undefined ? [undefined] : chosen('locale', site.locales, plan.locales)
    const listed = await listAll(session, collections, locales, published)
    files = await readAll(session, listed, published)
    images = await readImages(session, plan, files)
    if (published && (await session.has(listRedirects.name))) moved = await readRedirects(session)
  } finally {
    await session.close()
  }

  const view = published ? 'the published revisions' : 'the latest revisions, drafts included'
  if (files.length === 0) {
    out(`No entries to export from the site ${printable(siteKey)} (${view}). Nothing was written.`)
    return 0
  }
  const imagesRoot = plan.assets?.root ?? join(root, '_assets')
  const imagesShown = plan.assets?.directory ?? join(directory, '_assets')
  if (dryRun) {
    out(
      [
        ...files.map((file) => `would write  ${printable(file.path)}`),
        ...images.map((image) => `would write  ${printable(join(imagesShown, image.path))}`),
      ].join('\n'),
    )
    out(
      `Dry run: ${count(files.length, 'entry', 'entries')} of the site ${printable(siteKey)} would be written to ${printable(directory)} (${view}):\n${groupSummary(files)}\nNothing was written.`,
    )
    return 0
  }
  let written = 0
  for (const file of files) {
    const target = join(root, file.collection, file.locale, `${file.slug}.md`)
    try {
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, file.markdown, { flag: 'wx' })
    } catch (error) {
      throw new CliError(
        `could not write ${printable(file.path)}: ${error instanceof Error ? error.message : String(error)}. ${written} of ${count(files.length, 'file')} written: remove ${printable(directory)} and run the export again.`,
      )
    }
    written += 1
  }
  for (const image of images) {
    const target = join(imagesRoot, image.path)
    try {
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, image.bytes, { flag: 'wx' })
    } catch (error) {
      throw new CliError(
        `could not write ${printable(join(imagesShown, image.path))}: ${error instanceof Error ? error.message : String(error)}. Remove ${printable(directory)} and run the export again.`,
      )
    }
  }
  if (moved.length > 0) {
    writeFileSync(join(root, 'redirects.json'), `${JSON.stringify(moved, null, 2)}\n`, {
      flag: 'wx',
    })
    out(
      `Wrote ${count(moved.length, 'redirect')} to ${printable(join(directory, 'redirects.json'))}.`,
    )
  }
  if (images.length > 0) {
    out(
      `Wrote ${count(images.filter((image) => image.path !== 'assets.json').length, 'image')} to ${printable(imagesShown)}.`,
    )
  }
  out(
    `Exported ${count(files.length, 'entry', 'entries')} of the site ${printable(siteKey)} to ${printable(directory)} (${view}):\n${groupSummary(files)}`,
  )
  return 0
}

async function readRedirects(
  session: Session,
): Promise<{ from: string; to: string; status: 301 }[]> {
  const all: { from: string; to: string; status: 301 }[] = []
  let cursor: string | undefined
  do {
    const page = await session.call(listRedirects, {
      limit: 500,
      ...(cursor === undefined ? {} : { cursor }),
    })
    for (const redirect of page.redirects) {
      if (redirect.fromPath !== null && redirect.toPath !== null) {
        all.push({ from: redirect.fromPath, to: redirect.toPath, status: 301 })
      }
    }
    cursor = page.nextCursor ?? undefined
  } while (cursor !== undefined)
  return all
}

function chosen(
  kind: 'collection' | 'locale',
  available: readonly string[],
  asked: readonly string[] | undefined,
): string[] {
  if (asked === undefined) return [...available]
  const unknown = asked.filter((name) => !available.includes(name))
  if (unknown.length > 0) {
    throw new CliError(
      `the site has no ${kind} ${unknown.map((name) => printable(JSON.stringify(name))).join(', ')}: it has ${available.map(printable).join(', ')}.`,
    )
  }
  return [...new Set(asked)]
}

interface Listed {
  collection: string
  locale: string
  slug: string
  path: string
}

async function listAll(
  session: Session,
  collections: readonly string[],
  locales: readonly (string | undefined)[],
  published: boolean,
): Promise<Listed[]> {
  const byPath = new Map<string, Listed>()
  for (const collection of collections) {
    for (const locale of locales) {
      let cursor: string | undefined
      do {
        let page
        try {
          page = await session.call(listEntries, {
            collection,
            ...(locale === undefined ? {} : { locale }),
            ...(published ? { status: 'published' as const } : {}),
            limit: PAGE_SIZE,
            ...(cursor === undefined ? {} : { cursor }),
          })
        } catch (error) {
          if (!(error instanceof ToolFailure)) throw error
          throw new CliError(
            `could not list ${printable(locale === undefined ? collection : `${collection}/${locale}`)}: ${sentence(error.message)}. Nothing was written.`,
          )
        }
        for (const summary of page.entries) {
          const path = `${summary.collection}/${summary.locale}/${summary.slug}.md`
          if (
            !SAFE_SEGMENT.test(summary.collection) ||
            !SAFE_SEGMENT.test(summary.locale) ||
            !schemas.slug.safeParse(summary.slug).success
          ) {
            throw new CliError(
              `the server listed an entry that cannot be a file below the directory: ${printable(JSON.stringify(path))}. Nothing was written.`,
            )
          }
          byPath.set(path, {
            collection: summary.collection,
            locale: summary.locale,
            slug: summary.slug,
            path,
          })
        }
        cursor = page.nextCursor ?? undefined
      } while (cursor !== undefined)
    }
  }
  return [...byPath.values()].sort(
    (a, b) =>
      compare(a.collection, b.collection) || compare(a.locale, b.locale) || compare(a.slug, b.slug),
  )
}

async function readAll(
  session: Session,
  listed: readonly Listed[],
  published: boolean,
): Promise<ExportFile[]> {
  const files: ExportFile[] = []
  for (const item of listed) {
    let answer
    try {
      answer = await session.call(getEntry, {
        collection: item.collection,
        locale: item.locale,
        slug: item.slug,
        formats: ['markdown'],
        published,
      })
    } catch (error) {
      if (!(error instanceof ToolFailure)) throw error
      throw new CliError(
        `could not read ${printable(item.path)}: ${sentence(error.message)}. Nothing was written.`,
      )
    }
    const markdown = answer.entry?.markdown
    if (answer.outcome === 'not_found' || markdown === undefined) {
      throw new CliError(
        `${printable(item.path)} is gone: it was ${published ? 'unpublished' : 'moved to the trash or renamed'} while the export ran. Nothing was written: run the export again.`,
      )
    }
    const automatic = published ? answer.entry?.automatic : undefined
    files.push({
      ...item,
      markdown:
        automatic === undefined
          ? markdown
          : withFrontmatterValues(markdown, automatic, answer.entry?.frontmatter ?? {}),
    })
  }
  return files
}

async function readImages(
  session: Session,
  plan: Plan,
  files: ExportFile[],
): Promise<ExportImage[]> {
  const ids = [
    ...new Set(
      files.flatMap((file) =>
        [...file.markdown.matchAll(ASSET_REFERENCE)].map((match) => match[1] ?? ''),
      ),
    ),
  ].sort()
  if (ids.length === 0) return []
  const images: ExportImage[] = []
  const manifest: Record<string, { alt: string; filename: string }> = {}
  const urls = new Map<string, string>()
  for (const id of ids) {
    const answer = await session.call(getAsset, { id })
    const asset = answer.asset
    if (answer.outcome !== 'ok' || asset === undefined) {
      throw new CliError(
        `an entry shows the image ${id}, which the site does not have. Nothing was written.`,
      )
    }
    if (plan.assets !== undefined) {
      const name = `${id}.${EXTENSIONS[asset.format]}`
      images.push({ path: name, bytes: await download(new URL(asset.url), null, id) })
      urls.set(id, `${plan.assets.url}${name}`)
    } else {
      const original = new URL(`/v1/assets/${id}/original`, plan.endpoint)
      const bytes = await download(original, plan.token, id)
      const format: AssetFormat = sniffAsset(bytes) ?? asset.originalFormat
      const name = `${id}.${EXTENSIONS[format]}`
      images.push({ path: name, bytes })
      manifest[name] = { alt: asset.alt, filename: asset.filename }
    }
  }
  if (plan.assets !== undefined) {
    for (const file of files) {
      file.markdown = file.markdown.replace(
        ASSET_REFERENCE,
        (reference, id: string) => urls.get(id) ?? reference,
      )
    }
  } else {
    images.push({
      path: 'assets.json',
      bytes: new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`),
    })
  }
  return images
}

async function download(url: URL, token: string | null, id: string): Promise<Uint8Array> {
  const response = await fetch(
    url,
    token === null ? {} : { headers: { authorization: `Bearer ${token}` } },
  )
  if (!response.ok) {
    throw new CliError(
      `could not download the image ${id} (${response.status} from ${url.pathname}). Nothing was written.`,
    )
  }
  return new Uint8Array(await response.arrayBuffer())
}

function sentence(message: string): string {
  return message.replace(/[\s.]+$/, '')
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function count(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`
}

function groupSummary(files: readonly ExportFile[]): string {
  const sizes = new Map<string, number>()
  for (const file of files) {
    const group = `${file.collection}/${file.locale}`
    sizes.set(group, (sizes.get(group) ?? 0) + 1)
  }
  return [...sizes].map(([group, size]) => `  ${printable(group)}: ${size}`).join('\n')
}
