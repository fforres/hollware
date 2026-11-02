import type { Role } from '../auth/roles.ts'
import { escapeHtml } from './pages.ts'

export type MailLanguage = 'en' | 'es'

export interface InvitationMail {
  readonly to: string
  readonly link: string
  readonly site: string
  readonly inviter: string
  readonly role: Exclude<Role, 'owner'>
  readonly expiresAt: string
  readonly language: MailLanguage
}

export interface Mailer {
  readonly send: (message: {
    readonly from: string
    readonly to: string
    readonly subject: string
    readonly text: string
    readonly html: string
  }) => Promise<unknown>
}

export type MailOutcome =
  | { readonly outcome: 'sent' | 'unavailable' }
  | { readonly outcome: 'failed'; readonly reason: string }

const WORDS = {
  en: {
    roles: {
      admin: 'an admin',
      editor: 'an editor',
      author: 'an author',
      reviewer: 'a reviewer',
    },
    subject: (inviter: string, site: string) => `${inviter} invited you to ${site} on Hollware`,
    body: (inviter: string, site: string, role: string) =>
      `${inviter} invited you to ${site} on Hollware, as ${role}.`,
    open: 'Accept the invitation',
    once: (until: string) => `The link works once, until ${until}.`,
    ignore: 'If you did not expect it, ignore this email: nothing happens without the link.',
  },
  es: {
    roles: {
      admin: 'admin',
      editor: 'editor',
      author: 'autor',
      reviewer: 'revisor',
    },
    subject: (inviter: string, site: string) => `${inviter} te invitó a ${site} en Hollware`,
    body: (inviter: string, site: string, role: string) =>
      `${inviter} te invitó a ${site} en Hollware, como ${role}.`,
    open: 'Aceptar la invitación',
    once: (until: string) => `El enlace funciona una vez, hasta el ${until}.`,
    ignore: 'Si no lo esperabas, ignora este correo: nada pasa sin el enlace.',
  },
} as const

function dateOf(iso: string, language: MailLanguage): string {
  return new Intl.DateTimeFormat(language, { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(iso),
  )
}

export function invitationMessage(mail: InvitationMail, from: string) {
  const words = WORDS[mail.language]
  const intro = words.body(mail.inviter, mail.site, words.roles[mail.role])
  const once = words.once(dateOf(mail.expiresAt, mail.language))
  return {
    from,
    to: mail.to,
    subject: words.subject(mail.inviter, mail.site),
    text: `${intro}\n\n${words.open}: ${mail.link}\n\n${once}\n${words.ignore}\n`,
    html: `<p>${escapeHtml(intro)}</p><p><a href="${escapeHtml(mail.link)}">${escapeHtml(words.open)}</a></p><p>${escapeHtml(once)}<br>${escapeHtml(words.ignore)}</p>`,
  }
}

export function languageOf(value: unknown): MailLanguage {
  return value === 'es' ? 'es' : 'en'
}

export async function sendInvitation(
  mailer: Mailer | undefined,
  from: string | undefined,
  mail: InvitationMail,
): Promise<MailOutcome> {
  if (mailer === undefined || from === undefined || from.trim() === '') {
    return { outcome: 'unavailable' }
  }
  try {
    await mailer.send(invitationMessage(mail, from.trim()))
    return { outcome: 'sent' }
  } catch (error) {
    return { outcome: 'failed', reason: error instanceof Error ? error.message : String(error) }
  }
}
