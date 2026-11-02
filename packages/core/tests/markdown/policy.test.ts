import { describe, expect, it } from 'vite-plus/test'

import {
  attributeName,
  isAllowedAttribute,
  isForbiddenAttribute,
  isSafeUrl,
  shorten,
  urlScheme,
  urlValue,
} from '../../src/markdown/policy.ts'

describe('urlScheme', () => {
  it.each([
    ['javascript:alert(1)', 'javascript'],
    ['JAVASCRIPT:alert(1)', 'javascript'],
    [' \tjavascript:x', 'javascript'],
    ['\u0001javascript:x', 'javascript'],
    ['java\nscript:x', 'javascript'],
    ['java\tscript:x', 'javascript'],
    ['java\r\nscript:x', 'javascript'],
    ['&#106;avascript:x', 'javascript'],
    ['&#x6A;avascript:x', 'javascript'],
    ['&#106avascript:x', 'javascript'],
    ['jav&#x09;ascript:x', 'javascript'],
    ['javascript&colon;x', 'javascript'],
    ['javascript&#58;x', 'javascript'],
    ['&#x6A;&#x61;vascript:x', 'javascript'],
    ['&#38;#106;avascript:x', 'javascript'],
    ['https://example.com/a:b', 'https'],
    ['mailto:a@b.co', 'mailto'],
    ['tel:+123', 'tel'],
    ['data:text/html,x', 'data'],
    ['a+b-c.d:x', 'a+b-c.d'],
  ])('reads the scheme of %j as %s', (url, scheme) => {
    expect(urlScheme(url)).toBe(scheme)
  })

  it.each([
    [''],
    ['/path:colon'],
    ['/a?b=c:d'],
    ['a/b:c'],
    ['#x:y'],
    ['?q=a:b'],
    ['//host/a:b'],
    ['1abc:x'],
    ['java script:x'],
    ['java\u0001script:x'],
    [':x'],
    ['&amp;#106;avascript:x'],
    ['&#99999999999;avascript:x'],
    ['&#xZZ;javascript:x'],
  ])('finds no scheme in %j: it is a relative URL', (url) => {
    expect(urlScheme(url)).toBeUndefined()
  })
})

describe('isSafeUrl', () => {
  it.each([
    ['http://a.example/', 'link', true],
    ['https://a.example/', 'link', true],
    ['HTTPS://A.EXAMPLE/', 'link', true],
    ['mailto:a@b.co', 'link', true],
    ['asset:ast_00112233445566778899aabbcc', 'link', true],
    ['/path', 'link', true],
    ['rel/path', 'link', true],
    ['#top', 'link', true],
    ['?q=1', 'link', true],
    ['//cdn.example/x', 'link', true],
    ['tel:123', 'link', false],
    ['ftp://a.example/', 'link', false],
    ['javascript:alert(1)', 'link', false],
    ['vbscript:x', 'link', false],
    ['data:text/html,x', 'link', false],
    ['file:///etc/passwd', 'link', false],
    ['jav&#x09;ascript:x', 'link', false],
    ['http://a.example/i.png', 'image', true],
    ['https://a.example/i.png', 'image', true],
    ['/i.png', 'image', true],
    ['i.png', 'image', true],
    ['asset:ast_00112233445566778899aabbcc', 'image', true],
    ['mailto:a@b.co', 'image', false],
    ['data:image/png;base64,AAAA', 'image', false],
    ['javascript:alert(1)', 'image', false],
  ] as const)('%j as a %s is safe: %s', (url, kind, safe) => {
    expect(isSafeUrl(url, kind)).toBe(safe)
  })
})

describe('urlValue', () => {
  it('is the value of an attribute, or the JSON string a binding holds, or nothing for a value that is not text', () => {
    expect([
      urlValue('href', '/a'),
      urlValue(':href', '"https://a.example/"'),
      urlValue(':href', 'page.url'),
      urlValue('v-bind:href', '"javascript:alert(1)"'),
      urlValue('href', 3),
      urlValue('href', { a: 1 }),
      urlValue(':href', '3'),
    ]).toStrictEqual([
      '/a',
      'https://a.example/',
      'page.url',
      'javascript:alert(1)',
      undefined,
      undefined,
      '3',
    ])
  })
})

describe('attributeName and isForbiddenAttribute', () => {
  it.each([
    ['href', 'href'],
    [':href', 'href'],
    ['v-bind:href', 'href'],
    ['HREF', 'href'],
    ['@click', 'onclick'],
    ['v-on:click', 'onclick'],
    ['ONCLICK', 'onclick'],
    [':onclick', 'onclick'],
    ['xlink:href', 'xlinkhref'],
    ['innerHTML', 'innerhtml'],
  ])('names %s as %s', (key, name) => {
    expect(attributeName(key)).toBe(name)
  })

  it.each([
    ['onclick', true],
    ['onerror', true],
    ['onmouseover', true],
    ['once', true],
    ['srcdoc', true],
    ['formaction', true],
    ['innerhtml', true],
    ['dangerouslysetinnerhtml', true],
    ['textcontent', true],
    ['href', false],
    ['src', false],
    ['title', false],
    ['class', false],
    ['style', false],
    ['open', false],
    ['type', false],
  ])('judges %s forbidden: %s', (name, forbidden) => {
    expect(isForbiddenAttribute(name)).toBe(forbidden)
  })
})

