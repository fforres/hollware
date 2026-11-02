import {
  appendFileSync,
  cpSync,
  existsSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'
import { parseArgs } from 'node:util'

export interface RunResult {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
}

/** Everything create-hollware takes from the outside world; a test hands in a fake of each part. */
export interface Io {
  /** One message for stdout. */
  readonly out: (message: string) => void
  /** One message for stderr. */
  readonly err: (message: string) => void
  /** Where the new directory is made, unless it is absolute. */
  readonly cwd: string
  /** The project template this package ships, made from templates/starter. */
  readonly templateDir: string
  /** The version of create-hollware: the version of Hollware the project gets. */
  readonly version: string
  /** Runs a program in a directory, with its output captured. */
  readonly run: (command: string, args: readonly string[], cwd: string) => Promise<RunResult>
}

export const USAGE = [
  'Usage: npm create hollware [<dir>] --owner-email <address> [options]',
  '',
  'Creates a Hollware project in <dir>: a config, a Worker and the Wrangler config that binds',
  'its database. Then it installs the dependencies, applies the migrations to the local database',
  'and makes your site, its owner and a first token, and says how to connect your agent.',
  '',
  'Options:',
  '  --name <name>    The name of the Worker and of its database (default: the name of <dir>)',
  '  --site <key>     The key of your site, such as my-site; it never changes (default: my-site)',
  '  --preset <name>  What the site starts with: blog, docs or empty (default: blog)',
  '  --locales <list> Its locales, comma-separated, the first the default (default: en)',
  '  --ip-addresses <off|hashed>',
  '                   Whether the activity log keeps a keyed hash of each address (default: off)',
  '  --audit-retention-days <n>',
  '                   Days each line of the activity log is kept, 30 to 3650 (default: forever)',
  '  --token-file <path>',
  '                   Write the first token to this file (mode 0600) and print its path, not the token;',
  '                   a file that exists is refused. Inside the project, it goes into .gitignore',
  '  --json           One JSON object on stdout and nothing else: dir, then what "hollware init" says',
  '                   (site, ownerId, tokenId, token or tokenFile, expiresAt, setupUrl, mcpUrl,',
  '                   readApiUrl), the commands to start it and the MCP configuration',
  '  --owner-email <address>',
  '                   The address of the owner, required unless --no-install: Hollware knows them',
  '                   by it, and they may sign in with it through a provider',
  '  --auth <kind>    Sign in through google, microsoft, github, oidc or cloudflare-access, with:',
  '  --client-id <id> The client id of the app registered with the provider (not Access); its',
  '                   secret is the Worker secret <KIND>_CLIENT_SECRET, set with wrangler secret put',
  '  --tenant <id>    microsoft: the id or domain of your directory',
  '  --issuer <url>   oidc: the https:// issuer',
  '  --team-domain <domain>',
  '                   cloudflare-access: the team domain, such as example.cloudflareaccess.com',
  '  --audience <tag> cloudflare-access: the Application Audience (AUD) tag',
  '  --pm <npm|pnpm>  The package manager that installs (default: npm)',
  '  --yes            Take the defaults: <dir> is my-hollware when it is not given',
  '  --no-install     Do not install, migrate or make the site',
  '  --no-git         Do not run git init',
  '  --help           Show this help',
  '  --version        Print the version',
].join('\n')

export class UsageError extends Error {
  override readonly name = 'UsageError'
}

export class CreateError extends Error {
  override readonly name = 'CreateError'
}

const WORKER_NAME = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const SITE_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const VERSION_PLACEHOLDER = 'HOLLWARE_VERSION'

export interface Choices {
  readonly dir: string
  readonly name: string
  readonly site: string
  readonly pm: 'npm' | 'pnpm'
  readonly install: boolean
  readonly git: boolean
  readonly tokenFile: string | undefined
  readonly json: boolean
  readonly initFlags: readonly string[]
  readonly provider: Readonly<Record<string, string>> | null
}

const AUTH_KINDS = ['google', 'microsoft', 'github', 'oidc', 'cloudflare-access']

function required(value: string | undefined, flag: string, kind: string): string {
  if (value === undefined || value.trim() === '') {
    throw new UsageError(`--auth ${kind} needs ${flag}`)
  }
  return value.trim()
}

export function providerOf(values: {
  readonly auth?: string | undefined
  readonly 'client-id'?: string | undefined
  readonly tenant?: string | undefined
  readonly issuer?: string | undefined
  readonly 'team-domain'?: string | undefined
  readonly audience?: string | undefined
}): Readonly<Record<string, string>> | null {
  const kind = values.auth
  if (kind === undefined) return null
  if (!AUTH_KINDS.includes(kind)) {
    throw new UsageError(`--auth is ${AUTH_KINDS.join(', ')}, not "${kind}"`)
  }
  if (kind === 'cloudflare-access') {
    return {
      kind,
      teamDomain: required(values['team-domain'], '--team-domain', kind),
      audience: required(values.audience, '--audience', kind),
    }
  }
  const client = {
    clientId: required(values['client-id'], '--client-id', kind),
    clientSecret: `${kind.toUpperCase()}_CLIENT_SECRET`,
  }
  if (kind === 'microsoft') {
    return { kind, tenant: required(values.tenant, '--tenant', kind), ...client }
  }
  if (kind === 'oidc') {
    return {
      kind,
      id: 'oidc',
      name: 'Single sign-on',
      issuer: required(values.issuer, '--issuer', kind),
      ...client,
    }
  }
  return { kind, ...client }
}

export function workerWithProvider(source: string, provider: Readonly<Record<string, string>>) {
  return source.replace(
    'createHollware()',
    `createHollware({ auth: { providers: [${JSON.stringify(provider)}] } })`,
  )
}

export function readChoices(argv: readonly string[]): Choices {
  const { values, positionals } = (() => {
    try {
      return parseArgs({
        args: [...argv],
        allowPositionals: true,
        options: {
          name: { type: 'string' },
          site: { type: 'string' },
          preset: { type: 'string' },
          locales: { type: 'string' },
          'ip-addresses': { type: 'string' },
          'audit-retention-days': { type: 'string' },
          pm: { type: 'string' },
          'owner-email': { type: 'string' },
          auth: { type: 'string' },
          'client-id': { type: 'string' },
          tenant: { type: 'string' },
          issuer: { type: 'string' },
          'team-domain': { type: 'string' },
          audience: { type: 'string' },
          yes: { type: 'boolean' },
          'no-install': { type: 'boolean' },
          'no-git': { type: 'boolean' },
          'token-file': { type: 'string' },
          json: { type: 'boolean' },
        },
      })
    } catch (error) {
      throw new UsageError(error instanceof Error ? error.message : String(error))
    }
  })()
  if (positionals.length > 1) {
    throw new UsageError(`one directory, at most: got ${positionals.join(', ')}`)
  }
  const [given] = positionals
  if (given === undefined && values.yes !== true) {
    throw new UsageError('name the directory of the project, or pass --yes for "my-hollware"')
  }
  const dir = given ?? 'my-hollware'
  const name = values.name ?? basename(resolve(dir)).toLowerCase()
  if (!WORKER_NAME.test(name)) {
    throw new UsageError(
      `"${name}" is no Worker name: use lowercase letters, digits and hyphens, or pass --name`,
    )
  }
  const site = values.site ?? 'my-site'
  if (!SITE_KEY.test(site)) {
    throw new UsageError(`"${site}" is no site key: use lowercase words joined by hyphens`)
  }
  const pm = values.pm ?? 'npm'
  if (pm !== 'npm' && pm !== 'pnpm') throw new UsageError(`--pm is npm or pnpm, not "${pm}"`)
  const provider = providerOf(values)
  if (values['owner-email'] === undefined && values['no-install'] !== true) {
    throw new UsageError(
      'pass --owner-email with your address, such as --owner-email ada@example.com: the owner of the site is known by it',
    )
  }
  return {
    dir,
    name,
    site,
    pm,
    install: values['no-install'] !== true,
    git: values['no-git'] !== true,
    tokenFile: values['token-file'],
    json: values.json === true,
    initFlags: [
      ...(values.preset === undefined ? [] : ['--preset', values.preset]),
      ...(values.locales === undefined ? [] : ['--locales', values.locales]),
      ...(values['ip-addresses'] === undefined ? [] : ['--ip-addresses', values['ip-addresses']]),
      ...(values['audit-retention-days'] === undefined
        ? []
        : ['--audit-retention-days', values['audit-retention-days']]),
      '--owner-email',
      values['owner-email'] ?? 'you@example.com',
    ],
    provider,
  }
}

function replaceIn(path: string, replacements: readonly (readonly [string, string])[]): void {
  let text = readFileSync(path, 'utf8')
  for (const [from, to] of replacements) text = text.split(from).join(to)
  writeFileSync(path, text)
}

export function writeProject(io: Io, target: string, choices: Choices): void {
  cpSync(io.templateDir, target, { recursive: true })
  renameSync(join(target, 'gitignore'), join(target, '.gitignore'))
  replaceIn(join(target, 'package.json'), [
    ['"name": "my-hollware"', `"name": ${JSON.stringify(choices.name)}`],
    [`"${VERSION_PLACEHOLDER}"`, JSON.stringify(io.version)],
  ])
  replaceIn(join(target, 'wrangler.jsonc'), [
    ['"name": "my-hollware"', `"name": "${choices.name}"`],
    ['"database_name": "my-hollware"', `"database_name": "${choices.name}"`],
    ['"bucket_name": "my-hollware-media"', `"bucket_name": "${choices.name}-media"`],
    ['"bucket_name": "my-hollware-backups"', `"bucket_name": "${choices.name}-backups"`],
    ['hollware-events', `${choices.name}-events`],
  ])
  for (const file of ['README.md']) {
    replaceIn(join(target, file), [['my-site', choices.site]])
  }
  if (choices.provider !== null) {
    const worker = join(target, 'src', 'worker.ts')
    writeFileSync(worker, workerWithProvider(readFileSync(worker, 'utf8'), choices.provider))
  }
  if (choices.pm === 'pnpm') writeFileSync(join(target, 'pnpm-workspace.yaml'), PNPM_WORKSPACE)
  else for (const file of ['AGENTS.md', 'README.md']) replaceIn(join(target, file), NPM_COMMANDS)
}

export const NPM_COMMANDS: readonly (readonly [string, string])[] = [
  ['pnpm exec ', 'npx '],
  ['pnpm add -E ', 'npm install -E '],
  ['pnpm run ', 'npm run '],
  ['pnpm types', 'npm run types'],
  ['pnpm test', 'npm test'],
  ['pnpm dev', 'npm run dev'],
  ['pnpm build', 'npm run build'],
]

export const PNPM_WORKSPACE = `allowBuilds:
  esbuild: true
  workerd: false
`

function secretLines(choices: Choices): string[] {
  const secret = choices.provider?.['clientSecret']
  if (secret === undefined) return []
  return [
    `Put the client secret of the provider in .dev.vars as ${secret}=…, and before deploying:`,
    `  ${choices.pm} exec wrangler secret put ${secret}`,
    '',
  ]
}

async function step(io: Io, what: string, command: string, args: string[], cwd: string) {
  const result = await io.run(command, args, cwd)
  if (result.code !== 0) {
    const detail = (result.stderr.trim() || result.stdout.trim()).split('\n').slice(-30).join('\n')
    throw new CreateError(`${what} failed (${command} ${args.join(' ')}):\n${detail}`)
  }
  return result
}

const TOKEN_VARIABLE = 'HOLLWARE_TOKEN'

export function mcpJson(url: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        hollware: {
          type: 'http',
          url: `${url}/mcp`,
          headers: { Authorization: `Bearer \${${TOKEN_VARIABLE}}` },
        },
      },
    },
    null,
    2,
  )
}

