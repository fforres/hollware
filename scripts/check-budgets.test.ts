import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'
import {
  checkBudgets,
  gzipBytes,
  measureBuild,
  median,
  packageOfSource,
  parseBudgets,
  parseStartupActive,
  type Budgets,
  type Measurement,
  type ModuleSize,
} from './check-budgets.ts'

let directory: string

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'check-budgets-test-'))
})

afterEach(() => {
  rmSync(directory, { recursive: true, force: true })
})

function write(path: string, text: string): void {
  mkdirSync(dirname(join(directory, path)), { recursive: true })
  writeFileSync(join(directory, path), text)
}

const BUDGETS: Budgets = {
  main: { gzipKiB: 250, reason: 'The main module is evaluated at every cold start.' },
  total: { gzipKiB: 400, reason: 'Every module is uploaded.' },
  lazyPackages: {
    packages: ['comark', '@comark/html'],
    reason: 'Both load when the first Markdown arrives.',
  },
}

const KIB = 1024

function module(file: string, startup: boolean, packages: string[] = []): ModuleSize {
  return { file, bytes: 0, gzipBytes: 0, startup, packages }
}

function measurement(
  startupGzipBytes: number,
  totalGzipBytes: number,
  modules: ModuleSize[],
): Measurement {
  return { main: 'index.js', modules, startupGzipBytes, totalGzipBytes }
}

const PLACED = [
  module('index.js', true, ['hono', 'zod']),
  module('assets/a.js', false, ['comark']),
  module('assets/b.js', false, ['@comark/html']),
]

describe('budgets.json', () => {
  it('holds the ceilings that were fixed before the first measurement', () => {
    const budgets = parseBudgets(
      readFileSync(join(import.meta.dirname, '..', 'budgets.json'), 'utf8'),
    )

    expect(budgets.main.gzipKiB).toBe(250)
    expect(budgets.total.gzipKiB).toBe(462)
    expect(budgets.lazyPackages.packages).toEqual([
      'comark',
      '@comark/html',
      '@simplewebauthn/server',
      '@modelcontextprotocol/server',
    ])
  })

  it.each([
    ['a missing ceiling', { total: BUDGETS.total, lazyPackages: BUDGETS.lazyPackages }, '"main"'],
    ['a ceiling of zero', { ...BUDGETS, main: { gzipKiB: 0, reason: 'x' } }, '"main"'],
    [
      'a ceiling that is not a number',
      { ...BUDGETS, total: { gzipKiB: '400', reason: 'x' } },
      '"total"',
    ],
    ['a ceiling without its reason', { ...BUDGETS, main: { gzipKiB: 250, reason: ' ' } }, '"main"'],
    [
      'no lazy package',
      { ...BUDGETS, lazyPackages: { packages: [], reason: 'x' } },
      '"lazyPackages"',
    ],
  ])('refuses %s', (_name, json, mentions) => {
    expect(() => parseBudgets(JSON.stringify(json))).toThrow(mentions)
  })
})

