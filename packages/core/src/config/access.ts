import type { Problems } from './config-error.ts'
import type { ProvisionRole, ResolvedAccess } from './types.ts'
import { isRecord, itemPath, keyPath, quote, wrongType } from './values.ts'

const DOMAIN =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/
const LOCAL = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}$/

export const NO_ACCESS: ResolvedAccess = { autoProvision: null }

/** An email address in lowercase, or `null` when the text is no plain address. */
export function emailAddress(value: string): string | null {
  const lower = value.trim().toLowerCase()
  const at = lower.lastIndexOf('@')
  if (at <= 0) return null
  const local = lower.slice(0, at)
  const domain = lower.slice(at + 1)
  return LOCAL.test(local) && DOMAIN.test(domain) ? `${local}@${domain}` : null
}

/** Whether the provisioning of a site lets in the address, by itself or by its domain. */
export function admitsEmail(access: ResolvedAccess, email: string): boolean {
  const provision = access.autoProvision
  const address = emailAddress(email)
  if (provision === null || address === null) return false
  const domain = address.slice(address.lastIndexOf('@') + 1)
  return provision.emails.includes(address) || provision.domains.includes(domain)
}

function readList(
  path: string,
  raw: unknown,
  read: (value: string) => string | null,
  what: string,
  fix: string,
  problems: Problems,
): string[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) {
    problems.add(path, wrongType(raw, 'an array'), fix)
    return []
  }
  const values: string[] = []
  const items: readonly unknown[] = raw
  items.forEach((item, index) => {
    const value = typeof item === 'string' ? read(item) : null
    if (value === null) {
      problems.add(
        itemPath(path, index),
        typeof item === 'string' ? `${quote(item)} is not ${what}` : wrongType(item, what),
        fix,
      )
      return
    }
    if (!values.includes(value)) values.push(value)
  })
  return values
}

const ACCESS_FIX =
  'Declare it as { autoProvision: { domains: ["example.com"], emails: [], role: "author" } }, or { autoProvision: null }.'

export function readAccess(path: string, raw: unknown, problems: Problems): ResolvedAccess {
  if (raw === undefined) return NO_ACCESS
  if (!isRecord(raw)) {
    problems.add(path, wrongType(raw, 'an object'), ACCESS_FIX)
    return NO_ACCESS
  }
  const provision = raw['autoProvision']
  if (provision === undefined || provision === null) return NO_ACCESS
  const at = keyPath(path, 'autoProvision')
  if (!isRecord(provision)) {
    problems.add(at, wrongType(provision, 'an object or null'), ACCESS_FIX)
    return NO_ACCESS
  }
  const domains = readList(
    keyPath(at, 'domains'),
    provision['domains'],
    (value) => (DOMAIN.test(value.trim().toLowerCase()) ? value.trim().toLowerCase() : null),
    'a domain',
    'Write each domain as it follows the @ of an address, such as "example.com".',
    problems,
  )
  const emails = readList(
    keyPath(at, 'emails'),
    provision['emails'],
    emailAddress,
    'an email address',
    'Write each address in full, such as "ada@example.com".',
    problems,
  )
  const rawRole = provision['role']
  let role: ProvisionRole = 'author'
  if (rawRole === 'reviewer' || rawRole === 'author' || rawRole === 'editor') role = rawRole
  else if (rawRole !== undefined) {
    problems.add(
      keyPath(at, 'role'),
      wrongType(rawRole, '"reviewer", "author" or "editor"'),
      'An owner or an admin is only ever made by a person: use "reviewer", "author" or "editor".',
    )
  }
  if (domains.length === 0 && emails.length === 0) {
    problems.add(
      at,
      'lets nobody in: it lists no domain and no address',
      'List the domains or the addresses to let in, or set autoProvision to null.',
    )
    return NO_ACCESS
  }
  return { autoProvision: { domains, emails, role } }
}
