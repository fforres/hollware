import type { AuditLogEntry } from '../audit/log.ts'
import type { HollwareEnv } from '../index.ts'
import type { Refusal } from '../oauth/server.ts'

export type GatewayEnv = {
  Bindings: HollwareEnv
  Variables: {
    requestId: string
    site: string
  }
}

export interface AuthRefusedLog {
  readonly kind: 'auth_refused'
  readonly requestId: string
  readonly reason: 'no_token' | Refusal
}

export interface RequestErrorLog {
  readonly kind: 'request_error'
  readonly requestId: string
  readonly method: string
  readonly path: string
  readonly detail: string
}

export interface EnqueueFailedLog {
  readonly kind: 'enqueue_failed'
  readonly requestId: string
  readonly message: string
}

export interface OAuthErrorLog {
  readonly kind: 'oauth_error'
  readonly code: string
  readonly reason: string | null
}

export interface RateLimitedLog {
  readonly kind: 'rate_limited'
  readonly requestId: string
  readonly route: string
}

export type GatewayLogEntry =
  | AuthRefusedLog
  | RequestErrorLog
  | EnqueueFailedLog
  | OAuthErrorLog
  | RateLimitedLog
  | RefreshReusedLog
  | FederationRefusedLog
  | InvitationMailFailedLog
  | AuditLogEntry

export interface RefreshReusedLog {
  readonly kind: 'refresh_reused'
  readonly requestId: string
  readonly grantId: string
}

export interface FederationRefusedLog {
  readonly kind: 'federation_refused'
  readonly requestId: string
  readonly provider: string
  readonly reason: string
}

export interface InvitationMailFailedLog {
  readonly kind: 'invitation_mail_failed'
  readonly requestId: string
  readonly invitation: string
  readonly reason: string
}