describe('checkBudgets', () => {
  it('passes a build exactly at its ceilings', () => {
    expect(checkBudgets(measurement(250 * KIB, 400 * KIB, PLACED), BUDGETS)).toEqual([])
  })

  it('fails the main module one byte over its ceiling, with what the ceiling is for', () => {
    const violations = checkBudgets(measurement(250 * KIB + 1, 300 * KIB, PLACED), BUDGETS)

    expect(violations).toEqual([
      {
        rule: 'main-ceiling',
        message:
          'the main module and what it imports at startup is 250.00 KiB gzipped, over the ceiling of 250 KiB in budgets.json. The main module is evaluated at every cold start. Make the build smaller; raising a ceiling says why in its reason.',
      },
    ])
  })

  it('fails all the modules together one byte over their ceiling', () => {
    const violations = checkBudgets(measurement(100 * KIB, 400 * KIB + 1, PLACED), BUDGETS)

    expect(violations.map((violation) => violation.rule)).toEqual(['total-ceiling'])
    expect(violations[0]?.message).toContain('all the modules together is 400.00 KiB gzipped')
  })

  it('reports both ceilings when both are broken', () => {
    const violations = checkBudgets(measurement(300 * KIB, 500 * KIB, PLACED), BUDGETS)

    expect(violations.map((violation) => violation.rule)).toEqual(['main-ceiling', 'total-ceiling'])
  })

  it('fails a package that sits in a startup module, and names the module', () => {
    const modules = [
      module('index.js', true, ['hono', 'comark']),
      module('assets/a.js', false, ['comark']),
      module('assets/b.js', false, ['@comark/html']),
    ]

    const violations = checkBudgets(measurement(1, 1, modules), BUDGETS)

    expect(violations).toEqual([
      {
        rule: 'not-lazy',
        message:
          'comark is in the startup modules (index.js), so every cold start evaluates it. Both load when the first Markdown arrives.',
      },
    ])
  })

  it('fails a package that a statically imported chunk brings into startup', () => {
    const modules = [
      module('index.js', true),
      module('assets/shared.js', true, ['@comark/html']),
      module('assets/a.js', false, ['comark']),
    ]

    const violations = checkBudgets(measurement(1, 1, modules), BUDGETS)

    expect(
      violations.map((violation) => `${violation.rule} ${violation.message.split(' ')[0]}`),
    ).toEqual(['not-lazy @comark/html'])
  })

  it('fails a lazy package that is in no module, so that it cannot pass by leaving', () => {
    const modules = [module('index.js', true, ['hono']), module('assets/a.js', false, ['comark'])]

    const violations = checkBudgets(measurement(1, 1, modules), BUDGETS)

    expect(violations).toEqual([
      {
        rule: 'no-lazy-chunk',
        message:
          '@comark/html is in no module of the build, so nothing shows that it stays lazy: if it left the Worker, remove it from lazyPackages in budgets.json',
      },
    ])
  })

  it('says so when the build has no source maps to place the packages with', () => {
    const modules = [module('index.js', true), module('assets/a.js', false)]

    const violations = checkBudgets(measurement(1, 1, modules), BUDGETS)

    expect(violations.map((violation) => violation.message)).toEqual([
      'the build has no source maps, so comark cannot be placed: build with --sourcemap hidden',
      'the build has no source maps, so @comark/html cannot be placed: build with --sourcemap hidden',
    ])
  })
})

function buildFixture(): void {
  write('wrangler.json', JSON.stringify({ main: 'index.js', no_bundle: true }))
  write(
    '.vite/manifest.json',
    JSON.stringify({
      'virtual:worker-entry': {
        file: 'index.js',
        isEntry: true,
        imports: ['_shared.js'],
        dynamicImports: ['_lazy.js', '../node_modules/comark/index.js'],
      },
      '_shared.js': { file: 'assets/shared.js', imports: ['_leaf.js'] },
      '_leaf.js': { file: 'assets/leaf.js' },
      '_lazy.js': { file: 'assets/lazy.js', imports: ['_shared.js'] },
    }),
  )
  write('index.js', '')
  write('assets/shared.js', '')
  write('assets/leaf.js', '')
  write('assets/lazy.js', 'x'.repeat(1000))
  write(
    'index.js.map',
    JSON.stringify({
      sources: [
        '../../../../node_modules/.pnpm/hono@5.0.0/node_modules/hono/dist/index.js',
        '../../src/index.ts',
      ],
    }),
  )
  write(
    'assets/lazy.js.map',
    JSON.stringify({
      sources: [
        '../../../../../node_modules/.pnpm/@comark+html@0.7.0/node_modules/@comark/html/dist/index.js',
        '../../../../../node_modules/.pnpm/comark@0.7.0/node_modules/comark/dist/index.js',
        '../../../../../node_modules/.pnpm/comark@0.7.0/node_modules/comark/dist/utils.js',
      ],
    }),
  )
  write('node_modules/left-pad/index.js', 'module.exports = 1')
}

