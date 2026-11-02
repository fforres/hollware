import { FORMER_PERSON } from '@hollware/core'

export function personName(id: string, name: string | null, former: string): string {
  return id === FORMER_PERSON ? former : (name ?? id)
}

export const ROLES = ['owner', 'admin', 'editor', 'author', 'reviewer'] as const

export type InvitedRole = 'admin' | 'editor' | 'author' | 'reviewer'

export function invitationBody(
  role: InvitedRole,
  email: string,
  language: string,
): { role: InvitedRole; email: string; language: string } {
  return { role, email: email.trim(), language }
}

export type InvitationAnswer =
  | { readonly sent: true; readonly email: string | null }
  | { readonly sent: false; readonly email: string | null; readonly link: string }

export type InvitationNotice =
  | { readonly kind: 'sent'; readonly email: string }
  | { readonly kind: 'link'; readonly link: string; readonly failed: boolean }

export function invitationNotice(answer: InvitationAnswer, mails: boolean): InvitationNotice {
  if (answer.sent) return { kind: 'sent', email: answer.email ?? '' }
  return { kind: 'link', link: answer.link, failed: mails && answer.email !== null }
}

export function rolesFor(scopes: readonly string[], current: string): readonly string[] {
  if (scopes.includes('site:owner')) return ROLES
  if (!scopes.includes('schema:admin') || current === 'owner') return []
  return ROLES.filter((role) => role !== 'owner')
}

export function byKind<Member extends { readonly kind?: 'person' | 'agent' }>(
  members: readonly Member[],
): { people: Member[]; agents: Member[] } {
  return {
    people: members.filter((member) => member.kind !== 'agent'),
    agents: members.filter((member) => member.kind === 'agent'),
  }
}
