import { MULTIPART_PART_BYTES } from '@hollware/core'
import { env } from 'cloudflare:workers'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { seedToken } from '../auth/support.ts'
import { boot, NOW, PUBLIC_URL, restoreLogs, SITE_KEY } from './support.ts'

vi.setConfig({ testTimeout: 60_000 })

const LATER = '2026-11-11T12:00:00.000Z'

afterEach(() => {
  restoreLogs()
})

function video(size: number): Uint8Array {
  const bytes = new Uint8Array(size)
  bytes.set(new TextEncoder().encode('ftypisom'), 4)
  for (let at = 16; at < size; at += 4096) bytes[at] = (at / 4096) % 251
  return bytes
}

interface Started {
  readonly upload: { readonly id: string; readonly partBytes: number; readonly parts: number }
}

function client(worker: ReturnType<typeof boot>, token: string) {
  const send = (method: string, path: string, body: BodyInit | null, headers = {}) =>
    worker.sendRequest(new Request(new URL(path, PUBLIC_URL), { method, body, headers }), {
      token,
    })
  return {
    start: (bytes: number) =>
      send(
        'POST',
        '/v1/uploads',
        JSON.stringify({ filename: 'launch.mp4', alt: 'The launch', bytes }),
        { 'content-type': 'application/json' },
      ),
    part: (id: string, part: number, bytes: Uint8Array) =>
      send('PUT', `/v1/uploads/${id}/parts/${part}`, bytes, {
        'content-length': String(bytes.length),
      }),
    complete: (id: string, parts: readonly { part: number; etag: string }[]) =>
      send('POST', `/v1/uploads/${id}/complete`, JSON.stringify({ parts }), {
        'content-type': 'application/json',
      }),
    abort: (id: string) => send('DELETE', `/v1/uploads/${id}`, null),
  }
}

async function uploads(site: string): Promise<number> {
  const row = await env.DB.prepare('SELECT count(*) AS n FROM uploads WHERE site_id = ?')
    .bind(site)
    .first<{ n: number }>()
  return row?.n ?? 0
}

describe('an upload in parts', () => {
  it('streams each part to R2, and the asset it completes is the whole file', async () => {
    const writer = await seedToken(env.DB, SITE_KEY, { expiresAt: LATER })
    const worker = boot({ bindings: { MEDIA: env.MEDIA } })
    const file = video(MULTIPART_PART_BYTES + 4096)
    const api = client(worker, writer.token)

    const start = await api.start(file.length)
    const { upload } = await start.json<Started>()
    const one = await api.part(upload.id, 1, file.subarray(0, MULTIPART_PART_BYTES))
    const two = await api.part(upload.id, 2, file.subarray(MULTIPART_PART_BYTES))
    const etags = [
      { part: 1, etag: (await one.json<{ etag: string }>()).etag },
      { part: 2, etag: (await two.json<{ etag: string }>()).etag },
    ]
    const done = await api.complete(upload.id, etags)
    const asset = (await done.json<{ asset: { id: string; format: string; bytes: number } }>())
      .asset
    const tail = await worker.send(`/assets/${SITE_KEY}/${asset.id}`, {
      headers: { range: `bytes=${file.length - 4096}-` },
    })

    expect([start.status, upload.partBytes, upload.parts, one.status, two.status]).toEqual([
      201, 52428800, 2, 200, 200,
    ])
    expect([done.status, asset.format, asset.bytes]).toEqual([201, 'video/mp4', 52432896])
    expect(tail.status).toBe(206)
    expect(new Uint8Array(await tail.arrayBuffer())).toEqual(file.subarray(file.length - 4096))
    expect(await uploads(SITE_KEY)).toBe(0)
    expect((await env.MEDIA.list({ prefix: `uploads/${SITE_KEY}/` })).objects).toEqual([])
  })

  it('refuses a part of the wrong size or number, a list that misses one, and the upload of someone else', async () => {
    const writer = await seedToken(env.DB, SITE_KEY, { expiresAt: LATER })
    const other = await seedToken(env.DB, SITE_KEY, { expiresAt: LATER })
    const worker = boot({ bindings: { MEDIA: env.MEDIA } })
    const api = client(worker, writer.token)
    const { upload } = await (await api.start(MULTIPART_PART_BYTES + 10)).json<Started>()

    const short = await api.part(upload.id, 1, new Uint8Array(10))
    const statuses = [
      short.status,
      (await api.part(upload.id, 3, new Uint8Array(10))).status,
      (await api.complete(upload.id, [{ part: 2, etag: 'x' }])).status,
      (await client(worker, other.token).part(upload.id, 2, new Uint8Array(10))).status,
      (await api.start(104857601)).status,
    ]

    expect(statuses).toEqual([400, 400, 400, 404, 413])
    expect((await short.json<{ problem: { message: string } }>()).problem.message).toBe(
      'Part 1 is 10 bytes, and this upload expects 52428800.',
    )
    expect(await uploads(SITE_KEY)).toBe(1)
    await api.abort(upload.id)
  })

  it('aborts on DELETE, refuses an upload past its 24 hours, and the cron aborts it', async () => {
    const writer = await seedToken(env.DB, SITE_KEY, { expiresAt: LATER })
    const worker = boot({ bindings: { MEDIA: env.MEDIA } })
    const api = client(worker, writer.token)
    const { upload } = await (await api.start(1024)).json<Started>()
    const abandoned = (await (await api.start(2048)).json<Started>()).upload

    const aborted = await api.abort(upload.id)
    const after = await api.part(upload.id, 1, new Uint8Array(1024))
    expect([aborted.status, after.status]).toEqual([200, 404])
    const kept = (await (await api.start(512)).json<Started>()).upload
    worker.clock.set(new Date(Date.parse(NOW) + 25 * 3_600_000).toISOString())
    const expired = await api.part(kept.id, 1, new Uint8Array(512))
    await worker.worker.scheduled(
      { scheduledTime: Date.parse(NOW), cron: '* * * * *', noRetry: () => undefined },
      worker.env,
      worker.ctx,
    )
    await worker.settle()
    worker.clock.set(NOW)
    const gone = await api.part(abandoned.id, 1, new Uint8Array(2048))

    expect([expired.status, gone.status]).toEqual([404, 404])
    expect(await uploads(SITE_KEY)).toBe(0)
  })
})
