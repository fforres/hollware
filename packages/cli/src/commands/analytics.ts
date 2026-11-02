import {
  ANALYTICS_PROVIDERS,
  connectAnalytics,
  disconnectAnalytics,
  getAnalytics,
  type AnalyticsProvider,
  type AnalyticsSettings,
} from '@hollware/core'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseFlags } from '../args.ts'
import { CliError, UsageError } from '../errors.ts'
import { printable } from '../format.ts'
import { openSession } from '../import/session.ts'
import type { Io } from '../io.ts'
import { readVersion } from '../version.ts'
import { mcpEndpoint, readToken, redact } from './import.ts'

export const ANALYTICS_USAGE = [
  'Usage: hollware analytics status --url <hollware url> (--token-file <file> | token on stdin)',
  '       hollware analytics connect <provider> --credential-file <file> --url <hollware url> (--token-file <file> | token on stdin) [settings]',
  '       hollware analytics disconnect --url <hollware url> (--token-file <file> | token on stdin)',
  '',
  'The analytics a site reads its page views from, so that content_stats and the admin',
  "say what readers read. Hollware never counts views itself: it reads the site's own analytics",
  'with a read-only key, which it tests before keeping it sealed, and never shows again.',
  '',
  'Providers:',
  '  cloudflare  Cloudflare Web Analytics: an API token with Account Analytics Read',
  '  posthog     PostHog: a personal API key with Query read, scoped to the project',
  '  plausible   Plausible: a Stats API key',
  '  ga4         Google Analytics 4: the JSON key of a service account that views the property',
  '',
  'Options:',
  '  --url <url>                The address of your Hollware, such as https://cms.example.com',
  '  --token-file <file>        A file with a personal token of an owner or an admin (schema:admin); without it, stdin',
  '  --credential-file <file>   A file with the key of the provider; never on the command line',
  '  --hosts <a,b>              Hosts of the site besides the host of its url, such as www.example.com',
  '  --account <id>             cloudflare: the account, in the address of the dashboard (required)',
  '  --host <https://...>       posthog or plausible: the address of a self-hosted instance',
  '  --project <number>         posthog: the project, when the key cannot read it',
  '  --site-id <domain>         plausible: the domain of the site in Plausible',
  '  --property <digits>        ga4: the property id (required)',
  '  --help                     Show this help',
].join('\n')

function readCredential(io: Io, file: string | undefined): string {
  if (file === undefined) {
    throw new UsageError(
      'give the key with --credential-file <file>: a key never goes on the command line.',
    )
  }
  let raw: string
  try {
    raw = readFileSync(resolve(io.cwd, file), 'utf8')
  } catch (error) {
    throw new CliError(
      `could not read the credential file ${printable(file)}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  const credential = raw.trim()
  if (credential === '') throw new CliError(`the credential file ${printable(file)} is empty.`)
  return credential
}

const isProvider = (value: string): value is AnalyticsProvider =>
  (ANALYTICS_PROVIDERS as readonly string[]).includes(value)

export async function analytics(argv: readonly string[], io: Io): Promise<number> {
  const { values, positionals } = parseFlags({
    args: [...argv],
    allowPositionals: true,
    options: {
      url: { type: 'string' },
      'token-file': { type: 'string' },
      'credential-file': { type: 'string' },
      hosts: { type: 'string' },
      account: { type: 'string' },
      host: { type: 'string' },
      project: { type: 'string' },
      'site-id': { type: 'string' },
      property: { type: 'string' },
      help: { type: 'boolean' },
    },
  })
  if (values.help === true) {
    io.out(ANALYTICS_USAGE)
    return 0
  }
  const [action, ...rest] = positionals
  const connecting = action === 'connect' && rest.length === 1
  if (!connecting && !((action === 'status' || action === 'disconnect') && rest.length === 0)) {
    throw new UsageError('analytics takes status, connect <provider>, or disconnect.')
  }
  const provider = rest[0]
  if (connecting && (provider === undefined || !isProvider(provider))) {
    throw new UsageError(
      `${printable(provider ?? '')} is not a provider: ${ANALYTICS_PROVIDERS.join(', ')}.`,
    )
  }
  if (values.url === undefined) {
    throw new UsageError(
      '--url is required: the address of your Hollware, such as https://cms.example.com.',
    )
  }
  const endpoint = mcpEndpoint(values.url)
  const credential = connecting ? readCredential(io, values['credential-file']) : ''
  const project = values.project === undefined ? undefined : Number(values.project)
  if (project !== undefined && (!Number.isInteger(project) || project < 1)) {
    throw new UsageError(
      `--project is the number of a PostHog project, not ${printable(values.project ?? '')}.`,
    )
  }
  const token = await readToken(io, values['token-file'])
  const session = await openSession(endpoint, token, readVersion())
  const quiet = (text: string) =>
    redact(text.split(credential || '\u0000').join('[credential]'), token)
  try {
    if (!(await session.has(getAnalytics.name))) {
      throw new CliError(
        'this Hollware reads no analytics of its own yet: update it to 1.0.0-rc.7 or later.',
      )
    }
    if (action === 'status') {
      const answer = await session.call(getAnalytics, {})
      if (answer.outcome === 'not_connected' || answer.provider === undefined) {
        io.out('No analytics connected. "hollware analytics connect <provider>" connects one.')
        return 0
      }
      io.out(
        [
          `Reading from ${answer.provider}, connected on ${answer.connectedAt ?? 'an unknown day'}.`,
          ...Object.entries(answer.settings ?? {}).map(
            ([key, value]) =>
              `  ${key}: ${Array.isArray(value) ? value.join(', ') : String(value)}`,
          ),
        ].join('\n'),
      )
      return 0
    }
    if (action === 'disconnect') {
      const answer = await session.call(disconnectAnalytics, {})
      io.out(
        answer.outcome === 'disconnected'
          ? 'Disconnected: content_stats answers unavailable until another is connected.'
          : 'No analytics were connected.',
      )
      return 0
    }
    const settings: AnalyticsSettings = {
      ...(values.hosts === undefined
        ? {}
        : {
            hosts: values.hosts
              .split(',')
              .map((host) => host.trim())
              .filter((host) => host !== ''),
          }),
      ...(values.account === undefined ? {} : { accountId: values.account }),
      ...(values.host === undefined ? {} : { host: values.host }),
      ...(project === undefined ? {} : { projectId: project }),
      ...(values['site-id'] === undefined ? {} : { siteId: values['site-id'] }),
      ...(values.property === undefined ? {} : { propertyId: values.property }),
    }
    const answer = await session.call(connectAnalytics, {
      provider: provider as AnalyticsProvider,
      credential,
      settings,
    })
    if (answer.outcome === 'connected') {
      io.out(
        `Connected to ${String(provider)}: ${answer.views ?? 0} views on ${answer.paths ?? 0} pages in the last 7 days. The key is sealed, and content_stats reads it from now on.`,
      )
      return 0
    }
    if (answer.outcome === 'unavailable') {
      throw new CliError(
        'this Hollware has no HOLLWARE_SECRET to keep the key sealed: "hollware deploy" makes one.',
      )
    }
    throw new CliError(
      quiet(
        `${String(provider)} ${answer.outcome}: ${answer.message ?? ''} ${answer.fix ?? ''}`.trim(),
      ),
    )
  } finally {
    await session.close()
  }
}
