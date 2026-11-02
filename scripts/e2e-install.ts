import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { OPERATIONS } from '../packages/core/src/index.ts'
import { packAll } from './e2e/pack.ts'
import {
  call,
  fail,
  mcp,
  PROJECT_URL,
  publishPost,
  readPublished,
  run,
  startDev,
  step,
} from './e2e/project.ts'
import { startRegistry } from './e2e/registry.ts'

const ROOT = resolve(import.meta.dirname, '..')

export function userEnv(registry: string, work: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    npm_config_registry: registry,
    pnpm_config_registry: registry,
    npm_config_cache: join(work, 'npm-cache'),
    pnpm_config_store_dir: join(work, 'pnpm-store'),
    pnpm_config_cache_dir: join(work, 'pnpm-cache'),
    npm_config_update_notifier: 'false',
    WRANGLER_SEND_METRICS: 'false',
  }
}

export function e2eVersion(): string {
  const core: { version: string } = JSON.parse(
    readFileSync(join(ROOT, 'packages/core/package.json'), 'utf8'),
  )
  return `${core.version}-e2e.${Date.now()}`
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { pm: { type: 'string', default: 'npm' } } })
  const pm = values.pm === 'pnpm' ? 'pnpm' : 'npm'
  const work = mkdtempSync(join(tmpdir(), 'hollware-e2e-install-'))
  const version = e2eVersion()
  let stopDev: (() => void) | undefined
  let close: (() => Promise<void>) | undefined
  try {
    step(`Packing the published packages at ${version}`)
    const registry = await startRegistry(packAll(ROOT, version, join(work, 'tarballs')))
    close = () => registry.close()
    const env = userEnv(registry.url, work)

    step(`create-hollware@${version} with ${pm}, from ${registry.url}`)
    const created =
      pm === 'pnpm'
        ? await run(
            'pnpm',
            [
              'dlx',
              `create-hollware@${version}`,
              'my-cms',
              '--owner-email',
              'olga@example.com',
              '--pm',
              'pnpm',
              '--no-git',
            ],
            work,
            env,
          )
        : await run(
            'npm',
            [
              'exec',
              '--yes',
              '--package',
              `create-hollware@${version}`,
              '--',
              'create-hollware',
              'my-cms',
              '--owner-email',
              'olga@example.com',
              '--no-git',
            ],
            work,
            env,
          )
    process.stdout.write(created.replace(/hw_pat_[0-9a-z]{52}/g, 'hw_pat_<hidden>'))
    const token =
      /hw_pat_[0-9a-hjkmnp-tv-z]{52}/.exec(created)?.[0] ?? fail('create-hollware printed no token')
    if (!created.includes(`claude mcp add --transport http hollware ${PROJECT_URL}/mcp`)) {
      fail('create-hollware printed no claude mcp add line')
    }
    const project = join(work, 'my-cms')
    const installed: { version: string } = JSON.parse(
      readFileSync(join(project, 'node_modules/@hollware/server/package.json'), 'utf8'),
    )
    if (installed.version !== version) {
      fail(`the project installed @hollware/server ${installed.version}`)
    }

    step('The project passes its own checks, as it was made')
    for (const script of ['check', 'test', 'types:check']) {
      process.stdout.write(await run(pm, ['run', script], project, env))
    }

    step('Its tests pass once wrangler.jsonc names a public URL, as after a deploy')
    const config = join(project, 'wrangler.jsonc')
    const local = readFileSync(config, 'utf8')
    writeFileSync(
      config,
      local.replace(
        '"HOLLWARE_PUBLIC_URL": "http://localhost:5199"',
        '"HOLLWARE_PUBLIC_URL": "https://cms.example.com"',
      ),
    )
    if (readFileSync(config, 'utf8') === local) fail('wrangler.jsonc has no localhost public URL')
    process.stdout.write(await run(pm, ['run', 'test'], project, env))

    step('The dev server')
    stopDev = (await startDev(project, env)).stop

    step('MCP lists every tool to the token of create-hollware')
    const listed = await mcp(token, 'tools/list', {})
    const tools = (listed['tools'] as { name: string }[]).map((tool) => tool.name)
    if (tools.length !== OPERATIONS.length)
      fail(`tools/list answered ${tools.length} tools: ${tools.join(', ')}`)

    step('A draft, published')
    await publishPost(token, 'written-in-the-install-test', 'Written in the install test')

    step('An image, uploaded over MCP and served as WebP')
    const pixel =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='
    const uploaded = await call(token, 'upload_asset', {
      filename: 'pixel.png',
      alt: 'One red pixel',
      data: pixel,
    })
    const asset = uploaded['asset'] as { url: string; format: string } | undefined
    if (uploaded['outcome'] !== 'created' || asset === undefined) {
      fail(`upload_asset answered ${JSON.stringify(uploaded)}`)
    }
    const image = await fetch(asset.url)
    const served = new Uint8Array(await image.arrayBuffer())
    const isWebp = new TextDecoder().decode(served.subarray(8, 12)) === 'WEBP'
    if (image.status !== 200 || asset.format !== 'image/webp' || !isWebp) {
      fail(`the image was served ${image.status} as ${asset.format}, not as WebP`)
    }

    step('A read token reads it over /v1, and is refused by MCP')
    const hollware = join(project, 'node_modules/.bin/hollware')
    const made = await run(
      hollware,
      ['token', 'create', '--read', '--label', 'e2e', '--local'],
      project,
      env,
    )
    const reader =
      /hw_read_[0-9a-hjkmnp-tv-z]{52}/.exec(made)?.[0] ??
      fail('token create --read printed no token')
    const read = await readPublished(reader, 'written-in-the-install-test')
    if (read !== 200) fail(`the read token read ${read}`)
    const refused = await fetch(`${PROJECT_URL}/mcp`, {
      method: 'POST',
      headers: { authorization: `Bearer ${reader}`, 'content-type': 'application/json' },
      body: '{}',
    })
    if (refused.status !== 403) fail(`MCP answered a read token with ${refused.status}`)

    writeFileSync(config, local)

    step('hollware doctor')
    process.stdout.write(await run(hollware, ['doctor'], project, env))

    step(`The install works, with ${pm}.`)
  } finally {
    stopDev?.()
    await close?.()
    rmSync(work, { recursive: true, force: true })
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `\ne2e-install failed: ${error instanceof Error ? error.message : String(error)}\n`,
    )
    process.exitCode = 1
  })
}
