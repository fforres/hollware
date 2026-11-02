import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vite-plus/test'

import { main } from '../src/index.ts'
import { install, type Install } from './support/install.ts'

async function run(argv: string[], cli: typeof main = main) {
  const out: string[] = []
  const err: string[] = []
  const code = await cli(argv, { out: (s) => out.push(s), err: (s) => err.push(s) })
  return { code, out, err }
}

const installs: Install[] = []

afterEach(() => {
  for (const installed of installs.splice(0)) installed.remove()
})

async function loadFrom(manifest: object): Promise<typeof main> {
  const installed = install(manifest)
  installs.push(installed)
  const loaded: typeof import('../src/index.ts') = await import(
    pathToFileURL(installed.module).href
  )
  return loaded.main
}

describe('create-hollware --help', () => {
  it('prints the usage on out and exits 0, also with no arguments', async () => {
    for (const argv of [['--help'], []]) {
      const { code, out, err } = await run(argv)
      expect(code).toBe(0)
      expect(err).toEqual([])
      expect(out).toEqual([
        expect.stringContaining(
          'Usage: npm create hollware [<dir>] --owner-email <address> [options]',
        ),
      ])
    }
  })

  it('names every option', async () => {
    const [usage] = (await run(['--help'])).out
    for (const option of ['--name', '--site', '--pm', '--yes', '--no-install', '--no-git']) {
      expect(usage).toContain(option)
    }
  })
})

describe('create-hollware --version', () => {
  it('prints the name and the version in the package.json next to the module', async () => {
    const cli = await loadFrom({ name: 'create-hollware', version: '7.8.9' })
    expect(await run(['--version'], cli)).toEqual({
      code: 0,
      out: ['create-hollware 7.8.9'],
      err: [],
    })
  })

  it('throws when that package.json has no version', async () => {
    const cli = await loadFrom({ name: 'create-hollware' })
    await expect(run(['--version'], cli)).rejects.toThrow('package.json has no version')
  })
})

describe('create-hollware with a mistake in its arguments', () => {
  it.each([
    [['--bogus'], "Unknown option '--bogus'"],
    [['a', 'b'], 'one directory, at most: got a, b'],
    [['--name', 'My_Site', 'x'], '"My_Site" is no Worker name'],
    [['--site', 'My Site', 'x'], '"My Site" is no site key'],
    [['--pm', 'yarn', 'x'], '--pm is npm or pnpm, not "yarn"'],
    [['--no-git'], 'name the directory of the project, or pass --yes for "my-hollware"'],
  ])('rejects %j with the usage on err and exit code 1', async (argv, message) => {
    const { code, out, err } = await run(argv)
    expect(code).toBe(1)
    expect(out).toEqual([])
    expect(err).toEqual([expect.stringContaining(`create-hollware: ${message}`)])
    expect(err[0]).toContain('Usage: npm create hollware')
  })
})
