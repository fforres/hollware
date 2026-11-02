import { describe, expect, it } from 'vite-plus/test'

import { senderOf } from '../../src/identity/invitation-mail.ts'

describe('the sender of an invitation', () => {
  it('splits a name and an address, as Email Service takes them, and keeps a bare address', () => {
    expect([
      senderOf('Hollware <cms@hollware.com>'),
      senderOf('"Hollware CMS" <cms@hollware.com>'),
      senderOf('<cms@hollware.com>'),
      senderOf(' cms@hollware.com '),
    ]).toEqual([
      { name: 'Hollware', email: 'cms@hollware.com' },
      { name: 'Hollware CMS', email: 'cms@hollware.com' },
      'cms@hollware.com',
      'cms@hollware.com',
    ])
  })
})
