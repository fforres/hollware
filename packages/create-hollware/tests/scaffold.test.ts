import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, beforeAll, describe, expect, it } from 'vite-plus/test'

import { starterTemplate } from '../../../scripts/sync-starter.ts'
import { create, type Io, type RunResult } from '../src/scaffold.ts'

const REPO = resolve(import.meta.dirname, '../../..')
const TOKEN = `hw_pat_${'a'.repeat(52)}`
const INIT_ANSWER = `Hollware is ready on the local database "DB".\n\n${TOKEN}\n`

let template: string
const scratch: string[] = []

beforeAll(() => {
  template = mkdtempSync(join(tmpdir(), 'create-hollware-template-'))
  scratch.push(template)
  for (const [path, content] of starterTemplate(REPO)) {
    mkdirSync(dirname(join(template, path)), { recursive: true })
    writeFileSync(join(template, path), content)
  }
})

afterEach(() => {
  for (const directory of scratch.splice(1)) rmSync(directory, { recursive: true, force: true })
})

interface Call {
  readonly command: string
  readonly args: readonly string[]
  readonly cwd: string
}

function world(answers: Partial<Record<string, RunResult>> = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'create-hollware-'))
  scratch.push(cwd)
  const calls: Call[] = []
  const out: string[] = []
  const io: Io = {
    out: (message) => out.push(message),
    err: () => undefined,
    cwd,
    templateDir: template,
    version: '0.4.0',
    run: async (command, args, at) => {
      calls.push({ command, args, cwd: at })
      const key = `${command.split('/').at(-1)} ${args[0]}`
      return (
        answers[key] ?? { code: 0, stdout: key === 'hollware init' ? INIT_ANSWER : '', stderr: '' }
      )
    },
  }
  const read = (path: string) => readFileSync(join(cwd, 'blog-cms', path), 'utf8')
  return { cwd, calls, out, io, read }
}

