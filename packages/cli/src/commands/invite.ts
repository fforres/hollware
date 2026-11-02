import { hashPersonalToken } from '@hollware/core'
import { parseFlags } from '../args.ts'
import { chooseTarget, query, resolveDatabase } from '../d1.ts'
import { inDays, INVITATION_TTL_DAYS, newId, newInvitationSecret } from '../entropy.ts'
import { CliError, UsageError } from '../errors.ts'
import type { Io } from '../io.ts'
import { publicUrlOf, setupLink } from '../public-url.ts'
import {
  insertInvitation,
  listInvitations,
  ownerOfSiteQuery,
  parseEmail,
  parseExpiresInDays,
  parseInvitationId,
  parseSiteKey,
  revokeInvitation,
  sitesQuery,
} from '../sql.ts'
import { chooseSite, WHERE_OPTIONS } from './token.ts'

export const INVITE_USAGE = [
  'Usage: hollware invite (--role <admin | editor | author | reviewer> --email <address> | --owner)',
  '                       [--days <n>]',
  '                       [--url <url>]',
  '                       [--site <key>] [--local | --remote] [--database <name>] [--json]',
  '       hollware invite list [--site <key>] [--local | --remote] [--database <name>]',
  '       hollware invite revoke <id> [--site <key>] [--local | --remote] [--database <name>]',
  '',
  'Invites a person to the admin: prints a link, valid once and for 7 days by default,',
  'where they set up a passkey. An admin runs the site and its people, but never deletes it nor',
  'names an owner; an editor reads, writes and publishes; an author reads and writes, and what an',
  'author publishes goes through review; a reviewer reads and comments. With --owner, the link is',
  'for the owner of the site, to set up a passkey: on a deployment that was made before the admin',
  'existed, or on a new device. "invite list" shows the invitations that wait, and "invite revoke"',
  'stops the link of one at once.',
  '',
  'Options:',
  '  --role <role>      admin, editor, author or reviewer',
  '  --owner            A setup link for the owner of the site, instead of a new person',
  '  --email <address>  The address of the person, required with --role: Hollware knows them by it,',
  '                     and signing in with it through a provider accepts the invitation, with or',
  '                     without the link',
  '  --days <n>         Days until the link expires, 1 to 365 (default: 7)',
  '  --url <url>        The public URL of Hollware (default: HOLLWARE_PUBLIC_URL of wrangler.jsonc)',
  '  --site <key>       The site (default: the only site of the database)',
  '  --local            Use the local database (the default)',
  '  --remote           Use the database in Cloudflare',
  '  --database <name>  The D1 database, by name or binding (default: the binding "DB" of wrangler.jsonc)',
  '  --json             One JSON object on stdout and nothing else: site, role, userId, email, expiresAt,',
  '                     setupUrl',
  '                     (null when no URL is known)',
  '  --help             Show this help',
].join('\n')

const INVITED = ['admin', 'editor', 'author', 'reviewer'] as const

type Invited = (typeof INVITED)[number]

const ARTICLE: Readonly<Record<Invited, string>> = {
  admin: 'an admin',
  editor: 'an editor',
  author: 'an author',
  reviewer: 'a reviewer',
}

function roleOf(value: string | undefined): Invited {
  const role = INVITED.find((one) => one === value)
  if (role === undefined) {
    throw new UsageError('--role is required, and it is admin, editor, author or reviewer.')
  }
  return role
}

