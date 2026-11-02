import { EXTENSIONS, listBackups, sniffAsset } from '@hollware/core'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { parseFlags } from '../args.ts'
import { CliError, UsageError } from '../errors.ts'
import { printable } from '../format.ts'
import { openSession } from '../import/session.ts'
import type { Io } from '../io.ts'
import { readVersion } from '../version.ts'
import { checkTarget } from './export.ts'
import { mcpEndpoint, readToken, redact } from './import.ts'

export const BACKUP_USAGE = [
  'Usage: hollware backup list --url <hollware url> (--token-file <file> | token on stdin)',
  '       hollware backup get <date> <directory> --url <hollware url> (--token-file <file> | token on stdin) [--published]',
  '',
  'The daily backups of a site, which the cron of Hollware makes after 03:00 UTC and keeps 30 days',
  'in the R2 bucket BACKUPS of the deployment, or MEDIA without it. list says which there are; get',
  'writes the one of <date> (YYYY-MM-DD) as files, <collection>/<locale>/<slug>.md, the layout',
  '"hollware import" reads, with site.json, the definition of the site, redirects.json, the 301s',
  'of the entries that moved, and the images of the site in _assets, which the import uploads',
  'again. The directory must be empty or not exist.',
  '',
  'Options:',
  '  --url <url>          The address of your Hollware, such as https://cms.example.com',
  '  --token-file <file>  A file with a personal token of an owner (site:owner); without it, stdin',
  '  --published          Write only what was published, as it was published; by default the latest',
  '                       revision of every entry out of the trash, drafts included',
  '  --help               Show this help',
].join('\n')

interface BackupEntry {
  readonly collection: string
  readonly locale: string
  readonly slug: string
  readonly status: string
  readonly deletedAt: string | null
  readonly markdown: string
  readonly published: string | null
}

interface BackupRedirect {
  readonly fromPath: string
  readonly toPath: string
}

interface BackupAsset {
  readonly id: string
  readonly alt: string
  readonly filename: string
}

const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/

const listOf = (record: object, key: string): unknown[] => {
  const value: unknown = Reflect.get(record, key)
  return Array.isArray(value) ? value : []
}

function isBackupRedirect(value: unknown): value is BackupRedirect {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof Reflect.get(value, 'fromPath') === 'string' &&
    typeof Reflect.get(value, 'toPath') === 'string'
  )
}

function isBackupAsset(value: unknown): value is BackupAsset {
  return (
    typeof value === 'object' &&
    value !== null &&
    /^ast_[0-9a-f]{26}$/.test(String(Reflect.get(value, 'id'))) &&
    typeof Reflect.get(value, 'alt') === 'string' &&
    typeof Reflect.get(value, 'filename') === 'string'
  )
}

function isBackupEntry(value: unknown): value is BackupEntry {
  if (typeof value !== 'object' || value === null) return false
  const text = (key: string) => typeof Reflect.get(value, key) === 'string'
  const textOrNull = (key: string) => {
    const field: unknown = Reflect.get(value, key)
    return field === null || typeof field === 'string'
  }
  return (
    ['collection', 'locale', 'slug', 'status', 'markdown'].every(text) &&
    ['deletedAt', 'published'].every(textOrNull)
  )
}