describe('create-hollware <dir>', () => {
  it('makes the project its own: names, site, exact versions and a .gitignore', async () => {
    const { io, read, cwd } = world()

    await create(['blog-cms', '--site', 'blog', '--no-install', '--no-git'], io)

    const manifest: unknown = JSON.parse(read('package.json'))
    expect(manifest).toMatchObject({
      name: 'blog-cms',
      dependencies: { '@hollware/server': '0.4.0', '@hollware/core': '0.4.0' },
      devDependencies: { hollware: '0.4.0', '@hollware/admin': '0.4.0' },
    })
    expect(read('package.json')).not.toContain('HOLLWARE_VERSION')
    expect(read('wrangler.jsonc')).toContain('"name": "blog-cms"')
    expect(read('wrangler.jsonc')).toContain('"database_name": "blog-cms"')
    expect(read('wrangler.jsonc')).toContain('"dead_letter_queue": "blog-cms-events-dlq"')
    expect(read('wrangler.jsonc')).toContain('{ "queue": "blog-cms-events-dlq" }')
    expect(read('wrangler.jsonc')).toContain('"bucket_name": "blog-cms-backups"')
    expect(read('wrangler.jsonc')).not.toContain('my-hollware')
    expect(existsSync(join(cwd, 'blog-cms', 'hollware.config.ts'))).toBe(false)
    expect(read('README.md')).toContain(
      'hollware init --site blog --owner-email you@example.com --local',
    )
    expect(read('README.md')).not.toContain('my-site')
    expect(existsSync(join(cwd, 'blog-cms', '.gitignore'))).toBe(true)
    expect(existsSync(join(cwd, 'blog-cms', 'gitignore'))).toBe(false)
    expect(existsSync(join(cwd, 'blog-cms', 'pnpm-workspace.yaml'))).toBe(false)
  })

  it('writes the commands of npm in the guides for agents and people, unless pnpm installs', async () => {
    const npm = world()
    const pnpm = world()

    await create(['blog-cms', '--no-install', '--no-git'], npm.io)
    await create(['blog-cms', '--pm', 'pnpm', '--no-install', '--no-git'], pnpm.io)

    for (const file of ['AGENTS.md', 'README.md']) {
      expect(npm.read(file), file).not.toContain('pnpm')
      expect(pnpm.read(file), file).toMatch(/`pnpm (exec|run) /)
    }
    expect(npm.read('AGENTS.md')).toContain(
      'Run `npm test` and `npx wrangler types --check` after a change of `wrangler.jsonc`, and `npx hollware doctor` when something does not work.',
    )
    expect(npm.read('AGENTS.md')).toContain(
      '(`npm install -E hollware@X @hollware/core@X @hollware/server@X @hollware/admin@X`)',
    )
    expect(npm.read('README.md')).toContain('| `npm run types:check` |')
    expect(npm.read('README.md')).toContain('npm run deploy')
  })

  it('tells pnpm which build scripts to run, when pnpm installs', async () => {
    const { io, cwd } = world()

    await create(['blog-cms', '--pm', 'pnpm', '--no-install', '--no-git'], io)

    expect(readFileSync(join(cwd, 'blog-cms', 'pnpm-workspace.yaml'), 'utf8')).toBe(
      'allowBuilds:\n  esbuild: true\n  workerd: false\n',
    )
  })

  it('runs git init, the install, the migrations and init, in the project', async () => {
    const { io, calls, out, cwd } = world()

    const code = await create(
      ['blog-cms', '--owner-email', 'olga@example.com', '--site', 'blog', '--pm', 'pnpm'],
      io,
    )

    const project = join(cwd, 'blog-cms')
    const hollware = join(project, 'node_modules', '.bin', 'hollware')
    expect(code).toBe(0)
    expect(calls).toEqual([
      { command: 'git', args: ['init', '--quiet'], cwd: project },
      { command: 'pnpm', args: ['install'], cwd: project },
      { command: join(project, 'node_modules', '.bin', 'vp'), args: ['fmt'], cwd: project },
      { command: hollware, args: ['migrate', '--local'], cwd: project },
      {
        command: hollware,
        args: ['init', '--site', 'blog', '--owner-email', 'olga@example.com', '--local'],
        cwd: project,
      },
    ])
    expect(out).toContain(INIT_ANSWER.trim())
    expect(out.at(-1)).toBe(
      [
        '',
        'Start it:',
        '  cd blog-cms',
        '  pnpm exec hollware dev',
        '',
        'The admin is at http://localhost:5199/admin/. To deploy, log in to Cloudflare and run:',
        '  pnpm exec wrangler login',
        '  pnpm run deploy',
        'The README says the rest.',
      ].join('\n'),
    )
    expect(out.join('\n').split(TOKEN)).toHaveLength(2)
  })

  it('hands --preset, --locales and what the activity log keeps to init, as given', async () => {
    const { io, calls, cwd } = world()

    await create(
      [
        'blog-cms',
        '--preset',
        'docs',
        '--locales',
        'es,en',
        '--ip-addresses',
        'hashed',
        '--audit-retention-days',
        '365',
        '--owner-email',
        'olga@example.com',
        '--no-git',
      ],
      io,
    )

    const project = join(cwd, 'blog-cms')
    expect(calls.at(-1)).toEqual({
      command: join(project, 'node_modules', '.bin', 'hollware'),
      args: [
        'init',
        '--site',
        'my-site',
        '--preset',
        'docs',
        '--locales',
        'es,en',
        '--ip-addresses',
        'hashed',
        '--audit-retention-days',
        '365',
        '--owner-email',
        'olga@example.com',
        '--local',
      ],
      cwd: project,
    })
  })

  it('writes the provider of --auth into the Worker, its secret by name, and hands --owner-email to init', async () => {
    const { io, calls, cwd, read, out } = world()

    await create(
      [
        'blog-cms',
        '--auth',
        'microsoft',
        '--client-id',
        'app-id',
        '--tenant',
        'contoso.onmicrosoft.com',
        '--owner-email',
        'ops@contoso.com',
        '--no-git',
      ],
      io,
    )

    expect(read('src/worker.ts')).toContain(
      'createHollware({ auth: { providers: [{"kind":"microsoft","tenant":"contoso.onmicrosoft.com","clientId":"app-id","clientSecret":"MICROSOFT_CLIENT_SECRET"}] } })',
    )
    expect(calls.at(-1)?.args).toEqual([
      'init',
      '--site',
      'my-site',
      '--owner-email',
      'ops@contoso.com',
      '--local',
    ])
    expect(out.join('\n')).toContain('wrangler secret put MICROSOFT_CLIENT_SECRET')
    expect(existsSync(join(cwd, 'blog-cms', 'src', 'worker.ts'))).toBe(true)
  })

  it('refuses an --auth it does not know, and one that lacks what its kind needs', async () => {
    const { io } = world()

    await expect(
      create(['blog-cms', '--owner-email', 'olga@example.com', '--auth', 'saml'], io),
    ).rejects.toThrow('--auth is google, microsoft, github, oidc, cloudflare-access, not "saml"')
    await expect(
      create(
        ['blog-cms', '--owner-email', 'olga@example.com', '--auth', 'oidc', '--client-id', 'x'],
        io,
      ),
    ).rejects.toThrow('--auth oidc needs --issuer')
    await expect(
      create(['blog-cms', '--owner-email', 'olga@example.com', '--auth', 'cloudflare-access'], io),
    ).rejects.toThrow('--auth cloudflare-access needs --team-domain')
  })

  it('leaves the Worker without a config when --auth is not given', async () => {
    const { io, read } = world()

    await create(['blog-cms', '--no-git', '--no-install'], io)

    expect(read('src/worker.ts')).toContain('createHollware()')
  })

  it('refuses to make the site without --owner-email, and writes nothing', async () => {
    const { io, calls, cwd } = world()

    await expect(create(['blog-cms'], io)).rejects.toThrow(
      'pass --owner-email with your address, such as --owner-email ada@example.com: the owner of the site is known by it',
    )

    expect(calls).toEqual([])
    expect(existsSync(join(cwd, 'blog-cms'))).toBe(false)
  })

  it('refuses a directory that is not empty, and writes nothing', async () => {
    const { io, cwd, calls } = world()
    mkdirSync(join(cwd, 'blog-cms'))
    writeFileSync(join(cwd, 'blog-cms', 'notes.txt'), 'mine')

    await expect(create(['blog-cms', '--owner-email', 'olga@example.com'], io)).rejects.toThrow(
      `${join(cwd, 'blog-cms')} is not empty: choose a new directory.`,
    )
    expect(existsSync(join(cwd, 'blog-cms', 'package.json'))).toBe(false)
    expect(calls).toEqual([])
  })

  it('stops at the step that failed, with what it said', async () => {
    const { io, calls } = world({
      'npm install': {
        code: 1,
        stdout: '',
        stderr: 'npm ERR! 404 Not Found: @hollware/server@0.4.0',
      },
    })

    await expect(
      create(['blog-cms', '--owner-email', 'olga@example.com', '--no-git'], io),
    ).rejects.toThrow(
      'The install failed (npm install):\nnpm ERR! 404 Not Found: @hollware/server@0.4.0',
    )
    expect(calls.map((call) => call.command)).toEqual(['npm'])
  })
})

describe('create-hollware, for an agent', () => {
  it('hands --token-file to init as an absolute path, and ignores it in git when it is in the project', async () => {
    const { io, calls, cwd, read, out } = world({
      'hollware init': { code: 0, stdout: 'Hollware is ready.\n', stderr: '' },
    })

    await create(
      [
        'blog-cms',
        '--owner-email',
        'olga@example.com',
        '--token-file',
        'blog-cms/owner.token',
        '--no-git',
      ],
      io,
    )

    const file = join(cwd, 'blog-cms', 'owner.token')
    expect(calls.at(-1)?.args).toEqual([
      'init',
      '--site',
      'my-site',
      '--owner-email',
      'olga@example.com',
      '--token-file',
      file,
      '--local',
    ])
    expect(read('.gitignore')).toMatch(
      /\n# The token of "hollware init": never commit it\.\n\/owner\.token\n$/,
    )
    expect(out.join('\n')).not.toMatch(/hw_pat_/)
  })

  it('refuses a token file that exists before it makes anything', async () => {
    const { io, calls, cwd } = world()
    writeFileSync(join(cwd, 'owner.token'), 'keep\n')

    await expect(
      create(['blog-cms', '--owner-email', 'olga@example.com', '--token-file', 'owner.token'], io),
    ).rejects.toThrow(
      `${join(cwd, 'owner.token')} exists already, and a token is never written over a file: choose another --token-file.`,
    )

    expect(calls).toEqual([])
    expect(existsSync(join(cwd, 'blog-cms'))).toBe(false)
  })

  it('prints one JSON object with --json: init, the commands and the MCP configuration', async () => {
    const init = {
      site: 'my-site',
      ownerId: 'usr_1',
      tokenId: 'tok_1',
      tokenFile: '/x/owner.token',
      expiresAt: '2027-01-10T12:00:00.000Z',
      setupUrl: 'http://localhost:5199/setup#invitation=hw_inv_x',
      mcpUrl: 'http://localhost:5199/mcp',
      readApiUrl: 'http://localhost:5199/v1',
    }
    const { io, calls, out, cwd } = world({
      'hollware init': { code: 0, stdout: `${JSON.stringify(init)}\n`, stderr: '' },
    })

    const code = await create(
      ['blog-cms', '--owner-email', 'olga@example.com', '--json', '--pm', 'pnpm'],
      io,
    )

    expect(code).toBe(0)
    expect(calls.at(-1)?.args).toEqual([
      'init',
      '--site',
      'my-site',
      '--owner-email',
      'olga@example.com',
      '--local',
      '--json',
    ])
    expect(out).toHaveLength(1)
    expect(JSON.parse(out[0] ?? '')).toEqual({
      dir: join(cwd, 'blog-cms'),
      installed: true,
      ...init,
      devCommand: 'pnpm exec hollware dev',
      adminUrl: 'http://localhost:5199/admin/',
      mcpConfig: {
        variable: 'HOLLWARE_TOKEN',
        claudeCode:
          "claude mcp add --transport http hollware http://localhost:5199/mcp --header 'Authorization: Bearer ${HOLLWARE_TOKEN}'",
        json: {
          mcpServers: {
            hollware: {
              type: 'http',
              url: 'http://localhost:5199/mcp',
              headers: { Authorization: 'Bearer ${HOLLWARE_TOKEN}' },
            },
          },
        },
      },
    })
  })

  it('prints one JSON object with --json and --no-install too', async () => {
    const { io, out, cwd } = world()

    await create(['blog-cms', '--json', '--no-install', '--no-git'], io)

    expect(out.map((line) => JSON.parse(line))).toEqual([
      {
        dir: join(cwd, 'blog-cms'),
        installed: false,
        next: [
          'cd blog-cms',
          'npm install',
          'npm exec vp fmt',
          'npm exec hollware migrate --local',
          'npm exec hollware init --site my-site --owner-email you@example.com --local',
        ],
      },
    ])
  })

  it('says no cd when the project is the directory it runs in', async () => {
    const { io, out } = world()

    await create(['.', '--name', 'blog-cms', '--json', '--no-install', '--no-git'], io)

    expect(out.map((line) => JSON.parse(line).next[0])).toEqual(['npm install'])
  })

  it('starts it with no cd when the project is the directory it runs in', async () => {
    const { io, out } = world()

    await create(['.', '--owner-email', 'olga@example.com', '--name', 'blog-cms', '--no-git'], io)

    expect(out.at(-1)?.split('\n').slice(1, 3)).toEqual(['Start it:', '  npm exec hollware dev'])
  })
})