export function claudeAddLine(url: string): string {
  return `claude mcp add --transport http hollware ${url}/mcp --header 'Authorization: Bearer \${${TOKEN_VARIABLE}}'`
}

function readInitJson(stdout: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(stdout)
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return Object.fromEntries(Object.entries(parsed))
    }
  } catch {}
  throw new CreateError(`"hollware init --json" did not answer with a JSON object:\n${stdout}`)
}

export async function create(argv: readonly string[], io: Io): Promise<number> {
  const choices = readChoices(argv)
  const target = resolve(io.cwd, choices.dir)
  if (existsSync(target) && readdirSync(target).length > 0) {
    throw new CreateError(`${target} is not empty: choose a new directory.`)
  }
  const tokenFile = choices.tokenFile === undefined ? undefined : resolve(io.cwd, choices.tokenFile)
  if (tokenFile !== undefined && existsSync(tokenFile)) {
    throw new CreateError(
      `${tokenFile} exists already, and a token is never written over a file: choose another --token-file.`,
    )
  }
  const say = (message: string) => {
    if (!choices.json) io.out(message)
  }
  writeProject(io, target, choices)
  say(`Created a Hollware project in ${target}.`)
  if (tokenFile !== undefined) {
    const inside = relative(target, tokenFile)
    if (inside !== '' && !inside.startsWith('..') && !isAbsolute(inside)) {
      appendFileSync(
        join(target, '.gitignore'),
        `\n# The token of "hollware init": never commit it.\n/${inside}\n`,
      )
    }
  }
  if (choices.git) await step(io, 'git init', 'git', ['init', '--quiet'], target)
  const initArgs = [
    'init',
    '--site',
    choices.site,
    ...choices.initFlags,
    ...(tokenFile === undefined ? [] : ['--token-file', tokenFile]),
  ]
  if (!choices.install) {
    const next = [
      ...(choices.dir === '.' ? [] : [`cd ${choices.dir}`]),
      `${choices.pm} install`,
      `${choices.pm} exec vp fmt`,
      `${choices.pm} exec hollware migrate --local`,
      `${choices.pm} exec hollware ${initArgs.join(' ')} --local`,
    ]
    if (choices.json) {
      io.out(JSON.stringify({ dir: target, installed: false, next }))
      return 0
    }
    io.out(['', 'Next:', ...next.map((line) => `  ${line}`)].join('\n'))
    return 0
  }

  say(`Installing with ${choices.pm} ...`)
  await step(io, 'The install', choices.pm, ['install'], target)
  await step(io, 'The formatting', join(target, 'node_modules', '.bin', 'vp'), ['fmt'], target)
  const hollware = join(target, 'node_modules', '.bin', 'hollware')
  await step(io, 'The migrations', hollware, ['migrate', '--local'], target)
  const init = await step(
    io,
    'Making the site',
    hollware,
    [...initArgs, '--local', ...(choices.json ? ['--json'] : [])],
    target,
  )
  const dev = `${choices.pm} exec hollware dev`
  if (choices.json) {
    const made = readInitJson(init.stdout.trim())
    const url =
      typeof made['mcpUrl'] === 'string' ? made['mcpUrl'].replace(/\/mcp$/, '') : undefined
    io.out(
      JSON.stringify({
        dir: target,
        installed: true,
        ...made,
        devCommand: dev,
        adminUrl: url === undefined ? null : `${url}/admin/`,
        mcpConfig:
          url === undefined
            ? null
            : {
                variable: TOKEN_VARIABLE,
                claudeCode: claudeAddLine(url),
                json: JSON.parse(mcpJson(url)),
              },
      }),
    )
    return 0
  }
  io.out(init.stdout.trim())
  io.out(
    [
      '',
      'Start it:',
      ...(choices.dir === '.' ? [] : [`  cd ${choices.dir}`]),
      `  ${dev}`,
      '',
      ...secretLines(choices),
      'The admin is at http://localhost:5199/admin/. To deploy, log in to Cloudflare and run:',
      `  ${choices.pm} exec wrangler login`,
      `  ${choices.pm} run deploy`,
      'The README says the rest.',
    ].join('\n'),
  )
  return 0
}
