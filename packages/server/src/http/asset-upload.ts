import { HollwareError, MAX_ASSET_BYTES, uploadAsset as uploadAssetSpec } from '@hollware/core'
import type { ResolvedSite } from '@hollware/core'
import type { Context, Hono } from 'hono'
import * as z from 'zod'
import { operationLine } from '../audit/operations.ts'
import { insufficientScope } from '../auth/index.ts'
import { missingScopes } from '../auth/scopes.ts'
import { describeError } from '../mcp/errors.ts'
import { statusOfRefusal, uploadStream } from '../ops/assets.ts'
import type { OperationContext } from '../ops/types.ts'
import { abortUpload, finishUpload, startUpload, uploadPart } from '../ops/uploads.ts'
import type { OpsApiOptions } from './ops-api.ts'
import type { GatewayEnv } from './types.ts'

export type AssetUploadOptions = Omit<OpsApiOptions, 'handlers'>

const CLIENT = { name: 'hollware-upload' }

const described = z.strictObject({
  filename: uploadAssetSpec.input.shape.filename,
  alt: uploadAssetSpec.input.shape.alt,
})

const length = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive().safe())

const started = described.extend({ bytes: z.number().int().positive().safe() })

const finished = z.strictObject({
  parts: z
    .array(z.strictObject({ part: z.number().int().positive(), etag: z.string().min(1).max(200) }))
    .max(10_000),
})

const STATUS: Readonly<Record<string, number>> = {
  created: 201,
  exists: 200,
  started: 201,
  uploaded: 200,
  aborted: 200,
  unavailable: 503,
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } })
}

const problem = (status: number, code: string, message: string, fix: string) =>
  json({ code, message, fix }, status)

const answer = (result: { readonly outcome: string; readonly problem?: object | undefined }) =>
  json(
    result,
    result.outcome === 'refused' ? statusOfRefusal(result) : (STATUS[result.outcome] ?? 200),
  )

interface Writer {
  readonly site: ResolvedSite
  readonly context: OperationContext
  readonly audited: (
    input: unknown,
    result: { output: unknown } | { errorCode: string },
  ) => Promise<void>
}

const LENGTH_REQUIRED = problem.bind(
  null,
  411,
  'length_required',
  'The upload has no Content-Length, or not a whole number of bytes.',
  'Send the file as the body of the request with its Content-Length, as any HTTP client does for a file.',
)

export function installAssetUpload(app: Hono<GatewayEnv>, options: AssetUploadOptions): void {
  const asWriter = (
    c: Context<GatewayEnv>,
    proceed: (writer: Writer) => Promise<Response>,
  ): Promise<Response> =>
    options.protect(c, async (principal) => {
      const requestId = c.get('requestId')
      const site = options.sites.get(principal.site)
      if (site === undefined) throw new Error(`No site ${principal.site} for a checked token`)
      const audit = options.audit === undefined ? null : (await options.audit(c, principal))(CLIENT)
      const audited: Writer['audited'] = async (input, result) => {
        const line = operationLine(uploadAssetSpec, input, site.key, result)
        if (line !== null) await audit?.write(site, line)
      }
      if (missingScopes(principal, uploadAssetSpec.scopes).length > 0) {
        await audited(null, { errorCode: 'insufficient_scope' })
        return insufficientScope(uploadAssetSpec.scopes, options.metadataUrl(c))
      }
      const context: OperationContext = {
        ...options.context(c, site, requestId),
        principal,
        view: 'head',
        client: CLIENT,
        requestId,
      }
      try {
        return await proceed({ site, context, audited })
      } catch (error) {
        await audited(null, { errorCode: error instanceof HollwareError ? error.code : 'internal' })
        options.log({
          kind: 'request_error',
          requestId,
          method: c.req.method,
          path: c.req.path,
          detail: describeError(error),
        })
        return problem(
          500,
          'internal',
          'The upload failed on the server: nothing was kept.',
          `Try again. If it keeps failing, give the site operator this request id: ${requestId}.`,
        )
      }
    })

  app.put('/v1/assets', async (c) =>
    asWriter(c, async ({ site, context, audited }) => {
      const query = described.safeParse(c.req.query())
      if (!query.success) {
        return problem(
          400,
          'invalid_input',
          'The upload names no filename and alt, or one of them is too long.',
          'Give filename (1 to 200 characters) and alt (1 to 500) in the query: PUT /v1/assets?filename=launch.mp4&alt=What%20it%20shows.',
        )
      }
      const declared = length.safeParse(c.req.header('content-length'))
      if (!declared.success) return LENGTH_REQUIRED()
      const most = Math.max(site.media.maxBytes, MAX_ASSET_BYTES)
      if (declared.data > most) {
        return problem(
          413,
          'too_large',
          `The file is ${declared.data} bytes, more than the ${most} the site takes.`,
          'Make it smaller, or raise maxBytes in the media setting of the site with update_site.',
        )
      }
      const body = c.req.raw.body
      if (body === null) {
        return problem(
          400,
          'invalid_input',
          'The upload has no body.',
          'Send the file as the body.',
        )
      }
      const result = await uploadStream(query.data, { body, length: declared.data }, context)
      await audited(query.data, { output: uploadAssetSpec.output.parse(result) })
      return answer(result)
    }),
  )

  app.post('/v1/uploads', async (c) =>
    asWriter(c, async ({ context }) => {
      const input = started.safeParse(await c.req.json().catch(() => undefined))
      if (!input.success) {
        return problem(
          400,
          'invalid_input',
          'An upload in parts starts with the filename, the alt and the bytes of the file.',
          'Send { "filename": "launch.mp4", "alt": "What it shows", "bytes": 734003200 }.',
        )
      }
      return answer(await startUpload(input.data, context))
    }),
  )

  app.put('/v1/uploads/:id/parts/:part', async (c) =>
    asWriter(c, async ({ context }) => {
      const declared = length.safeParse(c.req.header('content-length'))
      const body = c.req.raw.body
      if (!declared.success || body === null) return LENGTH_REQUIRED()
      return answer(
        await uploadPart(
          c.req.param('id'),
          Number(c.req.param('part')),
          { body, length: declared.data },
          context,
        ),
      )
    }),
  )

  app.post('/v1/uploads/:id/complete', async (c) =>
    asWriter(c, async ({ context, audited }) => {
      const input = finished.safeParse(await c.req.json().catch(() => undefined))
      if (!input.success) {
        return problem(
          400,
          'invalid_input',
          'Finishing an upload in parts takes the list of its parts.',
          'Send { "parts": [{ "part": 1, "etag": "…" }, …] }, with the etag each PUT answered.',
        )
      }
      const result = await finishUpload(c.req.param('id'), input.data.parts, context)
      const output = uploadAssetSpec.output.parse(result)
      await audited({ filename: output.asset?.filename ?? c.req.param('id') }, { output })
      return answer(result)
    }),
  )

  app.delete('/v1/uploads/:id', async (c) =>
    asWriter(c, async ({ context }) => answer(await abortUpload(c.req.param('id'), context))),
  )
}