export async function backup(argv: readonly string[], io: Io): Promise<number> {
  const { values, positionals } = parseFlags({
    args: [...argv],
    allowPositionals: true,
    options: {
      url: { type: 'string' },
      'token-file': { type: 'string' },
      published: { type: 'boolean' },
      help: { type: 'boolean' },
    },
  })
  if (values.help === true) {
    io.out(BACKUP_USAGE)
    return 0
  }
  const [action, ...rest] = positionals
  if (values.url === undefined) {
    throw new UsageError(
      '--url is required: the address of your Hollware, such as https://cms.example.com.',
    )
  }
  const endpoint = mcpEndpoint(values.url)
  if (action === 'list' && rest.length === 0) {
    const token = await readToken(io, values['token-file'])
    const session = await openSession(endpoint, token, readVersion())
    try {
      const answer = await session.call(listBackups, {})
      if (answer.outcome === 'unavailable') {
        throw new CliError(
          'this Hollware keeps no backups: its Worker has no R2 bucket BACKUPS or MEDIA.',
        )
      }
      const backups = answer.backups ?? []
      io.out(
        backups.length === 0
          ? 'No backups yet: the first is made after 03:00 UTC.'
          : backups.map((one) => `${one.date}  ${Math.ceil(one.bytes / 1024)} KB`).join('\n'),
      )
      return 0
    } finally {
      await session.close()
    }
  }
  const [date, directory] = rest
  if (action !== 'get' || date === undefined || directory === undefined || rest.length > 2) {
    throw new UsageError('backup takes list, or get <date> <directory>.')
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new UsageError(
      `${printable(date)} is not a date: give it as YYYY-MM-DD, as backup list shows it.`,
    )
  }
  const root = resolve(io.cwd, directory)
  checkTarget(root, directory)
  const token = await readToken(io, values['token-file'])
  const url = new URL(`/v1/backups/${date}`, endpoint)
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } })
  if (response.status === 404) {
    throw new CliError(
      `there is no backup of ${date}: "hollware backup list" says which there are.`,
    )
  }
  if (!response.ok) {
    throw new CliError(
      redact(
        `could not download the backup (${response.status}): it takes a personal token of an owner.`,
        token,
      ),
    )
  }
  const file: unknown = await response.json()
  const record = typeof file === 'object' && file !== null ? file : {}
  const listed: unknown = Reflect.get(record, 'entries')
  const entries: BackupEntry[] = Array.isArray(listed) ? listed.filter(isBackupEntry) : []
  const definition: unknown = Reflect.get(record, 'definition') ?? null
  const written: string[] = []
  for (const entry of entries) {
    if (entry.deletedAt !== null) continue
    const markdown =
      values.published === true
        ? entry.status === 'published'
          ? (entry.published ?? entry.markdown)
          : null
        : entry.markdown
    if (markdown === null) continue
    if (
      ![entry.collection, entry.locale].every((part) => SAFE_SEGMENT.test(part)) ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.slug)
    ) {
      throw new CliError(
        `the backup names ${printable(`${entry.collection}/${entry.locale}/${entry.slug}`)}, which is not a path an entry has. Nothing more was written.`,
      )
    }
    const path = join(entry.collection, entry.locale, `${entry.slug}.md`)
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), markdown, { flag: 'wx' })
    written.push(path)
  }
  mkdirSync(root, { recursive: true })
  writeFileSync(join(root, 'site.json'), `${JSON.stringify(definition, null, 2)}\n`, {
    flag: 'wx',
  })
  const redirects = listOf(record, 'redirects')
    .filter(isBackupRedirect)
    .map((redirect) => ({ from: redirect.fromPath, to: redirect.toPath, status: 301 }))
  if (redirects.length > 0) {
    writeFileSync(join(root, 'redirects.json'), `${JSON.stringify(redirects, null, 2)}\n`, {
      flag: 'wx',
    })
  }
  const manifest: Record<string, { alt: string; filename: string }> = {}
  const missing: string[] = []
  for (const asset of listOf(record, 'assets').filter(isBackupAsset)) {
    const response = await fetch(new URL(`/v1/assets/${asset.id}/original`, endpoint), {
      headers: { authorization: `Bearer ${token}` },
    })
    const bytes = response.ok ? new Uint8Array(await response.arrayBuffer()) : null
    const format = bytes === null ? null : sniffAsset(bytes)
    if (bytes === null || format === null) {
      await response.body?.cancel()
      missing.push(asset.id)
      continue
    }
    const name = `${asset.id}.${EXTENSIONS[format]}`
    mkdirSync(join(root, '_assets'), { recursive: true })
    writeFileSync(join(root, '_assets', name), bytes, { flag: 'wx' })
    manifest[name] = { alt: asset.alt, filename: asset.filename }
  }
  const images = Object.keys(manifest).length
  if (images > 0) {
    writeFileSync(join(root, '_assets', 'assets.json'), `${JSON.stringify(manifest, null, 2)}\n`, {
      flag: 'wx',
    })
  }
  const parts = [
    'site.json',
    ...(redirects.length === 0
      ? []
      : [`${redirects.length} ${redirects.length === 1 ? 'redirect' : 'redirects'}`]),
    ...(images === 0 ? [] : [`${images} ${images === 1 ? 'image' : 'images'}`]),
  ]
  io.out(
    `Wrote ${written.length} ${written.length === 1 ? 'entry' : 'entries'} of the backup of ${date} to ${printable(directory)}, with ${parts.join(', ')}. "hollware import ${printable(directory)}" takes them back.`,
  )
  if (missing.length > 0) {
    io.out(
      `The deployment kept no original of ${missing.join(', ')}: ${missing.length === 1 ? 'it is' : 'they are'} left out.`,
    )
  }
  return 0
}
