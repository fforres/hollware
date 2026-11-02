import { HollwareError, newId } from '@hollware/core'
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server'
import { isoBase64URL } from '@simplewebauthn/server/helpers'
import type { Db } from '../db/d1.ts'
import { userHandle } from './secrets.ts'
import {
  addMember,
  addPasskey,
  createSession,
  createUser,
  findInvitation,
  findPasskey,
  passkeysOf,
  redeemInvitation,
  saveChallenge,
  takeChallenge,
  touchPasskey,
  userWithAddress,
  waitingInvitation,
  type Invitation,
} from './store.ts'

export interface Ceremony {
  readonly db: Db
  readonly publicUrl: string
  readonly now: Date
}

const SESSION_HOURS = 12

function relyingParty(ceremony: Ceremony) {
  const url = new URL(ceremony.publicUrl)
  return { id: url.hostname, origin: url.origin }
}

function refused(message: string, fix: string): HollwareError {
  return new HollwareError('invalid_input', message, fix)
}

const NOT_VALID = refused.bind(
  null,
  'This link is not valid: it was used already, it expired or it was revoked.',
  'Ask an owner or an admin of the site for a new invitation.',
)

async function newcomerAddress(db: Db, invitation: Invitation): Promise<string> {
  if (invitation.email === null) {
    throw refused(
      'This invitation names no email address.',
      'Ask an owner or an admin of the site for a new invitation.',
    )
  }
  if ((await userWithAddress(db, invitation.email)) !== null) {
    throw refused(
      'This address already has an account in this Hollware.',
      'Accept the invitation with the passkey of that account instead of making a new one.',
    )
  }
  return invitation.email
}

async function unlessThrown<T extends { verified: boolean }>(
  verify: () => Promise<T>,
): Promise<T | { verified: false }> {
  try {
    return await verify()
  } catch {
    return { verified: false }
  }
}