describe('isAllowedAttribute', () => {
  it.each([
    ['a', 'href', '/x', true],
    ['a', 'title', 'T', true],
    ['a', 'href', 3, false],
    ['a', 'target', '_blank', false],
    ['a', 'rel', 'noopener', false],
    ['a', 'class', 'x', false],
    ['a', 'src', '/x', false],
    ['img', 'src', '/i.png', true],
    ['img', 'alt', 'A', true],
    ['img', 'title', 'T', true],
    ['img', 'width', '100', true],
    ['img', 'height', '50', true],
    ['img', 'srcset', 'a 2x', false],
    ['img', 'loading', 'lazy', false],
    ['img', 'style', 'x', false],
    ['img', 'href', '/x', false],
    ['code', 'class', 'language-ts', true],
    ['code', 'class', 'language-c++', true],
    ['code', 'class', 'language-c#', true],
    ['code', 'class', 'language-objective-c', true],
    ['code', 'class', 'language-ts language-js', true],
    ['code', 'class', 'language-ts big', false],
    ['code', 'class', 'big', false],
    ['code', 'class', 'language-', false],
    ['code', 'class', 'language-a"b', false],
    ['code', 'class', '', false],
    ['code', 'style', 'x', false],
    ['pre', 'language', 'ts', true],
    ['pre', 'filename', 'a.ts', true],
    ['pre', 'meta', 'extra', true],
    ['pre', 'highlights', [1, 2], true],
    ['pre', 'highlights', [1.5], false],
    ['pre', 'highlights', ['1'], false],
    ['pre', 'highlights', '1,2', false],
    ['pre', 'class', 'x', false],
    ['pre', 'style', 'x', false],
    ['ol', 'start', '3', true],
    ['ol', 'start', '0', true],
    ['ol', 'start', '1000000000', false],
    ['ol', 'start', 'a', false],
    ['ol', 'start', 3, false],
    ['ul', 'class', 'contains-task-list', true],
    ['ul', 'class', 'other', false],
    ['li', 'class', 'task-list-item', true],
    ['li', 'class', 'other', false],
    ['blockquote', 'as', 'note', true],
    ['blockquote', 'as', 'tip', true],
    ['blockquote', 'as', 'important', true],
    ['blockquote', 'as', 'warning', true],
    ['blockquote', 'as', 'caution', true],
    ['blockquote', 'as', 'script', false],
    ['blockquote', 'class', 'note', false],
    ['th', 'style', 'text-align:left', true],
    ['td', 'style', 'text-align:right', true],
    ['td', 'style', 'text-align:center', true],
    ['td', 'style', 'text-align: left', false],
    ['td', 'style', 'color:red', false],
    ['td', 'class', 'x', false],
    ['input', 'class', 'task-list-item-checkbox', true],
    ['input', 'type', 'checkbox', true],
    ['input', ':disabled', 'true', true],
    ['input', ':checked', 'true', true],
    ['input', 'type', 'text', false],
    ['input', ':disabled', 'false', false],
    ['input', 'onclick', 'x', false],
    ['input', 'name', 'x', false],
    ['template', 'name', 'header', true],
    ['template', 'name', 'a b', false],
    ['template', 'class', 'x', false],
    ['h1', 'id', 'x', false],
    ['h2', 'class', 'x', false],
    ['p', 'class', 'x', false],
    ['p', ':open', 'true', false],
    ['strong', 'onclick', 'x', false],
    ['em', 'class', 'x', false],
    ['del', 'class', 'x', false],
    ['span', 'class', 'x', false],
    ['table', 'class', 'x', false],
    ['hr', 'class', 'x', false],
    ['br', 'class', 'x', false],
    ['div', 'class', 'x', false],
    ['constructor', 'constructor', 'x', false],
    ['a', 'constructor', 'x', false],
    ['a', '__proto__', 'x', false],
  ])('lets <%s %s=%j> through: %s', (tag, key, value, allowed) => {
    expect(isAllowedAttribute(tag, key, value)).toBe(allowed)
  })
})

describe('shorten', () => {
  it('keeps a name of up to 100 characters and cuts a longer one to 100, ending in three dots', () => {
    expect(shorten('a'.repeat(100))).toBe('a'.repeat(100))
    expect(shorten('a'.repeat(101))).toBe(`${'a'.repeat(97)}...`)
    expect(shorten('a'.repeat(101))).toHaveLength(100)
  })
})
