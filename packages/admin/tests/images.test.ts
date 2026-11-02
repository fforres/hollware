import { describe, expect, it } from 'vite-plus/test'

import { ASSET_FORMATS } from '@hollware/core'
import { ACCEPTED_FILES, kindOf, markdownOf, needsAssets } from '../app/lib/images.ts'

const red = 'asset:ast_0123456789abcdef0123456789'
const blue = 'asset:ast_fedcba9876543210fedcba9876'

describe('when the editor reads the library to show the images of an entry', () => {
  it('reads it for a reference it has no address of', () => {
    expect(needsAssets(`![a](${red})`, new Map())).toBe(true)
    expect(needsAssets(`![a](${red})\n\n![b](${blue})`, new Map([[red, '/assets/s/red']]))).toBe(
      true,
    )
  })

  it('leaves it alone when it knows every reference, or the body names none', () => {
    expect(needsAssets(`![a](${red})`, new Map([[red, '/assets/s/red']]))).toBe(false)
    expect(needsAssets('![a](https://example.com/a.png) asset:', new Map())).toBe(false)
  })
})

describe('what the library shows of a file, and how an entry names it', () => {
  it('tells an image, a video and a PDF apart by the format the server gives', () => {
    expect(
      ['image/webp', 'image/svg+xml', 'video/mp4', 'video/webm', 'application/pdf'].map(kindOf),
    ).toEqual(['image', 'image', 'video', 'video', 'pdf'])
  })

  it('shows an image in Markdown and links a video or a PDF, with no bracket of its alt', () => {
    expect(markdownOf({ alt: 'A red [door]', reference: red, format: 'image/webp' })).toBe(
      `![A red door](${red})`,
    )
    expect(markdownOf({ alt: 'The launch', reference: blue, format: 'video/mp4' })).toBe(
      `[The launch](${blue})`,
    )
    expect(markdownOf({ alt: 'The policy', reference: red, format: 'application/pdf' })).toBe(
      `[The policy](${red})`,
    )
  })

  it('lets the file field pick each format the server takes', () => {
    expect(ACCEPTED_FILES.split(',')).toEqual([...ASSET_FORMATS])
  })
})
