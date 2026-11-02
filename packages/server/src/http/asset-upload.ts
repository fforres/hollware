import { HollwareError, MAX_ASSET_BYTES, uploadAsset as uploadAssetSpec } from '@hollware/core'
import type { Hono } from 'hono'
import * as z from 'zod'
import { operationLine } from '../audit/operations.ts'
import { insufficientScope } from '../auth/index.ts'
import { missingScopes } from '../auth/scopes.ts'
import { describeError } from '../mcp/errors.ts'
import { statusOfRefusal, uploadStream } from '../ops/assets.ts'
import type { OperationContext } from '../ops/types.ts'
import type { OpsApiOptions } from './ops-api.ts'
import type { GatewayEnv } from './types.ts'

export type AssetUploadOptions = Omit<OpsApiOptions, 'handlers'>

const CLIENT = { name: 'hollware-upload' }

const described = z.strictObject({
  filename: uploadAssetSpec.input.shape.filename,
  alt: uploadAssetSpec.input.shape.alt,
})

const length = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive().safe())

const STATUS: Readonly<Record<string, number>> = { created: 201, exists: 200, unavailable: 503 }

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } })
}

const problem = (status: number, code: string, message: string, fix: string) =>
  json({ code, message, fix }, status)

export function installAssetUpload(app: Hono<GatewayEnv>, options: AssetUploadOptions): void {
  app.put('/v1/assets', async (c) =>
    options.protect(c, async (principal) => {
      const requestId = c.get('requestId')
      const site = options.sites.get(principal.site)
      if (site === undefined) throw new Error(`No site ${principal.site} for a checked token`)
      const audit = options.audit === undefined ? null : (await options.audit(c, principal))(CLIENT)
      const missing = missingScopes(principal, uploadAssetSpec.scopes)
      if (missing.length > 0) {
        const line = operationLine(uploadAssetSpec, null, site.key, {
          errorCode: 'insufficient_scope',
        })
        if (line !== null) await audit?.write(site, line)
        return insufficientScope(uploadAssetSpec.scopes, options.metadataUrl(c))
      }
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
      if (!declared.success) {
        return problem(
          411,
          'length_required',
          'The upload has no Content-Length, or not a whole number of bytes.',
          'Send the file as the body of the request with its Content-Length, as any HTTP client does for a file.',
        )
      }
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
      const context: OperationContext = {
        ...options.context(c, site, requestId),
        principal,
        view: 'head',
        client: CLIENT,
        requestId,
      }
      const audited = async (result: { output: unknown } | { errorCode: string }) => {
        const line = operationLine(uploadAssetSpec, query.data, site.key, result)
        if (line !== null) await audit?.write(site, line)
      }
      try {
        const result = await uploadStream(query.data, { body, length: declared.data }, context)
        const output = uploadAssetSpec.output.parse(result)
        await audited({ output })
        return json(
          output,
          output.outcome === 'refused' ? statusOfRefusal(result) : (STATUS[output.outcome] ?? 200),
        )
      } catch (error) {
        await audited({ errorCode: error instanceof HollwareError ? error.code : 'internal' })
        options.log({
          kind: 'request_error',
          requestId,
          method: 'PUT',
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
    }),
  )
}
