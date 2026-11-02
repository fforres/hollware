import { chmodSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vite-plus/test'

import { d1, fakeWrangler, ok } from './support/fake-wrangler.ts'
import { run } from './support/io.ts'
import { tempDirs, WRANGLER_JSONC, wranglerWithPublicUrl } from './support/project.ts'

const temp = tempDirs()

const WITH_URL = wranglerWithPublicUrl('https://cms.example.com')
const SECRET = `hw_pat_${'3'.repeat(52)}`
const SCOPES = [
  'content:read',
  'content:write',
  'content:publish',
  'schema:admin',
  'site:owner',
  'review:read',
  'review:comment',
]

function initProject(files: Record<string, string> = { 'wrangler.jsonc': WITH_URL }) {
  const cwd = temp.make(files)
  const scratch = temp.make()
  const wrangler = fakeWrangler(d1([]), d1([], [], []))
  return {
    cwd,
    wrangler,
    run: (argv: string[]) =>
      run(['init', '--owner-email', 'olga@example.com', '--site', 'blog', ...argv], {
        cwd,
        wrangler: wrangler.run,
        tempDir: () => scratch,
      }),
  }
}

describe('--token-file', () => {
  it('writes the token of init to --token-file, mode 0600, and prints its path instead', async () => {
    const project = initProject()

    const { code, out, err } = await project.run(['--token-file', 'owner.token'])

    const file = join(project.cwd, 'owner.token')
    expect([code, err]).toEqual([0, []])
    expect(readFileSync(file, 'utf8')).toBe(`${SECRET}\n`)
    expect(statSync(file).mode & 0o777).toBe(0o600)
    expect(out.join('\n')).not.toContain(SECRET)
    expect(out.join('\n')).toContain(
      `Your personal token is in ${file}, readable by you only. It is shown only once: Hollware keeps just its hash.`,
    )
    expect(out.join('\n')).toContain(`export HOLLWARE_TOKEN="$(cat ${file})"`)
  })

  it('refuses a token file that exists, before wrangler is reached', async () => {
    const project = initProject({ 'wrangler.jsonc': WITH_URL, 'owner.token': 'keep me\n' })

    const { code, out, err } = await project.run(['--token-file', 'owner.token'])

    const file = join(project.cwd, 'owner.token')
    expect(code).toBe(1)
    expect(out).toEqual([])
    expect(err).toEqual([
      `hollware init: ${file} exists already, and a token is never written over a file: choose another path, or pass --force to replace it.`,
    ])
    expect(readFileSync(file, 'utf8')).toBe('keep me\n')
    expect(project.wrangler.calls).toEqual([])
  })

  it('replaces a file with --force, and its mode becomes 0600', async () => {
    const project = initProject({ 'wrangler.jsonc': WITH_URL, 'owner.token': 'old\n' })
    const file = join(project.cwd, 'owner.token')
    chmodSync(file, 0o644)

    const { code } = await project.run(['--token-file', 'owner.token', '--force'])

    expect(code).toBe(0)
    expect(readFileSync(file, 'utf8')).toBe(`${SECRET}\n`)
    expect(statSync(file).mode & 0o777).toBe(0o600)
  })

  it('takes --force only with --token-file, and a directory that exists', async () => {
    const forced = await initProject().run(['--force'])
    const missing = await initProject().run(['--token-file', 'nowhere/owner.token'])

    expect(forced.err).toEqual([
      'hollware init: --force goes with --token-file. Run "hollware init --help" for the options.',
    ])
    expect(missing.err[0]).toMatch(
      /^hollware init: the directory of --token-file does not exist: .*\/nowhere\.$/,
    )
  })

  it('writes the token of token create to --token-file too', async () => {
    const cwd = temp.make({ 'wrangler.jsonc': WITH_URL })
    const wrangler = fakeWrangler(d1([{ id: 'blog' }], [{ id: 'usr_OWNER' }]), d1([]))

    const { code, out } = await run(
      ['token', 'create', '--label', 'ci', '--token-file', 'ci.token'],
      { cwd, wrangler: wrangler.run },
    )

    const file = join(cwd, 'ci.token')
    expect(code).toBe(0)
    expect(readFileSync(file, 'utf8')).toBe(`hw_pat_${'2'.repeat(52)}\n`)
    expect(statSync(file).mode & 0o777).toBe(0o600)
    expect(out.join('\n')).not.toContain('2'.repeat(52))
    expect(out.join('\n').split('\n').slice(-1)).toEqual([
      `The token is in ${file}, readable by you only. It is shown only once: Hollware keeps just its hash.`,
    ])
  })
})

describe('--json', () => {
  it('prints one object for init, with the token, and nothing else', async () => {
    const project = initProject()

    const { code, out, err } = await project.run(['--json'])

    expect([code, err]).toEqual([0, []])
    expect(out).toHaveLength(1)
    expect(JSON.parse(out[0] ?? '')).toEqual({
      site: 'blog',
      ownerId: 'usr_01M4QZQSG0040G2081040G2081',
      tokenId: 'tok_01M4QZQSG0081040G2081040G2',
      scopes: SCOPES,
      token: SECRET,
      expiresAt: '2027-01-10T12:00:00.000Z',
      setupUrl:
        'https://cms.example.com/setup#invitation=hw_inv_BAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQ',
      mcpUrl: 'https://cms.example.com/mcp',
      readApiUrl: 'https://cms.example.com/v1',
    })
  })

  it('names the file, not the token, with --token-file; and has null URLs without a public URL', async () => {
    const project = initProject({ 'wrangler.jsonc': WRANGLER_JSONC })

    const { out } = await project.run(['--json', '--token-file', 'owner.token'])

    const file = join(project.cwd, 'owner.token')
    expect(JSON.parse(out[0] ?? '')).toEqual({
      site: 'blog',
      ownerId: 'usr_01M4QZQSG0040G2081040G2081',
      tokenId: 'tok_01M4QZQSG0081040G2081040G2',
      scopes: SCOPES,
      tokenFile: file,
      expiresAt: '2027-01-10T12:00:00.000Z',
      setupUrl: null,
      mcpUrl: null,
      readApiUrl: null,
    })
    expect(out[0]).not.toContain(SECRET)
  })

  it('prints one object for token create, with expiresAt null when it never expires', async () => {
    const cwd = temp.make({ 'wrangler.jsonc': WITH_URL })
    const wrangler = fakeWrangler(d1([{ id: 'blog' }], [{ id: 'usr_OWNER' }]), d1([]))

    const { code, out, err } = await run(['token', 'create', '--label', 'ci', '--read', '--json'], {
      cwd,
      wrangler: wrangler.run,
    })

    expect([code, err]).toEqual([0, []])
    expect(out).toHaveLength(1)
    expect(JSON.parse(out[0] ?? '')).toEqual({
      site: 'blog',
      tokenId: expect.stringMatching(/^tok_[0-9A-Z]{26}$/),
      kind: 'read',
      member: null,
      label: 'ci',
      scopes: ['content:read'],
      token: `hw_read_${'2'.repeat(52)}`,
      expiresAt: null,
      mcpUrl: 'https://cms.example.com/mcp',
      readApiUrl: 'https://cms.example.com/v1',
    })
  })

  it('prints one object for invite', async () => {
    const cwd = temp.make({ 'wrangler.jsonc': WITH_URL })
    const wrangler = fakeWrangler(d1([{ id: 'blog' }]), d1([]))

    const { code, out, err } = await run(
      ['invite', '--role', 'editor', '--email', 'Ada@Example.com', '--json'],
      {
        cwd,
        wrangler: wrangler.run,
      },
    )

    expect([code, err]).toEqual([0, []])
    expect(out.map((line) => JSON.parse(line))).toEqual([
      {
        site: 'blog',
        role: 'editor',
        userId: null,
        email: 'ada@example.com',
        expiresAt: '2026-10-19T12:00:00.000Z',
        setupUrl:
          'https://cms.example.com/setup#invitation=hw_inv_AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE',
      },
    ])
  })

  it('prints the checks of doctor, and keeps its exit code', async () => {
    const config = `{
  "compatibility_flags": ["no_nodejs_compat"],
  "vars": { "HOLLWARE_PUBLIC_URL": "http://localhost:5199" },
}`
    const cwd = temp.make({ 'wrangler.jsonc': config })
    const wrangler = fakeWrangler(ok('✅ No migrations to apply!'), d1([]))

    const { code, out, err } = await run(['doctor', '--json'], { cwd, wrangler: wrangler.run })

    expect(code).toBe(1)
    expect(err).toEqual([])
    expect(out).toHaveLength(1)
    const answer: {
      ok: boolean
      checks: { name: string; ok: boolean; message: string; fix: string }[]
    } = JSON.parse(out[0] ?? '')
    expect(answer.ok).toBe(false)
    expect(answer.checks).toEqual([
      {
        name: 'compatibility-flags',
        ok: false,
        message: 'compatibility_flags lacks no_nodejs_compat_v2, global_fetch_strictly_public',
        fix: 'Add "no_nodejs_compat_v2", "global_fetch_strictly_public" to compatibility_flags in wrangler.jsonc.',
      },
      {
        name: 'public-url',
        ok: true,
        message: 'HOLLWARE_PUBLIC_URL is http://localhost:5199',
        fix: '',
      },
      {
        name: 'd1-binding',
        ok: false,
        message: 'there is no D1 binding "DB"',
        fix: 'Add it to d1_databases in wrangler.jsonc, as the starter has it.',
      },
      {
        name: 'kv-binding',
        ok: false,
        message: 'there is no KV binding "OAUTH_KV", which the OAuth server needs',
        fix: 'Add { "binding": "OAUTH_KV" } to kv_namespaces in wrangler.jsonc.',
      },
      {
        name: 'media-bucket',
        ok: false,
        message: 'there is no R2 bucket "MEDIA", so upload_asset answers unavailable',
        fix: 'Add { "binding": "MEDIA", "bucket_name": "<name>-media" } to r2_buckets in wrangler.jsonc; hollware deploy creates the bucket.',
      },
      {
        name: 'backups-bucket',
        ok: true,
        message:
          'there is no R2 bucket "BACKUPS": the daily backups share the bucket of the images (add { "binding": "BACKUPS", "bucket_name": "<name>-backups" } to r2_buckets to keep them apart)',
        fix: '',
      },
      {
        name: 'images-binding',
        ok: true,
        message:
          'there is no Images binding "IMAGES": images are kept as they come, unconverted (add "images": { "binding": "IMAGES" } to convert them)',
        fix: '',
      },
      {
        name: 'cron',
        ok: false,
        message: 'there is no cron trigger, so scheduled entries are never published',
        fix: 'Add "triggers": { "crons": ["* * * * *"] } to wrangler.jsonc, as the starter has it.',
      },
      {
        name: 'events-queue',
        ok: false,
        message: 'there is no queue producer "EVENTS", so webhooks and IndexNow wait for the cron',
        fix: 'Add the producer { "binding": "EVENTS", "queue": "<name>-events" } and its consumer to queues in wrangler.jsonc, as the starter has them.',
      },
      {
        name: 'rate-limit',
        ok: false,
        message:
          'there is no rate limit "HOLLWARE_RATE_LIMIT", so sign-in and the token endpoint take any number of tries',
        fix: 'Add { "name": "HOLLWARE_RATE_LIMIT", "namespace_id": "1001", "simple": { "limit": 60, "period": 60 } } to ratelimits in wrangler.jsonc.',
      },
      {
        name: 'admin-assets',
        ok: false,
        message: 'the static assets do not hold the admin',
        fix: 'Install the dependencies; assets.directory of wrangler.jsonc must be "node_modules/@hollware/admin/dist/client".',
      },
      { name: 'migrations', ok: true, message: 'the local database has every migration', fix: '' },
      {
        name: 'owner',
        ok: false,
        message: 'the local database has no owner yet',
        fix: 'Run "hollware init --site <key> --local", with the key your site is to have, such as my-site.',
      },
    ])
  })

  it('prints ok: true for a doctor that finds nothing, with exit code 0', async () => {
    const cwd = temp.make({
      'wrangler.jsonc': `{
  "compatibility_flags": ["no_nodejs_compat", "no_nodejs_compat_v2", "global_fetch_strictly_public"],
  "assets": { "directory": "node_modules/@hollware/admin/dist/client" },
  "vars": { "HOLLWARE_PUBLIC_URL": "http://localhost:5199" },
  "kv_namespaces": [{ "binding": "OAUTH_KV" }],
  "r2_buckets": [{ "binding": "MEDIA", "bucket_name": "x-media" }],
  "triggers": { "crons": ["* * * * *"] },
  "queues": {
    "producers": [{ "binding": "EVENTS", "queue": "e" }],
    "consumers": [{ "queue": "e", "dead_letter_queue": "e-dlq" }, { "queue": "e-dlq" }],
  },
  "ratelimits": [{ "name": "HOLLWARE_RATE_LIMIT", "namespace_id": "1001", "simple": { "limit": 60, "period": 60 } }],
  "d1_databases": [{ "binding": "DB", "database_name": "x", "migrations_dir": "m" }],
}`,
      'm/0000_init.sql': 'CREATE TABLE t (id TEXT);',
      'node_modules/@hollware/admin/dist/client/admin/index.html': '<!doctype html>',
    })
    const wrangler = fakeWrangler(
      ok('✅ No migrations to apply!'),
      d1([{ id: 'usr_1', site: 'blog' }]),
    )

    const { code, out } = await run(['doctor', '--json'], { cwd, wrangler: wrangler.run })

    expect(code).toBe(0)
    expect(out.map((line) => JSON.parse(line))).toEqual([
      {
        ok: true,
        checks: expect.arrayContaining([
          { name: 'owner', ok: true, message: 'the local database has an owner', fix: '' },
        ]),
      },
    ])
  })
})
