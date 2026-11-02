import {
  chmodSync,
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { query, type Row } from '../../../../packages/cli/src/d1.ts'
import { createWranglerRunner, findWrangler } from '../../../../packages/cli/src/wrangler.ts'
import {
  freePort,
  runProcess,
  startProcess,
  waitForWorker,
  type ManagedProcess,
} from '../../../conformance/processes.ts'
import { cliCommand, readToken } from '../../../conformance/seed.ts'

const REPOSITORY = join(import.meta.dirname, '..', '..', '..', '..')
const BUILT = join(REPOSITORY, 'apps', 'playground', 'dist', 'hollware_playground')
const MIGRATIONS = join(REPOSITORY, 'packages', 'server', 'migrations')
const ASSETS = join(REPOSITORY, 'apps', 'playground', 'dist', 'client')

export const SITE_KEY = 'playground'

const START_TIMEOUT_MS = 120_000

export interface CommandResult {
  readonly code: number | null
  readonly output: string
}

export interface Project {
  readonly directory: string
  readonly scratch: string
  hollware(...args: string[]): Promise<CommandResult>
  query(sql: string): Promise<Row[][]>
  writeSecret(name: string, content: string): string
  start(options?: {
    readonly hostname?: 'localhost'
    readonly port?: number
    readonly vars?: Readonly<Record<string, string>>
  }): Promise<string>
  close(): Promise<void>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function pointAtMigrations(directory: string): void {
  const path = join(directory, 'wrangler.json')
  const config: unknown = JSON.parse(readFileSync(path, 'utf8'))
  const databases = isRecord(config) ? config['d1_databases'] : undefined
  const [database] = Array.isArray(databases) ? databases : []
  if (!isRecord(config) || !isRecord(database)) {
    throw new Error(`${path} has no D1 database`)
  }
  database['migrations_dir'] = MIGRATIONS
  const assets = config['assets']
  if (isRecord(assets)) assets['directory'] = ASSETS
  writeFileSync(path, JSON.stringify(config))
}

export function createProject(): Project {
  const scratch = mkdtempSync(join(tmpdir(), 'hollware-acceptance-'))
  const directory = join(scratch, 'project')
  cpSync(BUILT, directory, { recursive: true })
  rmSync(join(directory, '.wrangler'), { recursive: true, force: true })
  symlinkSync(join(REPOSITORY, 'node_modules'), join(directory, 'node_modules'))
  pointAtMigrations(directory)
  cpSync(
    join(REPOSITORY, 'apps', 'playground', 'hollware.config.ts'),
    join(directory, 'hollware.config.ts'),
  )

  const env: NodeJS.ProcessEnv = { ...process.env, WRANGLER_SEND_METRICS: 'false' }
  const cli = cliCommand(REPOSITORY)
  const wrangler = findWrangler(directory)
  if (wrangler === undefined) throw new Error(`no wrangler is installed above ${directory}`)
  let dev: ManagedProcess | undefined

  return {
    directory,
    scratch,
    hollware: (...args) =>
      runProcess({ command: cli.command, args: [...cli.args, ...args], cwd: directory, env }),
    query: (sql) => query(createWranglerRunner(directory), 'DB', 'local', sql),
    writeSecret: (name, content) => {
      const path = join(scratch, name)
      writeFileSync(path, content, { mode: 0o600 })
      chmodSync(path, 0o600)
      return path
    },
    start: async (options = {}) => {
      const port = options.port ?? (await freePort())
      const inspectorPort = await freePort()
      const url = `http://${options.hostname ?? '127.0.0.1'}:${port}`
      dev = startProcess({
        command: wrangler,
        args: [
          'dev',
          '--local',
          '--ip',
          '127.0.0.1',
          '--port',
          String(port),
          '--inspector-port',
          String(inspectorPort),
          '--show-interactive-dev-session=false',
          '--var',
          `HOLLWARE_PUBLIC_URL:${url}`,
          ...Object.entries(options.vars ?? {}).flatMap(([name, value]) => [
            '--var',
            `${name}:${value}`,
          ]),
        ],
        cwd: directory,
        env,
        logFile: join(scratch, 'wrangler-dev.log'),
      })
      await waitForWorker({
        port,
        host: `${options.hostname ?? '127.0.0.1'}:${port}`,
        process: dev,
        timeoutMs: START_TIMEOUT_MS,
      })
      return url
    },
    close: async () => {
      await dev?.stop()
      rmSync(scratch, { recursive: true, force: true })
    },
  }
}

export async function setUpProject(project: Project): Promise<string> {
  const migrated = await project.hollware('migrate', '--local')
  if (migrated.code !== 0) throw new Error(`hollware migrate failed:\n${migrated.output}`)
  const initialized = await project.hollware(
    'init',
    '--local',
    '--site',
    SITE_KEY,
    '--owner-email',
    'olga@example.com',
  )
  if (initialized.code !== 0) throw new Error(`hollware init failed with ${initialized.code}`)
  return readToken(initialized.output)
}
