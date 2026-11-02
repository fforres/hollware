import { FORMER_PERSON } from '@hollware/core'
import { describe, expect, it } from 'vite-plus/test'

import {
  byKind,
  invitationBody,
  invitationNotice,
  personName,
  rolesFor,
} from '../app/lib/people.ts'

describe('the name the admin gives a person', () => {
  it('is their name, else their id, and the former member for one an owner anonymized', () => {
    expect([
      personName('usr_1', 'Olga', 'A former member'),
      personName('usr_1', null, 'A former member'),
      personName(FORMER_PERSON, 'Former member', 'Un antiguo miembro'),
    ]).toEqual(['Olga', 'usr_1', 'Un antiguo miembro'])
  })
})

describe('the body of an invitation', () => {
  it('names the address the person was given, without its spaces', () => {
    expect(invitationBody('reviewer', ' ada@example.org ', 'es')).toEqual({
      role: 'reviewer',
      email: 'ada@example.org',
      language: 'es',
    })
  })
})

describe('what the admin says once it invites', () => {
  it('names the address it was mailed to, or shows the link, and says when the mail failed', () => {
    expect([
      invitationNotice({ sent: true, email: 'ada@example.org' }, true),
      invitationNotice({ sent: false, email: 'ada@example.org', link: 'L' }, true),
      invitationNotice({ sent: false, email: 'ada@example.org', link: 'L' }, false),
      invitationNotice({ sent: false, email: null, link: 'L' }, true),
    ]).toEqual([
      { kind: 'sent', email: 'ada@example.org' },
      { kind: 'link', link: 'L', failed: true },
      { kind: 'link', link: 'L', failed: false },
      { kind: 'link', link: 'L', failed: false },
    ])
  })
})

describe('the roles a person may give a member', () => {
  it('are every role for an owner, all but owner for an admin over a non-owner, and none otherwise', () => {
    const owner = ['schema:admin', 'site:owner']
    const admin = ['schema:admin']
    expect([
      rolesFor(owner, 'owner'),
      rolesFor(admin, 'editor'),
      rolesFor(admin, 'owner'),
      rolesFor(['content:publish'], 'author'),
    ]).toEqual([
      ['owner', 'admin', 'editor', 'author', 'reviewer'],
      ['admin', 'editor', 'author', 'reviewer'],
      [],
      [],
    ])
  })
})

describe('the members of a site', () => {
  it('splits agents from people, and takes a member of an older server for a person', () => {
    const members = [
      { id: 'usr_1', kind: 'person' as const },
      { id: 'usr_2', kind: 'agent' as const },
      { id: 'usr_3' },
    ]
    expect(byKind(members)).toEqual({
      people: [{ id: 'usr_1', kind: 'person' }, { id: 'usr_3' }],
      agents: [{ id: 'usr_2', kind: 'agent' }],
    })
  })
})