export async function invite(argv: readonly string[], io: Io): Promise<number> {
  const [subcommand, ...rest] = argv
  if (subcommand === 'list') return listWaiting(rest, io)
  if (subcommand === 'revoke') return revokeWaiting(rest, io)
  const { values } = parseFlags({
    args: [...argv],
    allowPositionals: false,
    options: {
      ...WHERE_OPTIONS,
      role: { type: 'string' },
      owner: { type: 'boolean' },
      email: { type: 'string' },
      days: { type: 'string' },
      url: { type: 'string' },
      json: { type: 'boolean' },
    },
  })
  if (values.help === true) {
    io.out(INVITE_USAGE)
    return 0
  }
  const forOwner = values.owner === true
  if (forOwner && values.role !== undefined) {
    throw new UsageError('--owner and --role cannot be used together: choose one.')
  }
  const invited = forOwner ? null : roleOf(values.role)
  const role = invited ?? 'owner'
  const days = values.days === undefined ? INVITATION_TTL_DAYS : parseExpiresInDays(values.days)
  if (forOwner && values.email !== undefined) {
    throw new UsageError('--owner and --email cannot be used together: --email names a new person.')
  }
  if (!forOwner && values.email === undefined) {
    throw new UsageError(
      '--email is required with --role: name the address of the person, such as --email ada@example.com.',
    )
  }
  const email = values.email === undefined ? undefined : parseEmail(values.email, '--email')
  const siteFlag = values.site === undefined ? undefined : parseSiteKey(values.site)
  const target = chooseTarget(values)
  const database = resolveDatabase(io.cwd, values.database)
  const url = publicUrlOf(io.cwd, values.url)

  const [siteRows = []] = await query(io.wrangler, database, target, sitesQuery())
  const site = chooseSite(siteRows, siteFlag)
  let userId: string | null = null
  if (forOwner) {
    const [owners = []] = await query(io.wrangler, database, target, ownerOfSiteQuery(site))
    const [owner] = owners
    if (owner === undefined || typeof owner['id'] !== 'string') {
      throw new CliError(`the site "${site}" has no owner. Run "hollware init" to make one.`)
    }
    userId = owner['id']
  }
  const now = io.now()
  const secret = newInvitationSecret(io)
  const expiresAt = inDays(now, days)
  await query(
    io.wrangler,
    database,
    target,
    insertInvitation({
      id: newId(io, 'invitation'),
      site,
      hash: await hashPersonalToken(secret),
      role,
      userId,
      expiresAt,
      now: now.toISOString(),
      email,
    }),
  )
  if (values.json === true) {
    io.out(
      JSON.stringify({
        site,
        role,
        userId,
        email: email ?? null,
        expiresAt,
        setupUrl: url === undefined ? null : setupLink(url, secret),
      }),
    )
    return 0
  }
  io.out(
    [
      invited !== null
        ? `Invited ${ARTICLE[invited]} to the site "${site}". The link works once, until ${expiresAt}:`
        : `A setup link for the owner (${userId}) of the site "${site}", to set up a passkey. It works once, until ${expiresAt}:`,
      '',
      `  ${setupLink(url, secret)}`,
    ].join('\n'),
  )
  return 0
}

async function siteOf(
  values: { readonly site?: string | undefined; readonly database?: string | undefined },
  io: Io,
  target: ReturnType<typeof chooseTarget>,
  database: string,
): Promise<string> {
  const siteFlag = values.site === undefined ? undefined : parseSiteKey(values.site)
  const [siteRows = []] = await query(io.wrangler, database, target, sitesQuery())
  return chooseSite(siteRows, siteFlag)
}

async function listWaiting(argv: readonly string[], io: Io): Promise<number> {
  const { values } = parseFlags({
    args: [...argv],
    allowPositionals: false,
    options: WHERE_OPTIONS,
  })
  if (values.help === true) {
    io.out(INVITE_USAGE)
    return 0
  }
  const target = chooseTarget(values)
  const database = resolveDatabase(io.cwd, values.database)
  const site = await siteOf(values, io, target, database)
  const [rows = []] = await query(
    io.wrangler,
    database,
    target,
    listInvitations(site, io.now().toISOString()),
  )
  io.out(
    rows.length === 0
      ? `No invitation waits in the site "${site}".`
      : rows
          .map(
            (row) =>
              `${String(row['id'])}  ${String(row['role'])}${typeof row['email'] === 'string' ? `  ${row['email']}` : ''}  until ${String(row['expires_at'])}`,
          )
          .join('\n'),
  )
  return 0
}

async function revokeWaiting(argv: readonly string[], io: Io): Promise<number> {
  const { values, positionals } = parseFlags({
    args: [...argv],
    allowPositionals: true,
    options: WHERE_OPTIONS,
  })
  if (values.help === true) {
    io.out(INVITE_USAGE)
    return 0
  }
  const [rawId, ...extra] = positionals
  if (rawId === undefined || extra.length > 0) {
    throw new UsageError('revoke takes the id of one invitation: hollware invite revoke <id>.')
  }
  const id = parseInvitationId(rawId)
  const target = chooseTarget(values)
  const database = resolveDatabase(io.cwd, values.database)
  const site = await siteOf(values, io, target, database)
  const [revoked = []] = await query(
    io.wrangler,
    database,
    target,
    revokeInvitation(id, site, io.now().toISOString()),
  )
  if (revoked.length === 0) {
    throw new CliError(
      `no invitation ${id} waits in the site "${site}". "hollware invite list" shows the ones that do.`,
    )
  }
  io.out(`Revoked invitation ${id}: its link no longer works.`)
  return 0
}
