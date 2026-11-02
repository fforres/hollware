/** Every operation that is not a read: each call of one is a line, whatever its outcome. */
export const OPERATION_AUDIT_ACTIONS = [
  'create_draft',
  'update_draft',
  'publish',
  'unpublish',
  'move_entry',
  'schedule_unpublish',
  'delete_entry',
  'restore_entry',
  'restore_revision',
  'approve_review',
  'request_review',
  'comment_review',
  'request_changes',
  'reject_review',
  'update_site',
  'set_collection',
  'create_site',
  'delete_site',
  'restore_site',
  'make_webhook_secret',
  'connect_analytics',
  'disconnect_analytics',
  'upload_asset',
  'update_asset',
] as const

export const IDENTITY_AUDIT_ACTIONS = [
  'token.create',
  'preview.create',
  'token.revoke',
  'member.role',
  'member.remove',
  'member.anonymize',
  'invitation.create',
  'invitation.revoke',
  'invitation.renew',
  'invitation.accept',
  'session.sign_in',
  'session.sign_out',
  'session.end_all',
  'passkey.add',
  'passkey.remove',
  'passkey.rename',
  'account.rename',
  'app.allow',
  'app.revoke',
  'app.refresh_reused',
  'event.abandon',
  'event.retry',
  'entry.purge',
  'schedule.publish',
  'schedule.unpublish',
  'agent.create',
  'agent.remove',
] as const

export const AUDIT_ACTIONS = [...OPERATION_AUDIT_ACTIONS, ...IDENTITY_AUDIT_ACTIONS] as const

export type AuditAction = (typeof AUDIT_ACTIONS)[number]

export const AUDIT_OUTCOMES = ['ok', 'denied', 'failed'] as const
export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number]

export const AUDIT_ACTOR_KINDS = ['user', 'token', 'oauth_client', 'system'] as const
export type AuditActorKind = (typeof AUDIT_ACTOR_KINDS)[number]

export function isAuditAction(value: string): value is AuditAction {
  return (AUDIT_ACTIONS as readonly string[]).includes(value)
}
