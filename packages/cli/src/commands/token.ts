import {
  AGENT_SCOPE_CEILING,
  hashPersonalToken,
  PERSONAL_TOKEN_TTL_DAYS,
  type Scope,
} from '@hollware/core'
import { parseFlags } from '../args.ts'
import { chooseTarget, query, resolveDatabase, type Row } from '../d1.ts'
import { inDays, newId, newPersonalToken, newReadToken } from '../entropy.ts'
import { CliError, UsageError } from '../errors.ts'
import { printable, table } from '../format.ts'
import type { Io } from '../io.ts'
import { publicUrlOf } from '../public-url.ts'
import {
  agentMemberQuery,
  insertToken,
  listTokens,
  parseExpiresAt,
  parseExpiresInDays,
  parseLabel,
  parseScopes,
  parseSiteKey,
  parseTokenId,
  parseUserId,
  revokeToken,
  sitesAndOwnerQuery,
  sitesQuery,
} from '../sql.ts'
import { deliverToken, tokenFileOf } from '../token-output.ts'

const WHERE_FLAGS = [
  '  --site <key>       The site (default: the only site of the database)',
  '  --local            Use the local database (the default)',
  '  --remote           Use the database in Cloudflare',
  '  --database <name>  The D1 database, by name or binding (default: the binding "DB" of wrangler.jsonc)',
  '  --help             Show this help',
]

export const TOKEN_USAGE = [
  'Usage: hollware token <command> [options]',
  '',
  'Commands:',
  '  create  Create a personal token and print it once',
  '  list    List the tokens of a site, never their hashes',
  '  revoke  Revoke a token',
  '',
  'Run "hollware token <command> --help" for the options of a command.',
].join('\n')

export const TOKEN_CREATE_USAGE = [
  'Usage: hollware token create --label <text> [--scopes <list> | --read] [--member <usr_…>]',
  '                             [--expires-in-days <n> | --expires-at <date> | --no-expiry]',
  '                             [--token-file <path> [--force]] [--json]',
  '                             [--site <key>] [--local | --remote] [--database <name>]',
  '',
  "Creates a personal token for the site's owner and prints it once; Hollware keeps only its hash.",
  'With --read, a read token (hw_read_): it reads the published content of the site over the read',
  'API (GET /v1/...) and nothing else, so a site may use it at build time or in the browser.',
  "With --member, the token is an agent member's: what it writes is the agent's, and it holds an",
  "author's scopes at most, so it asks for review instead of publishing.",
  '',
  'Options:',
  '  --label <text>          What the token is for, 1 to 64 characters (required)',
  '  --read                  A read token: content:read, published content, the read API only',
  '  --member <usr_…>        A token of this agent member of the site ("hollware agent list" shows them)',
  '  --scopes <list>         Comma-separated: content:read, content:write, content:publish, schema:admin,',
  '                          site:owner',
  '                          (default: content:read,content:write)',
  `  --expires-in-days <n>   Days until it expires, 1 to 365 (default: ${PERSONAL_TOKEN_TTL_DAYS}; a read token never expires)`,
  '  --expires-at <date>     When it expires: a date or time of the future, such as 2027-06-30',
  '  --no-expiry             A token that never expires, until "hollware token revoke"',
  '  --token-file <path>     Write the token to this file (mode 0600) and print its path instead of the',
  '                          token; it refuses a file that exists, unless --force',
  '  --force                 Replace the file of --token-file',
  '  --json                  One JSON object on stdout and nothing else: site, tokenId, kind, member',
  '                          (null: the owner), label, scopes, token or tokenFile, expiresAt (null:',
  '                          never), mcpUrl, readApiUrl (a URL that is not known is null)',
  ...WHERE_FLAGS,
].join('\n')

export const TOKEN_LIST_USAGE = [
  'Usage: hollware token list [--site <key>] [--local | --remote] [--database <name>]',
  '',
  'Lists the tokens of a site: id, label, whose, status, expiry, last use and scopes. Never the hashes.',
  '',
  'Options:',
  ...WHERE_FLAGS,
].join('\n')

export const TOKEN_REVOKE_USAGE = [
  'Usage: hollware token revoke <id> [--site <key>] [--local | --remote] [--database <name>]',
  '',
  'Revokes a token: the server refuses it from now on. "hollware token list" shows the ids.',
  '',
  'Options:',
  ...WHERE_FLAGS,
].join('\n')

export const DEFAULT_SCOPES: readonly Scope[] = ['content:read', 'content:write']

export async function token(argv: readonly string[], io: Io): Promise<number> {
  const [subcommand, ...rest] = argv
  switch (subcommand) {
    case undefined:
    case '--help':
      io.out(TOKEN_USAGE)
      return 0
    case 'create':
      return createToken(rest, io)
    case 'list':
      return listTokenRows(rest, io)
    case 'revoke':
      return revokeTokenById(rest, io)
    default:
      throw new UsageError(
        `unknown command "${printable(subcommand)}": use create, list or revoke.`,
      )
  }
}

