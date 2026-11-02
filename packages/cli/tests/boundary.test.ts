import { chmodSync, existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vite-plus/test'

import { d1, fakeWrangler } from './support/fake-wrangler.ts'
import { run } from './support/io.ts'
import { tempDirs, WRANGLER_JSONC } from './support/project.ts'
import { startStub, type StubServer } from './support/stub-hollware.ts'

const SRC = fileURLToPath(new URL('../src', import.meta.url))
const ENTRY_POINT_MARKER = 'function isEntryPoint(): boolean {'
const PROCESS_USE =
  /\bprocess\s*\.\s*(?:argv|env|cwd|stdout|stderr|stdin|exit|exitCode|platform|pid|on|once|emit|nextTick|kill|hrtime|umask|chdir)\b|\bglobalThis\s*\.\s*process\b/

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    return statSync(path).isDirectory() ? sourceFiles(path) : name.endsWith('.ts') ? [path] : []
  })
}

describe('nothing but the entry point touches process', () => {
  const files = sourceFiles(SRC)

  it('sees the files of src, and the process of the entry point', () => {
    expect(files.length).toBeGreaterThan(10)
    const index = readFileSync(join(SRC, 'index.ts'), 'utf8')
    expect(index.split(ENTRY_POINT_MARKER)).toHaveLength(2)
    expect(index.split(ENTRY_POINT_MARKER)[1]).toMatch(PROCESS_USE)
  })

  it.each(files.map((file) => [file.slice(SRC.length + 1)]))(
    'does not in %s, outside the entry-point block of index.ts',
    (name) => {
      const text = readFileSync(join(SRC, name ?? ''), 'utf8')
      const [code = ''] = name === 'index.ts' ? text.split(ENTRY_POINT_MARKER) : [text]
      expect(code).not.toMatch(PROCESS_USE)
    },
  )
})

describe('--help and --version do not load the commands', () => {
  it('src/index.ts imports no command and no dependency at the top', () => {
    const text = readFileSync(join(SRC, 'index.ts'), 'utf8')
    const specifiers = [
      ...text.matchAll(/^(?:import|export)\b(?!\s+type\b)(?:[^\n]*?\bfrom\b)?\s*'([^']+)'/gm),
    ].map((match) => match[1] ?? '')
    const heavy = specifiers.filter(
      (specifier) =>
        specifier.startsWith('./commands/') ||
        specifier.startsWith('./import/') ||
        specifier.startsWith('@') ||
        specifier === 'zod' ||
        ['./d1.ts', './sql.ts', './args.ts', './entropy.ts'].includes(specifier),
    )
    expect(specifiers).toContain('./version.ts')
    expect(heavy).toEqual([])
  })
})

describe('the CLI never loads hollware.config.ts', () => {
  const temp = tempDirs()
  const stubs: StubServer[] = []

  afterEach(async () => {
    for (const stub of stubs.splice(0)) await stub.close()
  })

  it('in any command of a project that has one', async () => {
    const cwd = temp.make({
      'wrangler.jsonc': WRANGLER_JSONC,
      'hollware.config.ts':
        "import { writeFileSync } from 'node:fs'\nwriteFileSync(new URL('./loaded.marker', import.meta.url), 'loaded')\nexport default {}\n",
      'content/blog/en/a.md': '---\ntitle: A\n---\n\n# A\n',
    })
    const config = join(cwd, 'hollware.config.ts')
    chmodSync(config, 0o000)
    const scratch = temp.make()
    const token = `hw_pat_${'a'.repeat(52)}`
    const stub = await startStub({ token })
    stubs.push(stub)
    const owner = [{ id: 'usr_01JAB3XQ8ZK4M6N2P5R7S9T0VW' }]
    const list =
      '\n Migrations to be applied:\n┌──────────────────┐\n│ Name             │\n├──────────────────┤\n│ 0001_core.sql    │\n└──────────────────┘\n'

    const commands: [string[], ReturnType<typeof fakeWrangler>][] = [
      [
        ['init', '--owner-email', 'olga@example.com', '--site', 'blog'],
        fakeWrangler(d1([]), d1([], [], [])),
      ],
      [['migrate', '--check'], fakeWrangler({ code: 0, stdout: list, stderr: '' })],
      [['token', 'create', '--label', 'ci'], fakeWrangler(d1([{ id: 'blog' }], owner), d1([]))],
      [['token', 'list'], fakeWrangler(d1([{ id: 'blog' }]), d1([]))],
      [
        ['token', 'revoke', 'tok_01JAB3XQ8ZK4M6N2P5R7S9T0VW'],
        fakeWrangler(d1([{ id: 'tok_01JAB3XQ8ZK4M6N2P5R7S9T0VW' }], [])),
      ],
    ]
    const codes: number[] = []
    for (const [argv, wrangler] of commands) {
      const { code } = await run(argv, { cwd, wrangler: wrangler.run, tempDir: () => scratch })
      codes.push(code)
    }
    const imported = await run(['import', 'content', '--url', stub.url, '--dry-run'], {
      cwd,
      readStdin: () => Promise.resolve(token),
    })

    expect(codes).toEqual([0, 1, 0, 0, 0])
    expect(imported.code).toBe(0)
    expect(existsSync(join(cwd, 'loaded.marker'))).toBe(false)
  })
})
