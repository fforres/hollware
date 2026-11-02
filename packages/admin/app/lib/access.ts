export type ProvisionRole = 'reviewer' | 'author' | 'editor'

export interface Access {
  readonly autoProvision: {
    readonly domains: string[]
    readonly emails: string[]
    readonly role: ProvisionRole
  } | null
}

export interface AccessForm {
  readonly on: boolean
  readonly domains: string
  readonly emails: string
  readonly role: ProvisionRole
}

export function accessForm(access: Access): AccessForm {
  const provision = access.autoProvision
  return {
    on: provision !== null,
    domains: provision?.domains.join('\n') ?? '',
    emails: provision?.emails.join('\n') ?? '',
    role: provision?.role ?? 'author',
  }
}

function listOf(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[\s,;]+/)
        .map((item) => item.trim().toLowerCase().replace(/^@/, ''))
        .filter((item) => item !== ''),
    ),
  ]
}

export function accessOf(form: AccessForm): Access | 'empty' {
  if (!form.on) return { autoProvision: null }
  const domains = listOf(form.domains)
  const emails = listOf(form.emails)
  if (domains.length === 0 && emails.length === 0) return 'empty'
  return { autoProvision: { domains, emails, role: form.role } }
}