export const WHERE_OPTIONS = {
  site: { type: 'string' },
  local: { type: 'boolean' },
  remote: { type: 'boolean' },
  database: { type: 'string' },
  help: { type: 'boolean' },
} as const

async function createToken(argv: readonly string[], io: Io): Promise<number> {
  const { values } = parseFlags({
    args: [...argv],
    allowPositionals: false,
    options: {
      ...WHERE_OPTIONS,
      label: { type: 'string' },
      scopes: { type: 'string' },
      read: { type: 'boolean' },
      member: { type: 'string' },
      'expires-in-days': { type: 'string' },
      'expires-at': { type: 'string' },
      'no-expiry': { type: 'boolean' },
      'token-file': { type: 'string' },
      force: { type: 'boolean' },
      json: { type: 'boolean' },
    },
  })
  if (values.help === true) {
    io.out(TOKEN_CREATE_USAGE)
    return 0
  }
  const read = values.read === true
  if (read && values.scopes !== undefined) {
    throw new UsageError('--read and --scopes cannot be used together: a read token only reads.')
  }
  if (values.label === undefined) {
    throw new UsageError(
      '--label is required: say what the token is for, such as "ci" or "claude-code".',
    )
  }
  const label = parseLabel(values.label)
  const siteFlag = values.site === undefined ? undefined : parseSiteKey(values.site)
  const scopes: readonly Scope[] = read
    ? ['content:read']
    : values.scopes === undefined
      ? DEFAULT_SCOPES
      : parseScopes(values.scopes)
  const member = values.member === undefined ? undefined : parseUserId(values.member)
  if (member !== undefined) {
    if (read) {
      throw new UsageError(
        '--member and --read cannot be used together: an agent gets a personal token.',
      )
    }
    const beyond = scopes.filter((scope) => !AGENT_SCOPE_CEILING.includes(scope))
    if (beyond.length > 0) {
      throw new UsageError(
        `an agent's token never holds ${beyond.join(', ')}: choose among ${AGENT_SCOPE_CEILING.join(', ')}. An agent writes drafts and asks for review, and a person publishes.`,
      )
    }
  }
  const expiries = [values['expires-in-days'], values['expires-at'], values['no-expiry']]
  if (expiries.filter((value) => value !== undefined).length > 1) {
    throw new UsageError('use one of --expires-in-days, --expires-at and --no-expiry.')
  }
  const now = io.now()
  const expiresAt =
    values['expires-at'] !== undefined
      ? parseExpiresAt(values['expires-at'], now)
      : values['expires-in-days'] !== undefined
        ? inDays(now, parseExpiresInDays(values['expires-in-days']))
        : values['no-expiry'] === true || read
          ? null
          : inDays(now, PERSONAL_TOKEN_TTL_DAYS)
  const tokenFile = tokenFileOf(io, values['token-file'], values.force)
  const target = chooseTarget(values)
  const database = resolveDatabase(io.cwd, values.database)

  const [siteRows = [], ownerRows = []] = await query(
    io.wrangler,
    database,
    target,
    sitesAndOwnerQuery(),
  )
  const site = chooseSite(siteRows, siteFlag)
  const ownerId = firstId(ownerRows)
  if (ownerId === undefined) {
    throw new CliError('the database has no owner yet. Run "hollware init --site <key>" first.')
  }
  if (member !== undefined) {
    const [agents = []] = await query(io.wrangler, database, target, agentMemberQuery(site, member))
    if (agents.length === 0) {
      throw new CliError(
        `${member} is no agent member of the site "${site}". "hollware agent list" shows the ones that are.`,
      )
    }
  }

  const id = newId(io, 'token')
  const secret = read ? newReadToken(io) : newPersonalToken(io)
  await query(
    io.wrangler,
    database,
    target,
    insertToken({
      ...(read ? { kind: 'read' as const } : {}),
      id,
      site,
      userId: member ?? ownerId,
      label,
      hash: await hashPersonalToken(secret),
      scopes,
      expiresAt,
      now: now.toISOString(),
    }),
  )
  const delivered = deliverToken(tokenFile, secret)
  if (values.json === true) {
    const url = publicUrlOf(io.cwd, undefined)
    io.out(
      JSON.stringify({
        site,
        tokenId: id,
        kind: read ? 'read' : 'personal',
        member: member ?? null,
        label,
        scopes,
        ...delivered,
        expiresAt,
        mcpUrl: url === undefined ? null : `${url}/mcp`,
        readApiUrl: url === undefined ? null : `${url}/v1`,
      }),
    )
    return 0
  }
  io.out(
    [
      `Created ${read ? 'read token' : 'token'} ${id} for ${member === undefined ? '' : `the agent ${member} of `}the site "${site}".`,
      '',
      `Label    ${label}`,
      `Scopes   ${scopes.join(' ')}`,
      expiresAt === null
        ? 'Expires  never (revoke it with hollware token revoke)'
        : `Expires  ${expiresAt}${inWords(now, expiresAt)}`,
      '',
      ...('tokenFile' in delivered
        ? [
            `The token is in ${delivered.tokenFile}, readable by you only. It is shown only once: Hollware keeps just its hash.`,
          ]
        : ['The token. It is shown only once: Hollware keeps just its hash.', '', secret]),
    ].join('\n'),
  )
  return 0
}

