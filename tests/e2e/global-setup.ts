import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { createProject, SITE_KEY } from '../acceptance/v0.1/support/project.ts'
import { freePort } from '../conformance/processes.ts'

export default async function globalSetup(): Promise<() => Promise<void>> {
  const root = join(import.meta.dirname, '..', '..')
  execFileSync(join(root, 'apps', 'playground', 'node_modules', '.bin', 'vp'), ['build'], {
    cwd: join(root, 'apps', 'playground'),
    stdio: 'inherit',
  })
  const project = createProject()
  const migrated = await project.hollware('migrate', '--local')
  if (migrated.code !== 0) throw new Error(`migrate failed: ${migrated.output}`)
  const port = await freePort()
  const url = `http://localhost:${port}`
  const init = await project.hollware(
    'init',
    '--local',
    '--site',
    SITE_KEY,
    '--owner-name',
    'Olga',
    '--owner-email',
    'olga@example.com',
    '--url',
    url,
  )
  const link = /http:\/\/localhost:\d+\/setup#invitation=\S+/.exec(init.output)?.[0]
  if (init.code !== 0 || link === undefined) throw new Error(`init failed: ${init.output}`)
  const master = crypto.randomUUID() + crypto.randomUUID()
  await project.start({ hostname: 'localhost', port, vars: { HOLLWARE_SECRET: master } })
  process.env['HOLLWARE_E2E_URL'] = url
  process.env['HOLLWARE_E2E_SETUP'] = link
  return () => project.close()
}
