import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { e2eVersion, userEnv } from './e2e-install.ts'
import { OPERATIONS } from '../packages/core/src/index.ts'
import { packAll } from './e2e/pack.ts'
import { fail, mcp, publishPost, readPublished, run, startDev, step } from './e2e/project.ts'
import { startRegistry } from './e2e/registry.ts'
import { starterTemplate, VERSION_PLACEHOLDER } from './sync-starter.ts'

const ROOT = resolve(import.meta.dirname, '..')
const OURS = ['@hollware/core', '@hollware/server', '@hollware/admin', 'hollware']

type Manifest = {
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
  overrides?: Record<string, string>
}

function newMigrations(from: string): number {
  const list = (ref: string | null) =>
    execFileSync('git', ['ls-tree', '--name-only', ref ?? 'HEAD', 'packages/server/migrations/'], {
      cwd: ROOT,
      encoding: 'utf8',
    })
      .split('\n')
      .filter((name) => name.endsWith('.sql'))
  const before = new Set(list(`@hollware/server@${from}`))
  return list(null).filter((name) => !before.has(name)).length
}

function writeOldProject(from: string, project: string): void {
  const old = mkdtempSync(join(tmpdir(), 'hollware-e2e-old-'))
  try {
    const archive = execFileSync(
      'git',
      [
        'archive',
        `create-hollware@${from}`,
        'templates/starter',
        'pnpm-workspace.yaml',
        'tsconfig.base.json',
      ],
      { cwd: ROOT },
    )
    execFileSync('tar', ['x'], { cwd: old, input: archive })
    for (const [path, content] of starterTemplate(old)) {
      mkdirSync(dirname(join(project, path)), { recursive: true })
      writeFileSync(
        join(project, path),
        content.replaceAll(`"${VERSION_PLACEHOLDER}"`, `"${from}"`),
      )
    }
  } finally {
    rmSync(old, { recursive: true, force: true })
  }
  if (existsSync(join(project, 'gitignore'))) {
    renameSync(join(project, 'gitignore'), join(project, '.gitignore'))
  }
  const manifest: Manifest = JSON.parse(readFileSync(join(project, 'package.json'), 'utf8'))
  manifest.devDependencies['hollware'] = from
  manifest.overrides = { vite: '$vite' }
  writeFileSync(join(project, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
}

function upgrade(project: string, version: string): void {
  const manifest: Manifest = JSON.parse(readFileSync(join(project, 'package.json'), 'utf8'))
  for (const deps of [manifest.dependencies, manifest.devDependencies]) {
    for (const name of OURS) if (deps[name] !== undefined) deps[name] = version
  }
  writeFileSync(join(project, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const { values } = parseArgs({
    args: argv[0] === '--' ? argv.slice(1) : argv,
    options: { from: { type: 'string', default: '0.3.0' } },
  })
  const from = values.from ?? '0.3.0'
  const work = mkdtempSync(join(tmpdir(), 'hollware-e2e-upgrade-'))
  const version = e2eVersion()
  const project = join(work, 'my-cms')
  let stopDev: (() => void) | undefined
  let close: (() => Promise<void>) | undefined
  try {
    step(`Packing the published packages at ${version}`)
    const registry = await startRegistry(packAll(ROOT, version, join(work, 'tarballs')))
    close = () => registry.close()
    const env = userEnv(registry.url, work)
    const hollware = join(project, 'node_modules/.bin/hollware')

    step(`A project of ${from}, installed from npm`)
    writeOldProject(from, project)
    await run('npm', ['install'], project, env)
    await run(hollware, ['migrate', '--local'], project, env)
    const init = await run(hollware, ['init', '--site', 'my-site', '--local'], project, env)
    const token = /hw_pat_[0-9a-hjkmnp-tv-z]{52}/.exec(init)?.[0] ?? fail('init printed no token')
    stopDev = (await startDev(project, env)).stop
    await publishPost(token, 'published-before-the-upgrade', 'Published before the upgrade')
    stopDev()
    stopDev = undefined

    step(`The upgrade to ${version}`)
    upgrade(project, version)
    await run('npm', ['install'], project, env)
    const migrated = await run(hollware, ['migrate', '--local'], project, env)
    process.stdout.write(migrated)
    const added = newMigrations(from)
    const expected =
      added === 0
        ? /^No pending migrations on the local database/
        : new RegExp(`^Applied ${added} migrations? to the local database`)
    if (!expected.test(migrated)) {
      fail(`the upgrade from ${from} should apply ${added} migration(s), and printed: ${migrated}`)
    }

    step('What the old release made still works')
    stopDev = (await startDev(project, env)).stop
    const listed = await mcp(token, 'tools/list', {})
    const held = OPERATIONS.filter((spec) => !spec.scopes.some((scope) => scope === 'site:owner'))
    if (!Array.isArray(listed['tools']) || listed['tools'].length !== held.length) {
      fail(`the old token listed ${JSON.stringify(listed['tools'])}`)
    }
    if ((await readPublished(token, 'published-before-the-upgrade')) !== 200) {
      fail('the post published before the upgrade does not read as published')
    }

    step('And what the new release adds works on it')
    const made = await run(
      hollware,
      ['token', 'create', '--read', '--label', 'e2e', '--local'],
      project,
      env,
    )
    const reader =
      /hw_read_[0-9a-hjkmnp-tv-z]{52}/.exec(made)?.[0] ??
      fail('token create --read printed no token')
    if ((await readPublished(reader, 'published-before-the-upgrade')) !== 200) {
      fail('a read token does not read the post published before the upgrade')
    }
    await publishPost(token, 'published-after-the-upgrade', 'Published after the upgrade')

    step(`The upgrade from ${from} works.`)
  } finally {
    stopDev?.()
    await close?.()
    rmSync(work, { recursive: true, force: true })
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `\ne2e-upgrade failed: ${error instanceof Error ? error.message : String(error)}\n`,
  )
  process.exitCode = 1
})