async function listTokenRows(argv: readonly string[], io: Io): Promise<number> {
  const { values } = parseFlags({
    args: [...argv],
    allowPositionals: false,
    options: WHERE_OPTIONS,
  })
  if (values.help === true) {
    io.out(TOKEN_LIST_USAGE)
    return 0
  }
  const siteFlag = values.site === undefined ? undefined : parseSiteKey(values.site)
  const target = chooseTarget(values)
  const database = resolveDatabase(io.cwd, values.database)

  const [siteRows = []] = await query(io.wrangler, database, target, sitesQuery())
  const site = chooseSite(siteRows, siteFlag)
  const [rows = []] = await query(io.wrangler, database, target, listTokens(site))
  if (rows.length === 0) {
    io.out(`The site "${site}" has no tokens.`)
    return 0
  }
  const now = io.now()
  io.out(
    table(
      ['ID', 'LABEL', 'WHOSE', 'STATUS', 'EXPIRES', 'LAST USED', 'SCOPES'],
      rows.map((row) => [
        text(row.id),
        text(row.label),
        row.user_kind === 'agent' ? `agent ${text(row.user_name)}` : text(row.user_name, 'owner'),
        statusOf(row, now),
        text(row.expires_at, 'never'),
        text(row.last_used_at, 'never'),
        scopesOf(row.scopes),
      ]),
    ),
  )
  return 0
}

async function revokeTokenById(argv: readonly string[], io: Io): Promise<number> {
  const { values, positionals } = parseFlags({
    args: [...argv],
    allowPositionals: true,
    options: WHERE_OPTIONS,
  })
  if (values.help === true) {
    io.out(TOKEN_REVOKE_USAGE)
    return 0
  }
  const [rawId, ...extra] = positionals
  if (rawId === undefined || extra.length > 0) {
    throw new UsageError('revoke takes the id of one token: hollware token revoke <id>.')
  }
  const id = parseTokenId(rawId)
  const site = values.site === undefined ? undefined : parseSiteKey(values.site)
  const target = chooseTarget(values)
  const database = resolveDatabase(io.cwd, values.database)

  const [revoked = [], current = []] = await query(
    io.wrangler,
    database,
    target,
    revokeToken(id, site, io.now().toISOString()),
  )
  if (revoked.length > 0) {
    io.out(`Revoked token ${id}.`)
    return 0
  }
  const [row] = current
  if (row === undefined) {
    const inSite = site === undefined ? '' : ` in the site "${site}"`
    throw new CliError(`there is no token ${id}${inSite}. "hollware token list" shows the tokens.`)
  }
  io.out(`Token ${id} was already revoked at ${text(row.revoked_at)}. Nothing changed.`)
  return 0
}

export function chooseSite(rows: readonly Row[], site: string | undefined): string {
  const sites = rows.map((row) => row.id).filter((id): id is string => typeof id === 'string')
  if (site !== undefined) {
    if (!sites.includes(site)) {
      throw new CliError(
        `the database has no site "${site}"${sites.length === 0 ? '' : ` (it has ${sites.join(', ')})`}. Run "hollware init --site ${site}" to create it.`,
      )
    }
    return site
  }
  const [only, ...others] = sites
  if (only === undefined) {
    throw new CliError('the database has no site yet. Run "hollware init --site <key>" first.')
  }
  if (others.length > 0) {
    throw new CliError(
      `the database has several sites (${sites.join(', ')}): choose one with --site <key>.`,
    )
  }
  return only
}

function firstId(rows: readonly Row[]): string | undefined {
  const [row] = rows
  return typeof row?.id === 'string' ? row.id : undefined
}

function text(value: unknown, otherwise = ''): string {
  return typeof value === 'string' ? printable(value) : otherwise
}

function statusOf(row: Row, now: Date): 'revoked' | 'expired' | 'active' {
  if (typeof row.revoked_at === 'string') return 'revoked'
  if (typeof row.expires_at === 'string' && Date.parse(row.expires_at) <= now.getTime()) {
    return 'expired'
  }
  return 'active'
}

function scopesOf(value: unknown): string {
  if (typeof value !== 'string') return ''
  try {
    const parsed: unknown = JSON.parse(value)
    if (Array.isArray(parsed)) {
      return parsed
        .filter((scope): scope is string => typeof scope === 'string')
        .map(printable)
        .join(' ')
    }
  } catch {}
  return printable(value)
}

function inWords(now: Date, expiresAt: string): string {
  const days = Math.round((Date.parse(expiresAt) - now.getTime()) / 86_400_000)
  return days < 1 ? '' : ` (in ${days} ${days === 1 ? 'day' : 'days'})`
}