describe('measureBuild', () => {
  it('weighs each module by its gzipped bytes, and the startup and the whole by their sum', () => {
    buildFixture()

    const built = measureBuild(directory)

    expect(built.modules.map((m) => [m.file, m.bytes, m.gzipBytes])).toEqual([
      ['assets/lazy.js', 1000, 29],
      ['assets/leaf.js', 0, 20],
      ['assets/shared.js', 0, 20],
      ['index.js', 0, 20],
    ])
    expect(built.startupGzipBytes).toBe(60)
    expect(built.totalGzipBytes).toBe(89)
  })

  it('counts as startup the main module and the chunks it imports, however deep, and no other', () => {
    buildFixture()

    const built = measureBuild(directory)

    expect(built.main).toBe('index.js')
    expect(built.modules.filter((m) => m.startup).map((m) => m.file)).toEqual([
      'assets/leaf.js',
      'assets/shared.js',
      'index.js',
    ])
    expect(built.modules.filter((m) => !m.startup).map((m) => m.file)).toEqual(['assets/lazy.js'])
  })

  it('places each module in the packages of its source map, and none for its own sources', () => {
    buildFixture()

    const built = measureBuild(directory)

    expect(Object.fromEntries(built.modules.map((m) => [m.file, m.packages]))).toEqual({
      'assets/lazy.js': ['@comark/html', 'comark'],
      'assets/leaf.js': [],
      'assets/shared.js': [],
      'index.js': ['hono'],
    })
  })

  it('refuses a build with no Vite manifest, or one that does not know its main module', () => {
    write('wrangler.json', JSON.stringify({ main: 'index.js' }))
    write('index.js', '')
    expect(() => measureBuild(directory)).toThrow(
      'does not exist: the build must write its Vite manifest',
    )

    write('.vite/manifest.json', JSON.stringify({ other: { file: 'other.js' } }))
    expect(() => measureBuild(directory)).toThrow('the Vite manifest has no chunk for index.js')
  })
})

describe('gzipBytes', () => {
  it('is the size of the gzip stream, which is 20 bytes for nothing', () => {
    expect(gzipBytes(new Uint8Array(0))).toBe(20)
  })

  it('shrinks what repeats, and cannot shrink what does not', () => {
    const noise = new Uint8Array(4096)
    let state = 12345
    for (let at = 0; at < noise.length; at++) {
      state = (Math.imul(state, 1103515245) + 12345) >>> 0
      noise[at] = state >>> 24
    }

    expect(gzipBytes(new TextEncoder().encode('a'.repeat(100_000)))).toBeLessThan(200)
    expect(gzipBytes(noise)).toBeGreaterThan(4096)
  })
})

describe('packageOfSource', () => {
  it.each([
    ['../../node_modules/.pnpm/comark@0.7.0/node_modules/comark/dist/index.js', 'comark'],
    [
      '../../node_modules/.pnpm/@comark+html@0.7.0/node_modules/@comark/html/dist/index.js',
      '@comark/html',
    ],
    ['node_modules/hono/dist/index.js', 'hono'],
    ['/a/node_modules/x/node_modules/y/index.js', 'y'],
  ])('names %s as %s', (source, name) => {
    expect(packageOfSource(source)).toBe(name)
  })

  it.each(['../../src/index.ts', '../../../../packages/core/src/index.ts', 'virtual:entry'])(
    'names no package for %s',
    (source) => {
      expect(packageOfSource(source)).toBeNull()
    },
  )
})

describe('median', () => {
  it('is the middle sample, whatever the order', () => {
    expect(median([5, 1, 3, 2, 4])).toBe(3)
    expect(median([19.6, 16.6, 19.6, 25, 19.6])).toBe(19.6)
    expect(median([7])).toBe(7)
  })

  it('is the mean of the two in the middle for an even number of samples', () => {
    expect(median([4, 1, 3, 2])).toBe(2.5)
  })

  it('refuses nothing to take the median of', () => {
    expect(() => median([])).toThrow('the median of nothing')
  })
})

describe('parseStartupActive', () => {
  const OUTPUT = `
 ⛅️ wrangler 4.149.0
────────────────────
├ Analysing
│ Startup phase analysed
│
│ Bundle: 757.22 KiB / gzip: 238.52 KiB
│
│ Local startup profile:
│   Profile window: 32.3 ms
│   Sampled time: 28.7 ms
│   Active: 19.6 ms (including 3.0 ms garbage collection)
│   Idle: 9.1 ms
│   Samples: 13
`

  it('reads the active time, not the window or the idle time', () => {
    expect(parseStartupActive(OUTPUT)).toBe(19.6)
  })

  it('refuses an output without it, and shows the output', () => {
    expect(() => parseStartupActive('Startup phase analysed\n')).toThrow(
      'wrangler check startup printed no "Active: <n> ms" line:\nStartup phase analysed',
    )
  })
})
