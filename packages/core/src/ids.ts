const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** The kinds of ids and their prefixes. A new kind adds its prefix here. */
export const ID_PREFIXES = {
  agentGrant: 'agt',
  agentRun: 'rar',
  analytics: 'ana',
  anonymization: 'anm',
  asset: 'ast',
  auditLine: 'aud',
  challenge: 'chl',
  delivery: 'dlv',
  embedding: 'emb',
  entry: 'ent',
  event: 'evt',
  identity: 'idn',
  invitation: 'inv',
  member: 'mbr',
  passkey: 'pky',
  publication: 'pub',
  purge: 'prg',
  redirect: 'rdr',
  revision: 'rev',
  revisionTag: 'tag',
  review: 'rvw',
  reviewComment: 'rvc',
  reviewItem: 'rvi',
  schedule: 'sch',
  session: 'ses',
  siteChange: 'sit',
  siteSecret: 'sec',
  token: 'tok',
  unpublish: 'unp',
  upload: 'upl',
  user: 'usr',
} as const

export type IdPrefix = (typeof ID_PREFIXES)[keyof typeof ID_PREFIXES]

/** Who a site names where it named a person its owner anonymized: who they were is gone. */
export const FORMER_PERSON = 'usr_00000000000000000000000000'

const LARGEST_TIME = 2 ** 48 - 1

/**
 * A ULID for the given time and 10 random bytes. Both default to now and to fresh randomness
 * from `crypto.getRandomValues`; tests pass their own.
 */
export function ulid(
  time: number = Date.now(),
  random: Uint8Array = crypto.getRandomValues(new Uint8Array(10)),
): string {
  if (!Number.isInteger(time) || time < 0 || time > LARGEST_TIME) {
    throw new RangeError(
      `a ULID time is a whole number of milliseconds from 0 to 2^48 - 1, got ${time}`,
    )
  }
  if (random.length !== 10) {
    throw new RangeError(`a ULID takes 10 random bytes, got ${random.length}`)
  }
  let timePart = ''
  let rest = time
  for (let i = 0; i < 10; i += 1) {
    timePart = CROCKFORD.charAt(rest % 32) + timePart
    rest = Math.floor(rest / 32)
  }
  let randomPart = ''
  let buffer = 0
  let bits = 0
  for (const byte of random) {
    buffer = (buffer << 8) | byte
    bits += 8
    while (bits >= 5) {
      bits -= 5
      randomPart += CROCKFORD.charAt((buffer >>> bits) & 31)
    }
    buffer &= (1 << bits) - 1
  }
  return timePart + randomPart
}

/** A new id of the given kind: `newId('ent')` → `ent_01JAB…`. */
export function newId(prefix: IdPrefix): string {
  return `${prefix}_${ulid()}`
}

const ID_PATTERN = /^([a-z]{3})_[0-9A-HJKMNP-TV-Z]{26}$/

/** Whether a string is an id of the given kind. */
export function isId(prefix: IdPrefix, value: string): boolean {
  const match = ID_PATTERN.exec(value)
  return match !== null && match[1] === prefix
}