export async function registrationOptions(ceremony: Ceremony, invitationSecret: string) {
  const invitation = await findInvitation(ceremony.db, invitationSecret, ceremony.now)
  if (invitation === null) throw NOT_VALID()
  if (invitation.userId === null) await newcomerAddress(ceremony.db, invitation)
  const userId = invitation.userId ?? newId('usr')
  const existing =
    invitation.userId === null ? [] : await passkeysOf(ceremony.db, invitation.userId)
  const rp = relyingParty(ceremony)
  const options = await generateRegistrationOptions({
    rpName: 'Hollware',
    rpID: rp.id,
    userName: userId,
    userID: userHandle(userId),
    attestationType: 'none',
    excludeCredentials: existing.map((passkey) => ({ id: passkey.credentialId })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
  })
  const challengeId = await saveChallenge(ceremony.db, {
    challenge: options.challenge,
    purpose: 'register',
    invitationId: invitation.id,
    userId,
    now: ceremony.now,
  })
  return { challengeId, options }
}

export async function verifyRegistration(
  ceremony: Ceremony,
  input: {
    readonly challengeId: string
    readonly response: RegistrationResponseJSON
    readonly name: string
    readonly label: string
  },
): Promise<{ userId: string; session: string }> {
  const challenge = await takeChallenge(ceremony.db, {
    id: input.challengeId,
    purpose: 'register',
    now: ceremony.now,
  })
  if (challenge === null || challenge.invitationId === null || challenge.userId === null) {
    throw refused('The registration expired.', 'Start again from the link.')
  }
  const rp = relyingParty(ceremony)
  const verified = await unlessThrown(() =>
    verifyRegistrationResponse({
      response: input.response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.id,
      requireUserVerification: true,
    }),
  )
  if (!verified.verified) throw refused('The passkey could not be verified.', 'Try again.')
  const invitation = await waitingInvitation(ceremony.db, challenge.invitationId, ceremony.now)
  if (invitation === null) throw NOT_VALID()
  const email = invitation.userId === null ? await newcomerAddress(ceremony.db, invitation) : null
  if (!(await redeemInvitation(ceremony.db, invitation.id, ceremony.now))) throw NOT_VALID()
  if (email !== null) {
    await createUser(ceremony.db, {
      id: challenge.userId,
      name: input.name.trim() === '' ? 'Unnamed' : input.name.trim(),
      role: invitation.role,
      site: invitation.site,
      now: ceremony.now,
      email,
      verified: invitation.sentAt !== null,
    })
  }
  const { credential } = verified.registrationInfo
  await addPasskey(ceremony.db, {
    userId: challenge.userId,
    credentialId: credential.id,
    publicKey: isoBase64URL.fromBuffer(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports ?? [],
    label: input.label.trim() === '' ? 'Passkey' : input.label.trim(),
    now: ceremony.now,
  })
  const session = await createSession(ceremony.db, {
    userId: challenge.userId,
    now: ceremony.now,
    hours: SESSION_HOURS,
  })
  return { userId: challenge.userId, session: session.secret }
}

async function assertionOptions(
  ceremony: Ceremony,
  purpose: 'authenticate' | 'accept',
  invitationId: string | null,
) {
  const rp = relyingParty(ceremony)
  const options = await generateAuthenticationOptions({
    rpID: rp.id,
    userVerification: 'preferred',
  })
  const challengeId = await saveChallenge(ceremony.db, {
    challenge: options.challenge,
    purpose,
    invitationId,
    userId: null,
    now: ceremony.now,
  })
  return { challengeId, options }
}

async function assertedPerson(
  ceremony: Ceremony,
  purpose: 'authenticate' | 'accept',
  input: { readonly challengeId: string; readonly response: AuthenticationResponseJSON },
): Promise<{ userId: string; invitationId: string | null }> {
  const challenge = await takeChallenge(ceremony.db, {
    id: input.challengeId,
    purpose,
    now: ceremony.now,
  })
  if (challenge === null) throw refused('The sign-in expired.', 'Sign in again.')
  const passkey = await findPasskey(ceremony.db, input.response.id)
  if (passkey === null) {
    throw refused('This passkey is not one of this Hollware.', 'Use a passkey you registered here.')
  }
  const rp = relyingParty(ceremony)
  const verified = await unlessThrown(() =>
    verifyAuthenticationResponse({
      response: input.response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.id,
      requireUserVerification: true,
      credential: {
        id: passkey.credentialId,
        publicKey: isoBase64URL.toBuffer(passkey.publicKey),
        counter: passkey.counter,
        transports: JSON.parse(passkey.transports),
      },
    }),
  )
  if (!verified.verified) throw refused('The passkey could not be verified.', 'Try again.')
  await touchPasskey(ceremony.db, passkey.id, verified.authenticationInfo.newCounter, ceremony.now)
  return { userId: passkey.userId, invitationId: challenge.invitationId }
}

async function sessionOf(ceremony: Ceremony, userId: string) {
  const session = await createSession(ceremony.db, {
    userId,
    now: ceremony.now,
    hours: SESSION_HOURS,
  })
  return { userId, session: session.secret }
}

export async function authenticationOptions(ceremony: Ceremony) {
  return assertionOptions(ceremony, 'authenticate', null)
}

export async function verifyAuthentication(
  ceremony: Ceremony,
  input: { readonly challengeId: string; readonly response: AuthenticationResponseJSON },
): Promise<{ userId: string; session: string }> {
  const { userId } = await assertedPerson(ceremony, 'authenticate', input)
  return sessionOf(ceremony, userId)
}

export async function acceptanceOptions(ceremony: Ceremony, invitationSecret: string) {
  const invitation = await findInvitation(ceremony.db, invitationSecret, ceremony.now)
  if (invitation === null) throw NOT_VALID()
  return assertionOptions(ceremony, 'accept', invitation.id)
}

export async function verifyAcceptance(
  ceremony: Ceremony,
  input: { readonly challengeId: string; readonly response: AuthenticationResponseJSON },
): Promise<{ userId: string; session: string; site: string }> {
  const { userId, invitationId } = await assertedPerson(ceremony, 'accept', input)
  const invitation =
    invitationId === null ? null : await waitingInvitation(ceremony.db, invitationId, ceremony.now)
  if (invitation === null) throw NOT_VALID()
  if (invitation.userId !== null && invitation.userId !== userId) {
    throw refused(
      'This link is for another person of this Hollware.',
      'Use the passkey of the person the invitation names, or ask for an invitation of your own.',
    )
  }
  if (!(await redeemInvitation(ceremony.db, invitation.id, ceremony.now))) throw NOT_VALID()
  await addMember(ceremony.db, {
    site: invitation.site,
    userId,
    role: invitation.role,
    now: ceremony.now,
  })
  return { ...(await sessionOf(ceremony, userId)), site: invitation.site }
}

export async function enrollmentOptions(ceremony: Ceremony, userId: string) {
  const existing = await passkeysOf(ceremony.db, userId)
  const rp = relyingParty(ceremony)
  const options = await generateRegistrationOptions({
    rpName: 'Hollware',
    rpID: rp.id,
    userName: userId,
    userID: userHandle(userId),
    attestationType: 'none',
    excludeCredentials: existing.map((passkey) => ({ id: passkey.credentialId })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
  })
  const challengeId = await saveChallenge(ceremony.db, {
    challenge: options.challenge,
    purpose: 'enroll',
    invitationId: null,
    userId,
    now: ceremony.now,
  })
  return { challengeId, options }
}

export async function verifyEnrollment(
  ceremony: Ceremony,
  userId: string,
  input: {
    readonly challengeId: string
    readonly response: RegistrationResponseJSON
    readonly label: string
  },
): Promise<{ id: string }> {
  const challenge = await takeChallenge(ceremony.db, {
    id: input.challengeId,
    purpose: 'enroll',
    now: ceremony.now,
  })
  if (challenge === null || challenge.userId !== userId) {
    throw refused('Adding the passkey expired.', 'Start again.')
  }
  const rp = relyingParty(ceremony)
  const verified = await unlessThrown(() =>
    verifyRegistrationResponse({
      response: input.response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.id,
      requireUserVerification: true,
    }),
  )
  if (!verified.verified) throw refused('The passkey could not be verified.', 'Try again.')
  const { credential } = verified.registrationInfo
  return {
    id: await addPasskey(ceremony.db, {
      userId,
      credentialId: credential.id,
      publicKey: isoBase64URL.fromBuffer(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ?? [],
      label: input.label.trim() === '' ? 'Passkey' : input.label.trim().slice(0, 100),
      now: ceremony.now,
    }),
  }
}
