import { MULTIPART_PART_BYTES, type OperationByName, type OperationName } from '@hollware/core'
import type * as z from 'zod'
import { en, type Messages } from '../i18n/en.ts'
import type { Auth } from './auth.ts'

export type Input<Name extends OperationName> = z.input<OperationByName<Name>['input']>
export type Output<Name extends OperationName> = z.output<OperationByName<Name>['output']>

export class ApiError extends Error {
  override readonly name = 'ApiError'
  readonly code: string
  readonly fix: string

  constructor(code: string, message: string, fix: string) {
    super(message)
    this.code = code
    this.fix = fix
  }
}

export interface ApiDeps {
  readonly fetch: typeof fetch
  readonly auth: Auth
  readonly here: () => string
  readonly text?: () => Messages['api']
  readonly written?: () => void
}

export const READS: ReadonlySet<OperationName> = new Set<OperationName>([
  'content_stats',
  'describe_site',
  'get_analytics',
  'get_asset',
  'get_entry',
  'get_review',
  'get_revision',
  'get_structure',
  'get_translations',
  'list_assets',
  'list_backups',
  'list_entries',
  'list_redirects',
  'list_reviews',
  'list_revisions',
  'search',
  'validate',
])

interface StartedUpload {
  readonly upload: { readonly id: string; readonly partBytes: number; readonly parts: number }
}

interface Problem {
  readonly code?: string
  readonly message?: string
  readonly fix?: string
}

function pageLeftForSignIn(): Promise<never> {
  return new Promise<never>(() => {})
}

export function createApi(deps: ApiDeps) {
  const text = deps.text ?? (() => en.api)
  async function sendFor<Answer>(
    path: string,
    init: RequestInit,
    read: (response: Response) => Promise<Answer>,
  ): Promise<Answer> {
    const token = await deps.auth.token()
    if (token === null) {
      await deps.auth.signIn(deps.here())
      return pageLeftForSignIn()
    }
    const headers = new Headers(init.headers)
    headers.set('authorization', `Bearer ${token}`)
    const response = await deps.fetch(path, { ...init, headers })
    if (response.status === 401) {
      deps.auth.forget()
      await deps.auth.signIn(deps.here())
      return pageLeftForSignIn()
    }
    if (response.ok) return read(response)
    const body: unknown = await response.json()
    const answer = (body ?? {}) as Problem & { problem?: Problem }
    const error = answer.problem ?? answer
    throw new ApiError(
      error.code ?? 'internal',
      error.message ?? text().answered(response.status),
      error.fix ?? text().tryAgain,
    )
  }
  const send = (path: string, init: RequestInit): Promise<unknown> =>
    sendFor(path, init, (response) => response.json() as Promise<unknown>)
  async function write<Answer>(answer: Promise<Answer>): Promise<Answer> {
    const done = await answer
    deps.written?.()
    return done
  }

  return {
    async call<Name extends OperationName>(
      name: Name,
      input: Input<Name>,
      signal?: AbortSignal,
    ): Promise<Output<Name>> {
      const answer = send(`/v1/ops/${name}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
        ...(signal === undefined ? {} : { signal }),
      }) as Promise<Output<Name>>
      return READS.has(name) ? answer : write(answer)
    },

    async upload(
      file: Blob,
      described: { readonly filename: string; readonly alt: string },
    ): Promise<Output<'upload_asset'>> {
      if (file.size <= MULTIPART_PART_BYTES) {
        const query = new URLSearchParams({ filename: described.filename, alt: described.alt })
        return write(
          send(`/v1/assets?${query.toString()}`, { method: 'PUT', body: file }) as Promise<
            Output<'upload_asset'>
          >,
        )
      }
      const { upload } = (await send('/v1/uploads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...described, bytes: file.size }),
      })) as StartedUpload
      const at = `/v1/uploads/${encodeURIComponent(upload.id)}`
      try {
        const parts: { part: number; etag: string }[] = []
        for (let part = 1; part <= upload.parts; part++) {
          const body = file.slice((part - 1) * upload.partBytes, part * upload.partBytes)
          const sent = (await send(`${at}/parts/${part}`, { method: 'PUT', body })) as {
            etag: string
          }
          parts.push({ part, etag: sent.etag })
        }
        return await write(
          send(`${at}/complete`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ parts }),
          }) as Promise<Output<'upload_asset'>>,
        )
      } catch (error) {
        await send(at, { method: 'DELETE' }).catch(() => undefined)
        throw error
      }
    },

    async file(path: string): Promise<Blob> {
      return sendFor(`/v1/admin/${path}`, { method: 'GET' }, (response) => response.blob())
    },

    async backup(date: string): Promise<Blob> {
      return sendFor(`/v1/backups/${encodeURIComponent(date)}`, { method: 'GET' }, (response) =>
        response.blob(),
      )
    },

    async admin<Answer>(path: string, body?: unknown, signal?: AbortSignal): Promise<Answer> {
      if (body === undefined) {
        return (await send(`/v1/admin/${path}`, {
          method: 'GET',
          ...(signal === undefined ? {} : { signal }),
        })) as Answer
      }
      return write(
        send(`/v1/admin/${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }) as Promise<Answer>,
      )
    },

    async adminDelete<Answer>(path: string): Promise<Answer> {
      return write(send(`/v1/admin/${path}`, { method: 'DELETE' }) as Promise<Answer>)
    },
  }
}

export type Api = ReturnType<typeof createApi>
