import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { findWrangler } from '../../packages/cli/src/wrangler.ts'
import { isPersonalToken } from '../../packages/core/src/tokens.ts'
import { runProcess } from './processes.ts'

export const SITE_KEY = 'conformance'

export function localState(workerDirectory: string): string {
  return join(workerDirectory, '.wrangler', 'state')
}

export function resetLocalState(workerDirectory: string): void {
  rmSync(localState(workerDirectory), { recursive: true, force: true })
}

export function cliCommand(repository: string): { command: string; args: string[] } {
  const manifest: unknown = JSON.parse(
    readFileSync(join(repository, 'packages', 'cli', 'package.json'), 'utf8'),
  )
  const bin =
    typeof manifest === 'object' && manifest !== null && 'bin' in manifest
      ? manifest.bin
      : undefined
  const entry =
    typeof bin === 'object' && bin !== null && 'hollware' in bin ? bin.hollware : undefined
  if (typeof entry !== 'string') {
    throw new Error('packages/cli/package.json names no bin "hollware"')
  }
  return { command: process.execPath, args: [join(repository, 'packages', 'cli', entry)] }
}

export function readToken(output: string): string {
  const found = output
    .split('\n')
    .map((line) => line.trim())
    .filter(isPersonalToken)
  const [token] = found
  if (token === undefined || found.length !== 1) {
    throw new Error('the output of "hollware init" does not hold exactly one personal token')
  }
  return token
}

export interface Seeded {
  readonly token: string
  readonly readOnlyToken: string
}

export async function seed(options: {
  readonly repository: string
  readonly workerDirectory: string
  readonly env: NodeJS.ProcessEnv
}): Promise<Seeded> {
  if (findWrangler(options.workerDirectory) === undefined) {
    throw new Error(`no wrangler is installed in ${options.workerDirectory} or above it`)
  }
  const cli = cliCommand(options.repository)
  const run = async (args: string[]): Promise<string> => {
    const result = await runProcess({
      command: cli.command,
      args: [...cli.args, ...args],
      cwd: options.workerDirectory,
      env: options.env,
    })
    if (result.code !== 0) {
      throw new Error(`hollware ${args.join(' ')} exited with ${result.code}:\n${result.output}`)
    }
    return result.output
  }
  await run(['migrate', '--local'])
  const initialized = await run([
    'init',
    '--local',
    '--site',
    SITE_KEY,
    '--owner-email',
    'olga@example.com',
  ])
  const readOnly = await run([
    'token',
    'create',
    '--local',
    '--site',
    SITE_KEY,
    '--label',
    'conformance-read-only',
    '--scopes',
    'content:read',
  ])
  return { token: readToken(initialized), readOnlyToken: readToken(readOnly) }
}
