import { Buffer } from 'node:buffer'
import { expect, test, type Page } from '@playwright/test'
import {
  entryAction,
  expectAccessible,
  openImagePicker,
  post,
  saveNow,
  setUp,
  shot,
  target,
  writeMarkdown,
} from './support.ts'

test.describe.configure({ mode: 'serial' })

let owner: Page

const keptCopies = (page: Page) =>
  page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.startsWith('hollware:working-copy:'))
      .map((key) => [key, JSON.parse(localStorage.getItem(key) ?? '{}')]),
  )

async function newEntry(page: Page, locale: 'es' | 'en', title: string, slug: string) {
  await page.goto('/admin/entries/new')
  await expect(page.getByRole('heading', { name: 'New entry' })).toBeVisible()
  await expectAccessible(page)
  if (locale === 'en') {
    await page.getByRole('combobox', { name: 'Locale' }).click()
    await page.getByRole('option', { name: 'en' }).click()
  }
  await page.getByLabel('Title').fill(title)
  await page.getByLabel('Slug').fill(slug)
  await page.getByRole('button', { name: 'Create the draft' }).click()
  await expect(page.getByRole('button', { name: 'Publish', exact: true })).toBeVisible()
  await writeMarkdown(page, post(title, 'hello-world'))
  await saveNow(page)
  await shot(page, `editor-${locale}`)
}

test.beforeAll(async ({ browser }) => {
  owner = await (await browser.newContext({ baseURL: target().url })).newPage()
})

test('AC-0.3-3: the owner writes a post in the editor and publishes it', async () => {
  await setUp(owner, target().setup, 'Olga')
  await expectAccessible(owner)

  await newEntry(owner, 'en', 'Hello world', 'hello-world')
  await newEntry(owner, 'es', 'Hola mundo', 'hola-mundo')
  await expectAccessible(owner)
  await owner.getByRole('button', { name: 'Publish', exact: true }).click()

  await expect(owner.getByText('Published', { exact: true }).first()).toBeVisible()
  await owner.goto('/admin/entries')
  await expect(owner.getByRole('listitem', { name: /^Hola mundo/ })).toContainText('published')
  await expectAccessible(owner)
  await shot(owner, 'entries')
})

test('the owner reads the history of an entry and goes back to an earlier version', async () => {
  await owner.goto('/admin/entries/blog/en/hello-world')
  await expect(owner.getByRole('heading', { name: 'Hello world', level: 1 })).toBeVisible()
  await expect(owner).toHaveTitle('Hello world · playground · Hollware')
  await writeMarkdown(owner, post('Hello again', 'hello-world'))
  await saveNow(owner)
  await owner.getByRole('tab', { name: 'History' }).click()
  const history = owner.getByRole('list', { name: 'History of the entry' })
  await expect(history.getByRole('button').first()).toContainText('Latest')
  await expect(history.getByRole('button').first()).toContainText('Hello again')
  await history
    .getByRole('button', { name: /Hello world/ })
    .first()
    .click()
  await expect(owner.getByRole('dialog')).toContainText('This revision, on the left')
  await expectAccessible(owner)
  await shot(owner, 'history')
  await owner.getByRole('dialog').getByRole('button', { name: 'Restore this version' }).click()

  await expect(owner.getByText('Restored as a new revision', { exact: true }).first()).toBeVisible()
  await expect(owner.getByRole('heading', { name: 'Hello world', level: 1 })).toBeVisible()
  await expect(history.getByRole('button').first()).toContainText('Hello world')
  await expect(history.getByRole('button', { name: /Hello again/ })).toHaveCount(1)
})

test('a diff folds the lines that did not change into a flat band of the admin', async () => {
  const paragraphs = Array.from({ length: 20 }, (_, n) => `Paragraph ${n + 1} stays as it is.`)
  const long = (last: string) =>
    `${post('A long post', 'a-long-post')}\n${paragraphs.join('\n\n')}\n\n${last}\n`
  await owner.goto('/admin/entries/new')
  await owner.getByRole('combobox', { name: 'Locale' }).click()
  await owner.getByRole('option', { name: 'en' }).click()
  await owner.getByLabel('Title').fill('A long post')
  await owner.getByLabel('Slug').fill('a-long-post')
  await owner.getByRole('button', { name: 'Create the draft' }).click()
  await expect(owner.getByRole('button', { name: 'Publish', exact: true })).toBeVisible()
  await writeMarkdown(owner, long('The last paragraph, first.'))
  await saveNow(owner)
  await writeMarkdown(owner, long('The last paragraph, changed.'))
  await saveNow(owner)
  await owner.getByRole('tab', { name: 'History' }).click()
  await owner.getByRole('list', { name: 'History of the entry' }).getByRole('button').nth(1).click()
  const band = owner.getByRole('dialog').locator('.cm-collapsedLines').first()
  await expect(band).toBeVisible()
  await expect(band).toHaveText(/^\d+ unchanged lines: show them$/)
  await expect(band).toHaveCSS('background-image', 'none')
  await shot(owner, 'diff-collapsed')
  await band.click()
  await expect(owner.getByRole('dialog').locator('.cm-collapsedLines')).toHaveCount(0)
  await owner.keyboard.press('Escape')
})

test('the owner writes in the visual editor, and finds the Markdown an agent writes', async () => {
  await owner.goto('/admin/entries/blog/en/a-long-post')
  const body = owner.getByRole('textbox', { name: 'Body of the entry' })
  await body.getByText('The last paragraph, changed.').click()
  await expect(body).toBeFocused()
  await owner.keyboard.press('End')
  await owner.waitForTimeout(150)
  await owner.keyboard.press('Enter')
  await owner.keyboard.type('/')
  await owner.getByRole('option', { name: /Heading 2/ }).click()
  await owner.keyboard.type('Written in the editor')
  await owner.keyboard.press('Enter')
  await owner.keyboard.type('One word')
  for (let step = 0; step < 4; step++) await owner.keyboard.press('Shift+ArrowLeft')
  await owner.getByRole('button', { name: 'Bold' }).click()

  await expect(body.getByRole('heading', { name: 'Written in the editor', level: 2 })).toBeVisible()
  await expect(body.locator('strong')).toHaveText('word')
  await expectAccessible(owner)
  await shot(owner, 'editor-write')

  await body.getByText('The last paragraph, changed.').hover()
  await owner.getByRole('button', { name: 'Actions of the block' }).click()
  await expect(owner.getByRole('menuitem', { name: 'Duplicate' })).toBeVisible()
  await owner.keyboard.press('Escape')

  await saveNow(owner)
  await owner.getByRole('button', { name: 'View Markdown' }).click()
  const markdown = owner.locator('.cm-content').first()
  await expect(markdown).toContainText('## Written in the editor')
  await expect(markdown).toContainText('One **word**')
  await shot(owner, 'editor-markdown')
  await owner.getByRole('button', { name: 'Edit visually' }).click()
})

test('the owner types in bursts, which this browser keeps until one save, and gets kept changes back', async ({
  browser,
}) => {
  await owner.goto('/admin/entries/blog/en/a-long-post?panel=history')
  const history = owner.getByRole('list', { name: 'History of the entry' })
  await expect(history.getByRole('button').first()).toContainText('Latest')
  const revisions = await history.getByRole('button').count()
  const body = owner.getByRole('textbox', { name: 'Body of the entry' })
  await body.getByText('The last paragraph, changed.').click()
  await owner.keyboard.press('End')
  for (const word of [' One.', ' Two.', ' Three.']) {
    await owner.keyboard.type(word)
    await owner.waitForTimeout(2_000)
  }

  const copies = await keptCopies(owner)
  expect(copies).toHaveLength(1)
  const [key, copy] = copies[0] ?? []
  expect(copy.markdown).toContain('One. Two. Three.')
  await saveNow(owner)
  await expect(history.getByRole('button')).toHaveCount(revisions + 1)
  expect(await keptCopies(owner)).toEqual([])
  await owner.getByRole('button', { name: 'View Markdown' }).click()
  await owner.locator('.cm-content').first().click()
  await owner.keyboard.press('ControlOrMeta+End')
  await owner.keyboard.type('X')
  await owner.keyboard.press('Backspace')
  await owner.waitForTimeout(600)
  expect(await keptCopies(owner)).toEqual([])
  await owner.keyboard.type('X')
  await owner.waitForTimeout(600)
  expect((await keptCopies(owner)).map(([, kept]) => kept.markdown.endsWith('X'))).toEqual([true])
  await owner.keyboard.press('Backspace')
  await owner.waitForTimeout(600)
  expect(await keptCopies(owner)).toEqual([])
  await owner.getByRole('button', { name: 'Edit visually' }).click()
  await owner.waitForTimeout(600)
  expect(await keptCopies(owner)).toEqual([])
  await expect(owner.getByRole('status').filter({ hasText: /^\s*Saved\s*$/ })).toBeVisible()

  await owner.evaluate(
    ([name, markdown, version]) =>
      localStorage.setItem(String(name), JSON.stringify({ markdown, version })),
    [key, `${copy.markdown.trimEnd()} Four.\n`, copy.version + 1],
  )
  await owner.reload()
  const restored = owner.getByText('Restored the changes this browser kept since the last save')
  await expect(restored).toBeVisible()
  await expect(body).toContainText('Four.')
  await expectAccessible(owner)
  await owner.getByRole('button', { name: 'Discard', exact: true }).click()
  await expect(restored).toBeHidden()
  await expect(body).not.toContainText('Four.')
  await owner.waitForTimeout(600)
  expect(await keptCopies(owner)).toEqual([])

  await owner.evaluate(
    ([name, markdown, version]) =>
      localStorage.setItem(String(name), JSON.stringify({ markdown, version })),
    [key, `${copy.markdown.trimEnd()} Five.\n`, copy.version],
  )
  await owner.route('**/v1/admin/me', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1_000))
    await route.continue()
  })
  await owner.reload()
  const offered = owner.getByText(/^This browser kept changes made to version \d+/)
  await expect(offered).toBeVisible()
  await owner.unroute('**/v1/admin/me')
  await expect(body).not.toContainText('Five.')
  expect(await keptCopies(owner)).toHaveLength(1)
  const elsewhere = await browser.newContext({
    baseURL: target().url,
    storageState: await owner.context().storageState(),
  })
  await elsewhere.clock.install()
  const paused = await elsewhere.newPage()
  await paused.goto('/admin/entries/blog/en/a-long-post')
  await expect(paused.getByText(/^This browser kept changes made to version \d+/)).toBeVisible()
  const stillOffered = async () => {
    await paused.waitForTimeout(600)
    await expect(paused.getByRole('status').filter({ hasText: /^\s*Saved\s*$/ })).toBeVisible()
    expect((await keptCopies(paused)).map(([, kept]) => kept.markdown.includes('Five.'))).toEqual([
      true,
    ])
  }
  await stillOffered()
  await paused.getByRole('button', { name: 'View Markdown' }).click()
  await paused.locator('.cm-content').first().click()
  await stillOffered()
  await paused.clock.pauseAt(await paused.evaluate(() => Date.now() + 1_000))
  await paused.keyboard.press('ControlOrMeta+End')
  await paused.keyboard.type('Y')
  await paused.keyboard.press('Backspace')
  await paused.clock.runFor(1_000)
  expect((await keptCopies(paused)).map(([, kept]) => kept.markdown.includes('Five.'))).toEqual([
    true,
  ])
  await elsewhere.close()
  await owner.getByRole('button', { name: 'Discard', exact: true }).click()
  await expect(offered).toBeHidden()
  expect(await keptCopies(owner)).toEqual([])
})

test('the editor saves what the owner typed before it opens a translation, and not for a tab', async () => {
  await owner.goto('/admin/entries/blog/es/hola-mundo?panel=history')
  const history = owner.getByRole('list', { name: 'History of the entry' })
  await expect(history.getByRole('button').first()).toContainText('Latest')
  const revisions = await history.getByRole('button').count()
  const body = owner.getByRole('textbox', { name: 'Body of the entry' })
  await body.getByText('Plain words, one idea, and nothing that links anywhere.').click()
  await owner.keyboard.press('End')
  await owner.keyboard.type(' Y algo más.')
  await owner.getByRole('tab', { name: 'Properties' }).click()
  await owner.getByRole('tab', { name: 'History' }).click()
  await expect(history.getByRole('button').first()).toContainText('Latest')
  await owner.waitForTimeout(600)
  await expect(history.getByRole('button')).toHaveCount(revisions)
  await owner.getByRole('tab', { name: 'Properties' }).click()
  await owner.getByRole('link', { name: 'en · Hello world', exact: true }).click()
  await expect(owner.getByRole('heading', { name: 'Hello world', level: 1 })).toBeVisible()
  expect(await keptCopies(owner)).toEqual([])
  await owner.getByRole('link', { name: 'es · Hola mundo', exact: true }).click()
  await expect(owner.getByRole('heading', { name: 'Hola mundo', level: 1 })).toBeVisible()
  await expect(body).toContainText('nothing that links anywhere. Y algo más.')
  await owner.getByRole('tab', { name: 'History' }).click()
  await expect(history.getByRole('button')).toHaveCount(revisions + 1)
  await expect(
    owner.getByText('Restored the changes this browser kept since the last save'),
  ).toBeHidden()
  expect(await keptCopies(owner)).toEqual([])
})

test('the owner deletes a draft of the trash for ever, and the activity log keeps that', async () => {
  await owner.goto('/admin/entries/new')
  await owner.getByRole('combobox', { name: 'Locale' }).click()
  await owner.getByRole('option', { name: 'en' }).click()
  await owner.getByLabel('Title').fill('Short lived')
  await owner.getByLabel('Slug').fill('short-lived')
  await owner.getByRole('button', { name: 'Create the draft' }).click()
  await expect(owner.getByRole('button', { name: 'Publish', exact: true })).toBeVisible()
  await entryAction(owner, 'Move to trash')
  await owner.getByRole('dialog').getByRole('button', { name: 'Move to trash' }).click()
  await expect(owner.getByText('Moved to the trash', { exact: true }).first()).toBeVisible()

  await owner.getByRole('tab', { name: 'Trash' }).click()
  await owner.getByRole('checkbox', { name: 'Select Short lived' }).click()
  const bar = owner.getByRole('toolbar', { name: 'Actions on the selected rows' })
  await bar.getByRole('button', { name: 'Delete 1 for ever' }).click()
  await expect(owner.getByRole('dialog')).toContainText('Delete 1 entry for ever?')
  await expectAccessible(owner)
  await owner.getByRole('dialog').getByRole('button', { name: 'Delete 1 for ever' }).click()
  await expect(owner.getByText('1 deleted for ever', { exact: true }).first()).toBeVisible()
  await expect(owner.getByText('Done', { exact: true }).first()).toBeVisible()
  await expect(owner.getByRole('listitem', { name: /^Short lived/ })).toHaveCount(0)
  await owner.goto('/admin/settings/activity')
  await expect(owner.getByRole('row', { name: /Deleted an entry for ever/ }).first()).toBeVisible()
})

test('AC-0.3-2: an author publishes through review, and the owner approves it', async ({
  browser,
}) => {
  await owner.goto('/admin/settings/people')
  await expect(owner.getByRole('heading', { name: 'Members' })).toBeVisible()
  await expectAccessible(owner)
  await owner.getByRole('textbox', { name: 'Email' }).fill('ana@example.org')
  await owner.getByRole('button', { name: 'Invite' }).click()
  const link = (await owner.getByText(/\/setup#invitation=/).textContent()) ?? ''

  const author = await (await browser.newContext({ baseURL: target().url })).newPage()
  await setUp(author, link.trim(), 'Ana')
  await author.goto('/admin/entries/blog/es/hola-mundo')
  await expect(author.getByRole('heading', { name: 'Hola mundo', level: 1 }).first()).toBeVisible()
  await writeMarkdown(author, post('Hola mundo, otra vez', 'hello-world'))
  await saveNow(author)
  await author.getByRole('button', { name: 'Publish', exact: true }).click()
  await expect(author.getByText('Sent for review').first()).toBeVisible()

  await owner.goto('/admin/reviews')
  await expect(owner.getByRole('heading', { name: 'Reviews', level: 1 })).toBeVisible()
  await expect(
    owner.getByRole('button', { name: /Hola mundo, otra vez.*asked by Ana/ }),
  ).toBeVisible()
  await expect(owner.getByRole('link', { name: /^Reviews\s*1$/ })).toBeVisible()
  await expect(owner.getByText('Choose a review to read its changes.')).toBeVisible()
  await owner.keyboard.press('?')
  const help = owner.getByRole('dialog', { name: 'Keyboard shortcuts' })
  await expect(help.getByRole('region', { name: 'Reviews' })).toContainText(
    'Ask for changes, or reject',
  )
  await owner.keyboard.press('Escape')
  await expect(help).toBeHidden()
  await owner.keyboard.press('j')
  const review = owner.getByRole('region', { name: 'The review' })
  await expect(
    review.getByRole('heading', { name: 'Hola mundo, otra vez', level: 2 }),
  ).toBeVisible()
  await expect(owner.getByText('No comments yet.')).toBeVisible()
  await review.getByRole('tab', { name: 'Preview' }).click()
  await expect(review.getByRole('heading', { name: 'In short' })).toBeVisible()
  await expectAccessible(owner)
  await owner.evaluate(
    'window.open = (url) => { document.body.dataset.opened = String(url); return null }',
  )
  await review.getByRole('button', { name: 'Open on the site' }).click()
  await expect(owner.locator('body')).toHaveAttribute('data-opened', /\?hollware-preview=hw_prv_/)
  await review.getByRole('tab', { name: 'Changes' }).click()
  await owner.getByRole('textbox', { name: 'Comment', exact: true }).fill('The title reads well.')
  await owner.getByRole('button', { name: 'Comment', exact: true }).click()
  await expect(owner.getByText('The title reads well.')).toBeVisible()
  await shot(owner, 'review')
  await expectAccessible(owner)
  await owner.keyboard.press('a')

  await expect(owner.getByText('Approved and published').first()).toBeVisible()
  await expect(owner.getByText('Nothing waits for review.')).toBeVisible()
  await expect(owner.getByRole('link', { name: 'Reviews', exact: true })).toBeVisible()

  await author.reload()
  await writeMarkdown(author, post('Hola mundo, rechazado', 'hello-world'))
  await saveNow(author)
  await author.getByRole('button', { name: 'Publish', exact: true }).click()
  await expect(author.getByText('Sent for review').first()).toBeVisible()
  await owner.goto('/admin/reviews')
  await owner.getByRole('button', { name: /Hola mundo, rechazado.*asked by Ana/ }).click()
  await owner.keyboard.press('r')
  const note = owner.getByRole('dialog', { name: 'A note for the author' })
  await note.getByRole('textbox', { name: 'Note for the author' }).fill('Not this one.')
  await expectAccessible(owner)
  await note.getByRole('button', { name: 'Reject', exact: true }).click()
  await expect(owner.getByText('Rejected: it will not be published').first()).toBeVisible()
  await expect(owner.getByText('Nothing waits for review.')).toBeVisible()
  await owner.goto('/admin/entries/blog/es/hola-mundo')
  await owner.getByRole('tab', { name: 'History' }).click()
  await owner
    .getByRole('list', { name: 'History of the entry' })
    .getByRole('button', { name: /Hola mundo, otra vez/ })
    .first()
    .click()
  await owner.getByRole('dialog').getByRole('button', { name: 'Restore this version' }).click()
  await expect(owner.getByRole('heading', { name: 'Hola mundo, otra vez', level: 1 })).toBeVisible()
})

test('the owner who changes an entry that waits for review is asked first, and the request stays until they choose', async ({
  browser,
}) => {
  await owner.goto('/admin/settings/people')
  await owner.getByRole('textbox', { name: 'Email' }).fill('bea@example.org')
  await owner.getByRole('button', { name: 'Invite' }).click()
  const link = (await owner.getByText(/\/setup#invitation=/).textContent()) ?? ''
  const author = await (await browser.newContext({ baseURL: target().url })).newPage()
  await setUp(author, link.trim(), 'Bea')
  await author.goto('/admin/entries/blog/es/hola-mundo')
  await writeMarkdown(author, post('Hola mundo, de Bea', 'hello-world'))
  await saveNow(author)
  await author.getByRole('button', { name: 'Publish', exact: true }).click()
  await expect(author.getByText('Sent for review').first()).toBeVisible()

  await owner.goto('/admin/entries/blog/es/hola-mundo')
  await expect(owner.getByText(/^Bea asked to publish this version/)).toBeVisible()
  await writeMarkdown(owner, post('Hola mundo, de la dueña', 'hello-world'))
  const held = owner.getByRole('dialog', { name: 'This version waits for review' })
  await expect(held).toBeVisible()
  await expectAccessible(owner)
  await held.getByRole('button', { name: 'Discard my change' }).click()
  await expect(held).toBeHidden()
  await expect(owner.locator('.cm-content').first()).toContainText('title: Hola mundo, de Bea')
  await owner.goto('/admin/reviews')
  await expect(
    owner.getByRole('button', { name: /Hola mundo, de Bea.*asked by Bea/ }),
  ).toBeVisible()

  await owner.goto('/admin/entries/blog/es/hola-mundo')
  await writeMarkdown(owner, post('Hola mundo, de paso', 'hello-world'))
  await owner.getByRole('link', { name: 'Reviews' }).first().click()
  await expect(
    owner.getByRole('button', { name: /Hola mundo, de Bea.*asked by Bea/ }),
  ).toBeVisible()

  await owner.goto('/admin/entries/blog/es/hola-mundo')
  await owner.getByRole('button', { name: 'Review it' }).click()
  await expect(
    owner
      .getByRole('region', { name: 'The review' })
      .getByRole('heading', { name: 'Hola mundo, de Bea', level: 2 }),
  ).toBeVisible()

  await owner.setViewportSize({ width: 390, height: 844 })
  const review = owner.getByRole('region', { name: 'The review' })
  const reviewTitle = await review
    .getByRole('heading', { name: 'Hola mundo, de Bea', level: 2 })
    .boundingBox()
  expect(reviewTitle?.width ?? 0).toBeGreaterThan(300)
  await expect(review.locator('.cm-mergeView')).toHaveCount(0)
  await expect(review.locator('.cm-editor')).toHaveCount(1)
  await owner.goto('/admin/entries/blog/es/hola-mundo')
  const publish = owner.getByRole('button', { name: 'Publish', exact: true })
  await expect(publish).toBeVisible()
  await expect(owner.getByRole('complementary')).toHaveCount(0)
  await expect(owner.getByRole('navigation', { name: 'Where you are' })).toBeHidden()
  const [title, button] = [
    await owner.getByRole('heading', { level: 1 }).boundingBox(),
    await publish.boundingBox(),
  ]
  expect(
    title !== null &&
      button !== null &&
      title.x < button.x + button.width &&
      button.x < title.x + title.width &&
      title.y < button.y + button.height &&
      button.y < title.y + title.height,
  ).toBe(false)
  await owner.getByRole('button', { name: 'Properties' }).click()
  await expect(owner.getByRole('complementary', { name: 'Properties' })).toBeVisible()
  await expect(publish).toBeHidden()
  await owner.getByRole('button', { name: 'Close the panel' }).click()
  await expect(owner.getByRole('complementary')).toHaveCount(0)
  await expect(publish).toBeVisible()
  await owner.setViewportSize({ width: 1280, height: 720 })

  await owner.goto('/admin/entries/blog/es/hola-mundo')
  await writeMarkdown(owner, post('Hola mundo, otra vez', 'hello-world'))
  await held.getByRole('button', { name: 'Save and cancel the request' }).click()
  await expect(owner.getByRole('status').filter({ hasText: /^\s*Saved\s*$/ })).toBeVisible()
  await owner.goto('/admin/reviews')
  await expect(owner.getByText('Nothing waits for review.')).toBeVisible()
})

test('the owner revokes an invitation, whose link then works no more', async ({ browser }) => {
  await owner.goto('/admin/settings/people')
  await owner.getByRole('textbox', { name: 'Email' }).fill('dan@example.org')
  await owner.getByRole('button', { name: 'Invite' }).click()
  const link = (await owner.getByText(/\/setup#invitation=/).textContent()) ?? ''
  const waiting = owner.getByRole('region', { name: 'Invitations' })
  await waiting.getByRole('button', { name: 'Revoke the invitation (author)' }).click()
  await owner.getByRole('dialog').getByRole('button', { name: 'Revoke', exact: true }).click()
  await expect(owner.getByText('Invitation revoked').first()).toBeVisible()
  await expect(waiting).toHaveCount(0)

  const stranger = await (await browser.newContext({ baseURL: target().url })).newPage()
  await stranger.goto(link.trim())
  await stranger.getByLabel('Your name').fill('Eve')
  await stranger.getByRole('button', { name: 'Create the passkey' }).click()
  await expect(stranger.getByRole('alert')).toContainText(
    'Ask an owner or an admin of the site for a new invitation.',
  )
})

test('the owner anonymizes a person they removed, whose name then leaves what they wrote', async ({
  browser,
}) => {
  await owner.goto('/admin/settings/people')
  await owner.getByRole('textbox', { name: 'Email' }).fill('carla@example.org')
  await owner.getByRole('button', { name: 'Invite' }).click()
  const link = (await owner.getByText(/\/setup#invitation=/).textContent()) ?? ''
  const leaving = await (await browser.newContext({ baseURL: target().url })).newPage()
  await setUp(leaving, link.trim(), 'Carla')
  await leaving.goto('/admin/entries/new')
  await leaving.getByRole('combobox', { name: 'Locale' }).click()
  await leaving.getByRole('option', { name: 'en' }).click()
  await leaving.getByLabel('Title').fill('A post that stays')
  await leaving.getByLabel('Slug').fill('a-post-that-stays')
  await leaving.getByRole('button', { name: 'Create the draft' }).click()
  await writeMarkdown(leaving, post('A post that stays', 'a-post-that-stays'))
  await saveNow(leaving)

  await owner.goto('/admin/settings/people')
  await owner
    .getByRole('region', { name: 'Members' })
    .getByRole('button', { name: 'Remove Carla' })
    .click()
  await owner.getByRole('dialog').getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(owner.getByText('Carla is out of this site', { exact: true }).first()).toBeVisible()
  const former = owner.getByRole('region', { name: 'Former members' })
  await expect(former).toContainText('Carla')
  await expectAccessible(owner)
  await former.getByRole('button', { name: 'Anonymize Carla' }).click()
  await expect(owner.getByRole('dialog')).toContainText('Nothing brings their name back.')
  await owner.getByRole('dialog').getByRole('button', { name: 'Anonymize', exact: true }).click()
  await expect(owner.getByText('Carla is anonymized', { exact: true }).first()).toBeVisible()
  await expect(former).toHaveCount(0)

  await owner.goto('/admin/entries/blog/en/a-post-that-stays?panel=history')
  const history = owner.getByRole('list', { name: 'History of the entry' })
  await expect(history.getByRole('button').first()).toContainText('A former member')
  await expect(history).not.toContainText('Carla')
  await owner.goto('/admin/settings/activity')
  await expect(owner.getByRole('row', { name: /Anonymized a former member/ }).first()).toBeVisible()
  await expect(owner.getByRole('row', { name: /A former member/ }).first()).toBeVisible()
})

test('the owner schedules the end of an entry, unpublishes it, then schedules it', async () => {
  await owner.goto('/admin/entries/blog/es/hola-mundo')
  await expect(owner.getByRole('heading', { name: 'Hola mundo, otra vez', level: 1 })).toBeVisible()
  await expect(owner.getByRole('navigation', { name: 'Translations' })).toContainText('en')
  await entryAction(owner, 'Unpublish later')
  await expect(owner.getByRole('dialog')).toContainText('Take it off the site at a time')
  await owner.getByRole('dialog').getByRole('button', { name: 'Unpublish later' }).click()
  await expect(owner.getByText('It will leave the site at that time').first()).toBeVisible()
  await expect(owner.getByText(/^Leaves the site on /)).toBeVisible()
  await owner.getByRole('button', { name: 'Keep it published' }).click()
  await expect(owner.getByText('It stays published').first()).toBeVisible()
  await expect(owner.getByText(/^Leaves the site on /)).toHaveCount(0)

  await entryAction(owner, 'Unpublish')
  await expect(owner.getByRole('dialog')).toContainText('Unpublish this entry?')
  await expectAccessible(owner)
  await owner.getByRole('dialog').getByRole('button', { name: 'Unpublish', exact: true }).click()
  await expect(owner.getByText('Unpublished', { exact: true }).first()).toBeVisible()

  await entryAction(owner, 'Schedule')
  await owner.getByRole('dialog').getByRole('button', { name: 'Schedule', exact: true }).click()
  await expect(owner.getByText('Scheduled', { exact: true }).first()).toBeVisible()
  await owner.getByRole('button', { name: 'More actions' }).click()
  await expect(owner.getByRole('menuitem', { name: 'Cancel schedule' })).toBeVisible()
  await owner.keyboard.press('Escape')
  await shot(owner, 'scheduled')

  await owner.goto('/admin/entries?status=scheduled')
  await expect(owner.getByRole('listitem', { name: /^Hola mundo, otra vez/ })).toContainText(
    'scheduled',
  )
})

test('AC-0.8-2: the owner shapes the site in the admin, and it applies with no deploy', async () => {
  await owner.goto('/admin/settings/collections')
  await expect(owner.getByRole('heading', { name: 'Collections', level: 1 })).toBeVisible()
  await expectAccessible(owner)
  await owner.getByRole('textbox', { name: 'Name', exact: true }).fill('talks')
  await owner.getByRole('combobox', { name: 'Start from' }).click()
  await owner.getByRole('option', { name: 'Empty: a title alone' }).click()
  await owner.getByRole('button', { name: 'Create the collection' }).click()
  await expect(owner.getByRole('heading', { name: 'talks', level: 1 })).toBeVisible()
  await expectAccessible(owner)

  await owner.getByRole('button', { name: 'Add a rule' }).click()
  await owner.getByRole('combobox', { name: 'field*', exact: true }).click()
  await owner.getByRole('option', { name: 'title', exact: true }).click()
  await owner.getByRole('spinbutton', { name: 'max', exact: true }).fill('10')
  await owner.getByRole('combobox', { name: 'Severity' }).click()
  await owner.getByRole('option', { name: 'error', exact: true }).click()
  await shot(owner, 'collection')
  await owner.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(owner.getByText('Saved: it applies at once').first()).toBeVisible()

  await owner.goto('/admin/entries/new?collection=talks&locale=en')
  await owner.getByLabel('Title').fill('A talk with a long title')
  await owner.getByLabel('Slug').fill('a-long-talk')
  await owner.getByRole('button', { name: 'Create the draft' }).click()
  await owner.getByRole('button', { name: 'Publish', exact: true }).click()
  await expect(owner.getByText('Blocked', { exact: true }).first()).toBeVisible()

  await writeMarkdown(owner, '---\ntitle: A talk\n---\n\nShort and plain.\n')
  await saveNow(owner)
  await owner.getByRole('button', { name: 'Publish', exact: true }).click()
  await expect(owner.getByText('Published', { exact: true }).first()).toBeVisible()
})

test('the owner lets Hollware fill the date of the blog, which nobody writes then', async () => {
  await owner.goto('/admin/settings/collections/blog')
  await expect(owner.getByRole('heading', { name: 'blog', level: 1 })).toBeVisible()
  const who = owner.getByRole('combobox', { name: 'Who writes it' }).first()
  await who.click()
  await owner.getByRole('option', { name: 'Hollware: the date it was first published' }).click()
  await owner.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(owner.getByText('Saved: it applies at once').first()).toBeVisible()
  await owner.reload()
  await expect(owner.getByRole('combobox', { name: 'Who writes it' }).first()).toContainText(
    'Hollware: the date it was first published',
  )
  await expectAccessible(owner)
})

test('the owner adds a webhook, whose secret Hollware makes and shows once', async () => {
  await owner.goto('/admin/settings')
  await expect(owner).toHaveURL(/\/admin\/settings\/site$/)
  const settings = owner.getByRole('navigation').filter({ hasText: 'Danger zone' })
  await settings.getByRole('link', { name: 'Webhooks', exact: true }).click()
  await expect(owner).toHaveURL(/\/admin\/settings\/site\/webhooks$/)
  await expect(owner.getByRole('heading', { name: 'Webhooks', level: 1 })).toBeVisible()
  await owner.getByRole('textbox', { name: 'Name', exact: true }).last().fill('site')
  await owner.getByLabel('URL', { exact: true }).fill('https://hooks.invalid/hollware')
  await owner.getByRole('button', { name: 'Add', exact: true }).click()

  await expect(
    owner.getByText('The secret of site: give it to the receiver now, it is shown once'),
  ).toBeVisible()
  await expect(owner.getByText(/^whsec_[0-9a-f]{64}$/)).toBeVisible()
  await expect(owner.getByText("signed by Hollware's secret")).toBeVisible()
  await expectAccessible(owner)
})

test('the owner finds the delivery to a webhook that failed, and sends its event again', async () => {
  const failed = owner.getByRole('region', { name: 'Deliveries that failed' })
  const row = failed.getByRole('listitem').filter({ hasText: 'site.changed' }).first()
  await expect(async () => {
    await owner.reload()
    await expect(row).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 60_000 })
  await expect(row).toContainText('site · site.changed')
  await row.getByRole('button', { name: 'Send again' }).click()
  await expect(owner.getByText('Sent to the Queue again', { exact: true })).toBeVisible()
  await expectAccessible(owner)
  await owner.goto('/admin/settings/activity')
  await expect(owner.getByRole('row', { name: /Sent an event again/ }).first()).toBeVisible()
})

test('the owner connects analytics in Analytics, and the provider is asked before anything is kept', async () => {
  await owner.goto('/admin/')
  await expect(owner.getByText('No analytics connected.')).toBeVisible()
  await expect(owner.getByRole('list', { name: 'Get started' }).getByRole('listitem')).toHaveText([
    /^Connect an agent, done.*claude mcp add --transport http hollware http:\/\/localhost:\d+\/mcp/,
    /^Write the first entry, done/,
    /^Invite a person, done/,
    /^Connect the analytics of your site, to do/,
  ])
  await expect(owner.getByRole('heading', { name: 'Last audit' })).toHaveCount(0)
  await owner.getByRole('link', { name: 'Connect analytics' }).click()

  await expect(owner.getByRole('heading', { name: 'Analytics' })).toBeVisible()
  await owner.getByRole('combobox', { name: 'Provider' }).click()
  await owner.getByRole('option', { name: 'Google Analytics 4' }).click()
  await owner.getByLabel('JSON key of the service account').fill('not a json key')
  await owner.getByLabel('Property id').fill('123456789')
  await owner.getByRole('button', { name: 'Connect', exact: true }).click()

  await expect(owner.getByText('Could not connect')).toBeVisible()
  await expect(owner.getByText(/The credential is not JSON\./)).toBeVisible()
  await expectAccessible(owner)
  await shot(owner, 'analytics')
})

test('finds an entry from ⌘K, and filters the table of entries', async () => {
  await owner.goto('/admin/entries')
  await expect(owner.getByRole('listitem', { name: /^Hola mundo/ })).toBeVisible()
  await owner.getByRole('textbox', { name: 'Filter by title, slug or tag' }).fill('hello')
  await expect(owner.getByRole('listitem', { name: /^Hola mundo/ })).toHaveCount(0)
  await expect(owner.getByRole('listitem', { name: /^Hello world/ })).toBeVisible()
  await owner.getByRole('textbox', { name: 'Filter by title, slug or tag' }).fill('')
  await expect(owner.getByRole('listitem', { name: /^Hello world/ })).toContainText(
    'behind its source',
  )
  await expect(owner.getByRole('listitem', { name: /^Hola mundo/ })).not.toContainText(
    'behind its source',
  )
  await expect(owner.getByRole('tab', { name: /behind/i })).toHaveCount(0)

  await owner.getByRole('button', { name: /^Search/ }).click()
  await owner.getByPlaceholder('Search entries, or go anywhere…').fill('hello')
  await owner
    .getByRole('option', { name: /Hello world/ })
    .first()
    .click()
  await expect(owner.getByRole('heading', { name: 'Hello world', level: 1 })).toBeVisible()

  await owner.getByRole('button', { name: /^Search/ }).click()
  await owner.getByPlaceholder('Search entries, or go anywhere…').fill('markdown')
  await expect(owner.getByRole('group', { name: 'This entry' })).toBeVisible()
  await owner.getByRole('option', { name: /^View Markdown/ }).click()
  await expect(owner).toHaveURL(/[?&]view=markdown/)
  await expect(owner.locator('.cm-content').first()).toBeVisible()
})

test('Home lists a translation behind its source, and the entry shows what changed in the source since', async () => {
  await owner.goto('/admin/')
  const behind = owner.getByRole('region', { name: 'Translations behind their source' })
  await expect(behind.getByRole('listitem')).toHaveText([/^Hello world\s*en$/])
  await behind.getByRole('link', { name: 'Hello world' }).click()

  await expect(owner.getByRole('heading', { name: 'Hello world', level: 1 })).toBeVisible()
  await owner.getByRole('button', { name: 'See what changed' }).click()
  const dialog = owner.getByRole('dialog', { name: 'What changed in the source, es' })
  await expect(dialog).toContainText('as it is now, on the right')
  await expect(dialog.locator('.cm-changedLine')).toHaveText([
    'title: Hola mundo',
    'title: Hola mundo, otra vez',
  ])
  await expectAccessible(owner)
  await shot(owner, 'source-changes')
  await dialog.getByRole('link', { name: 'Open the source, es' }).click()
  await expect(owner.getByRole('heading', { name: 'Hola mundo, otra vez', level: 1 })).toBeVisible()
  await expect(owner.getByRole('button', { name: 'See what changed' })).toHaveCount(0)
})

test('AC-0.3-4: the other pages of the admin and the sign-in page', async () => {
  await owner.goto('/admin/')
  await expect(owner.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible()
  await owner.keyboard.press('Tab')
  await expect(owner.getByRole('link', { name: 'Skip to content' })).toBeFocused()
  await owner.keyboard.press('Enter')
  await expect(owner.getByRole('main')).toBeFocused()
  for (const [path, heading, title] of [
    ['/admin/', 'Home', 'Home · playground · Hollware'],
    ['/admin/settings/site', 'General', 'General · playground · Hollware'],
    ['/admin/settings/site/redirects', 'Redirects', 'Redirects · playground · Hollware'],
    ['/admin/settings/site/danger', 'Danger zone', 'Danger zone · playground · Hollware'],
    ['/admin/settings/tokens', 'Tokens', 'Tokens · playground · Hollware'],
    ['/admin/settings/activity', 'Activity', 'Activity · playground · Hollware'],
    ['/signin', 'Sign in', 'Sign in · Hollware'],
  ] as const) {
    await owner.goto(path)
    await expect(owner.getByRole('heading', { name: heading, level: 1 })).toBeVisible()
    await expect(owner).toHaveTitle(title)
    if (heading === 'Activity') {
      await expect(owner.getByRole('row', { name: /Published an entry/ }).first()).toBeVisible()
    }
    await expectAccessible(owner)
    await shot(owner, heading.toLowerCase().replaceAll(' ', '-'))
  }
})

test('the owner uploads an image, sees it in the library and copies its reference', async () => {
  const pixel = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
    'base64',
  )
  await owner.goto('/admin/images')
  await expect(owner.getByRole('heading', { name: 'Images', level: 1 })).toBeVisible()
  await owner.locator('input[type="file"]').setInputFiles({
    name: 'pixel.png',
    mimeType: 'image/png',
    buffer: pixel,
  })
  await owner.getByLabel('What it shows').fill('One red pixel')
  await owner.getByRole('button', { name: 'Upload' }).click()

  const card = owner.getByRole('listitem').filter({ hasText: 'One red pixel' })
  await expect(card).toBeVisible()
  await expect(card.getByRole('img', { name: 'One red pixel' })).toHaveAttribute(
    'src',
    /\/assets\/[a-z0-9-]+\/ast_[0-9a-f]{26}$/,
  )
  await expectAccessible(owner)
  await shot(owner, 'images')

  await card.getByRole('button', { name: 'Edit what it shows: pixel.png' }).click()
  await owner.getByRole('dialog').getByRole('textbox').fill('A single red pixel')
  await owner.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
  await expect(
    owner.getByRole('listitem').getByRole('img', { name: 'A single red pixel' }),
  ).toBeVisible()
})

test('the owner inserts an image of the library and uploads another, from the editor', async () => {
  const blue = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYPgPAAEDAQAIicLsAAAAAElFTkSuQmCC',
    'base64',
  )
  await owner.goto('/admin/entries/blog/en/hello-world')
  const body = owner.getByRole('textbox', { name: 'Body of the entry' })
  const last = 'Plain words, one idea, and nothing that links anywhere.'

  const library = await openImagePicker(owner, last)
  await expectAccessible(owner)
  await library.getByRole('button', { name: 'Insert A single red pixel' }).click()
  await expect(library).toBeHidden()
  await expect(body.getByRole('img', { name: 'A single red pixel' })).toHaveAttribute(
    'src',
    /\/assets\/[a-z0-9-]+\/ast_[0-9a-f]{26}$/,
  )

  const upload = await openImagePicker(owner, last)
  await upload.getByRole('tab', { name: 'Upload' }).click()
  await upload.locator('input[type="file"]').setInputFiles({
    name: 'blue.png',
    mimeType: 'image/png',
    buffer: blue,
  })
  await upload.getByLabel('What it shows').fill('One blue pixel')
  await expectAccessible(owner)
  await upload.getByRole('button', { name: 'Upload and insert' }).click()
  await expect(upload).toBeHidden()
  await expect(body.getByRole('img', { name: 'One blue pixel' })).toHaveAttribute(
    'src',
    /\/assets\/[a-z0-9-]+\/ast_[0-9a-f]{26}$/,
  )

  await saveNow(owner)
  await owner.getByRole('button', { name: 'View Markdown' }).click()
  const markdown = owner.locator('.cm-content').first()
  await expect(markdown).toContainText(
    /## In shortPlain words, one idea, and nothing that links anywhere\.!\[One blue pixel\]\(asset:ast_[0-9a-f]{26}\)!\[A single red pixel\]\(asset:ast_[0-9a-f]{26}\)$/,
  )
  await expectAccessible(owner)
  await shot(owner, 'editor-images')
  await owner.getByRole('button', { name: 'Edit visually' }).click()

  await owner.goto('/admin/images')
  await expect(
    owner.getByRole('listitem').getByRole('img', { name: 'One blue pixel' }),
  ).toBeVisible()
})

test('the owner uploads a PDF to the library, opens it and copies a link to it', async () => {
  await owner.goto('/admin/images')
  await owner.locator('input[type="file"]').setInputFiles({
    name: 'policy.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.7\n%\u00e2\u00e3\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n'),
  })
  await owner.getByRole('textbox', { name: 'What it shows' }).fill('The privacy policy')
  await owner.getByRole('button', { name: 'Upload' }).click()

  const card = owner.getByRole('listitem').filter({ hasText: 'The privacy policy' })
  await expect(card.getByRole('link', { name: 'Open the PDF' })).toHaveAttribute(
    'href',
    /\/assets\/[a-z0-9-]+\/ast_[0-9a-f]{26}$/,
  )
  await expect(card).toContainText('policy.pdf')
  await expectAccessible(owner)
})

test('the owner gives a collection an image, a reference and a field of JSON, and edits each in the editor', async () => {
  await owner.goto('/admin/settings/collections/talks')
  await expect(owner.getByRole('heading', { name: 'talks', level: 1 })).toBeVisible()
  for (const [key, kind] of [
    ['cover', 'Image of the library'],
    ['related', 'List of texts'],
    ['extra', 'Other (JSON Schema)'],
  ] as const) {
    await owner.getByRole('button', { name: 'Add a field' }).click()
    await owner.getByRole('textbox', { name: 'Name', exact: true }).last().fill(key)
    await owner.getByRole('combobox', { name: 'Kind' }).last().click()
    await owner.getByRole('option', { name: kind, exact: true }).click()
  }
  await owner.getByRole('button', { name: 'Add a rule' }).click()
  await owner.getByRole('combobox', { name: 'Rule' }).last().click()
  await owner.getByRole('option', { name: 'reference', exact: true }).click()
  await owner.getByRole('combobox', { name: 'field*', exact: true }).last().click()
  await owner.getByRole('option', { name: 'related', exact: true }).click()
  await owner.getByRole('textbox', { name: 'collection*', exact: true }).fill('blog')
  await owner.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(owner.getByText('Saved: it applies at once').first()).toBeVisible()

  await owner.goto('/admin/entries/talks/en/a-long-talk')
  const fields = owner.getByRole('region', { name: 'Fields' })
  await expect(
    fields.getByText('The form does not show extra: edit them in the Markdown of the entry.'),
  ).toBeVisible()
  await fields.getByRole('button', { name: 'Choose an image' }).click()
  await owner.getByRole('dialog').getByRole('button', { name: 'Insert A single red pixel' }).click()
  await expect(fields.getByRole('textbox', { name: 'cover' })).toHaveValue(
    /^asset:ast_[0-9a-f]{26}$/,
  )
  await fields.getByRole('button', { name: 'related' }).click()
  await owner.getByRole('option').first().click()
  await owner.keyboard.press('Escape')
  await expect(owner.locator('[data-reka-popper-content-wrapper]')).toHaveCount(0)
  await expectAccessible(owner)
  await saveNow(owner)
  await fields.getByRole('button', { name: 'Open the Markdown' }).click()
  await expect(owner.locator('.cm-content').first()).toContainText(
    /cover: asset:ast_[0-9a-f]{26}related:\s*- [a-z0-9-]+/,
  )
})

test('the owner reads the activity log: what was done, by whom, and the detail of a line', async () => {
  await owner.goto('/admin/settings/activity')
  await expect(owner.getByRole('heading', { name: 'Activity', level: 1 })).toBeVisible()
  const published = owner.getByRole('row', { name: /Published an entry/ }).first()
  await expect(published).toContainText('Olga')
  await expect(published).toContainText('person')
  await expect(published).toContainText('ok')

  await published.getByRole('button', { name: 'Show the detail of publish' }).click()
  await expect(owner.getByRole('dialog').getByText('Declared by the client')).toBeVisible()
  await expectAccessible(owner)
  await owner.keyboard.press('Escape')

  await owner.getByRole('combobox', { name: 'Action' }).click()
  await owner.getByRole('option', { name: 'Approved a review' }).click()
  await expect(owner.getByRole('row', { name: /Approved a review/ }).first()).toBeVisible()
  await expect(owner.getByRole('row', { name: /Published an entry/ })).toHaveCount(0)
  await shot(owner, 'activity-filtered')
})

test('the owner switches the admin to Spanish from the person menu, and it stays Spanish', async () => {
  await owner.goto('/admin/')
  await expect(owner.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible()
  await owner.getByRole('button', { name: /^Olga/ }).click()
  await owner.getByRole('menuitem', { name: 'Language' }).click()
  await owner.getByRole('menuitemcheckbox', { name: 'Español' }).click()

  await expect(owner.getByRole('heading', { name: 'Inicio', level: 1 })).toBeVisible()
  await expect(owner.locator('html')).toHaveAttribute('lang', 'es')
  await expect(owner.getByRole('link', { name: 'Entradas', exact: true })).toBeVisible()
  await expect(owner.getByRole('link', { name: 'Revisiones', exact: true })).toBeVisible()
  await expect(owner.getByRole('heading', { name: 'Lo más leído, últimos 30 días' })).toBeVisible()
  await expectAccessible(owner)

  await owner.reload()
  await expect(owner.getByRole('heading', { name: 'Inicio', level: 1 })).toBeVisible()
  await expect(owner.locator('html')).toHaveAttribute('lang', 'es')
  await owner.goto('/admin/entries')
  await expect(owner.getByRole('heading', { name: 'Entradas', level: 1 })).toBeVisible()
  await expect(
    owner.getByRole('textbox', { name: 'Filtrar por título, slug o etiqueta' }),
  ).toBeVisible()
  await expect(owner.getByRole('listitem', { name: /^Hola mundo, otra vez/ })).toContainText(
    'programada',
  )
  await expectAccessible(owner)
  await shot(owner, 'entries-es')
})

test('the owner publishes and unpublishes several entries at once, from the table', async () => {
  await owner.goto('/admin/entries')
  await owner.getByRole('checkbox', { name: 'Seleccionar Hello world' }).click()
  await owner.getByRole('checkbox', { name: 'Seleccionar Hola mundo, otra vez' }).click()
  const bar = owner.getByRole('toolbar', { name: 'Acciones sobre las filas seleccionadas' })
  await expect(bar).toContainText('2 seleccionadas')
  await expectAccessible(owner)

  await bar.getByRole('button', { name: 'Publicar 2' }).click()
  await expect(owner.getByText('2 publicadas', { exact: true }).first()).toBeVisible()
  await expect(owner.getByRole('listitem', { name: /^Hello world/ })).toContainText('publicada')
  await expect(owner.getByRole('listitem', { name: /^Hola mundo/ })).toContainText('publicada')
  await shot(owner, 'bulk-es')

  await bar.getByRole('button', { name: 'Despublicar 2' }).click()
  await expectAccessible(owner)
  await owner.getByRole('dialog').getByRole('button', { name: 'Despublicar 2' }).click()
  await expect(owner.getByText('2 despublicadas', { exact: true }).first()).toBeVisible()
  await expect(owner.getByRole('listitem', { name: /^Hello world/ })).toContainText('borrador')
  await expect(owner.getByRole('listitem', { name: /^Hola mundo/ })).toContainText('borrador')
})

test('a page loaded before a deploy loads the new version when a file of its own is gone', async () => {
  await owner.goto('/admin/')
  await expect(owner.getByRole('heading', { name: 'Inicio', level: 1 })).toBeVisible()
  const file = /\/admin\/assets\/Tokens-[\w-]+\.js$/
  let asked = 0
  await owner.route(file, async (route) => {
    asked++
    if (asked === 1) await route.fulfill({ status: 404, body: '' })
    else await route.continue()
  })

  await owner.getByRole('link', { name: 'Configuración', exact: true }).click()
  await owner.getByRole('link', { name: 'Tokens', exact: true }).click()
  await expect(owner.getByRole('heading', { name: 'Tokens', level: 1 })).toBeVisible()
  expect(asked).toBe(2)
  await owner.unroute(file)
})

test('the owner moves a draft to the trash from the editor, finds it there and restores it', async () => {
  await owner.goto('/admin/entries/blog/en/hello-world')
  await expect(owner.getByRole('heading', { name: 'Hello world', level: 1 })).toBeVisible()
  await entryAction(owner, 'Mover a la papelera')
  await expect(owner.getByRole('dialog')).toContainText('¿Mover este borrador a la papelera?')
  await expectAccessible(owner)
  await owner.getByRole('dialog').getByRole('button', { name: 'Mover a la papelera' }).click()

  await expect(owner.getByText('Movida a la papelera', { exact: true }).first()).toBeVisible()
  await expect(owner.getByRole('heading', { name: 'Entradas', level: 1 })).toBeVisible()
  await expect(owner.getByRole('listitem', { name: /^Hola mundo/ })).toBeVisible()
  await expect(owner.getByRole('listitem', { name: /^Hello world/ })).toHaveCount(0)

  await owner.getByRole('tab', { name: 'Papelera' }).click()
  const trashed = owner.getByRole('listitem', { name: /^Hello world/ })
  await expect(trashed).toBeVisible()
  await expect(owner.getByRole('listitem', { name: /^Hola mundo/ })).toHaveCount(0)
  await expectAccessible(owner)
  await shot(owner, 'trash-es')

  await trashed.getByRole('button', { name: 'Restaurar Hello world' }).click()
  await expect(owner.getByText('1 restaurada', { exact: true }).first()).toBeVisible()
  await expect(owner.getByRole('listitem', { name: /^Hello world/ })).toHaveCount(0)
  await owner.getByRole('tab', { name: 'Todas' }).click()
  await expect(owner.getByRole('listitem', { name: /^Hello world/ })).toContainText('borrador')

  await owner.getByRole('checkbox', { name: 'Seleccionar Hello world' }).click()
  await owner.getByRole('checkbox', { name: 'Seleccionar Hola mundo, otra vez' }).click()
  const bar = owner.getByRole('toolbar', { name: 'Acciones sobre las filas seleccionadas' })
  await bar.getByRole('button', { name: 'Mover 2 a la papelera' }).click()
  await expect(owner.getByRole('dialog')).toContainText('¿Mover 2 borradores a la papelera?')
  await owner.getByRole('dialog').getByRole('button', { name: 'Mover 2 a la papelera' }).click()
  await expect(owner.getByText('2 movidas a la papelera', { exact: true }).first()).toBeVisible()
  await expect(owner.getByRole('listitem', { name: /^Hola mundo/ })).toHaveCount(0)

  await owner.getByRole('tab', { name: 'Papelera' }).click()
  await owner.getByRole('checkbox', { name: 'Seleccionar Hello world' }).click()
  await owner.getByRole('checkbox', { name: 'Seleccionar Hola mundo, otra vez' }).click()
  await bar.getByRole('button', { name: 'Restaurar 2' }).click()
  await expect(owner.getByText('2 restauradas', { exact: true }).first()).toBeVisible()
  await expect(owner.getByRole('listitem', { name: /^Hola mundo/ })).toHaveCount(0)
})

test('the bar of every page names the site it is of, with the menu to switch to another', async () => {
  await owner.goto('/admin/settings/collections')
  const site = owner.getByRole('button', { name: 'Sitio playground: cambiar a otro' })
  await expect(site).toBeVisible()
  await expectAccessible(owner)
  await site.click()
  await expect(owner.getByRole('menuitemcheckbox', { name: /playground/ })).toBeChecked()
  await owner.keyboard.press('Escape')
})

test('signing in goes back to a page of this Hollware, and never to another host', async () => {
  await owner.goto('/signin?return_to=%2Fadmin%2Fsettings%2Ftokens')
  await owner.getByRole('button', { name: 'Sign in with a passkey' }).click()
  await expect(owner).toHaveURL(/\/admin\/settings\/tokens$/)
  await expect(owner.getByRole('heading', { name: 'Tokens', level: 1 })).toBeVisible()

  await owner.goto('/signin?return_to=%2F%5Cevil.example')
  await owner.getByRole('button', { name: 'Sign in with a passkey' }).click()
  await expect(owner).toHaveURL(new RegExp(`^${target().url}/admin/$`))
  await expect(owner.getByRole('heading', { name: 'Inicio', level: 1 })).toBeVisible()
})

test('the owner changes the URL of a published entry, and the site keeps the old one as a redirect', async () => {
  await owner.goto('/admin/entries/blog/es/hola-mundo')
  await expect(owner.getByRole('heading', { name: /^Hola mundo/, level: 1 })).toBeVisible()
  const change = owner.getByRole('button', { name: /^(Change URL|Cambiar URL)$/ })
  await change.click()
  await owner.getByRole('dialog').getByRole('textbox').fill('hola-de-nuevo')
  await expectAccessible(owner)
  await owner
    .getByRole('dialog')
    .getByRole('button', { name: /^(Change URL|Cambiar URL)$/ })
    .click()
  await expect(owner).toHaveURL(/\/admin\/entries\/blog\/es\/hola-de-nuevo$/)

  await owner.goto('/admin/settings/site/redirects')
  await expect(owner.getByText(/hola-mundo/).first()).toBeVisible()
  await expect(owner.getByText(/hola-de-nuevo/).first()).toBeVisible()

  await owner.goto('/admin/entries/blog/es/hola-de-nuevo')
  await owner.getByRole('button', { name: /^(Change URL|Cambiar URL)$/ }).click()
  await owner.getByRole('dialog').getByRole('textbox').fill('hola-mundo')
  await owner
    .getByRole('dialog')
    .getByRole('button', { name: /^(Change URL|Cambiar URL)$/ })
    .click()
  await expect(owner).toHaveURL(/\/admin\/entries\/blog\/es\/hola-mundo$/)
})

test('the owner sets the narrower copies the images of the site get, in Images', async () => {
  await owner.goto('/admin/settings/site/images')
  const widths = owner.getByRole('textbox', { name: /^(Narrower copies|Copias más angostas)/ })
  await expect(widths).toHaveValue('640, 1280')
  await widths.fill('1600 480')
  await owner
    .getByRole('button', {
      name: /^(Save the image settings|Guardar la configuración de imágenes)$/,
    })
    .click()
  await expect(owner.getByText(/^(Saved|Guardado)/).first()).toBeVisible()
  await owner.reload()
  await expect(widths).toHaveValue('480, 1600')
  const originals = owner.getByRole('switch', {
    name: /^(Keep the original of each image|Guardar el original de cada imagen)$/,
  })
  await expect(originals).toBeChecked()
  const largest = owner.getByRole('spinbutton', {
    name: /^(Largest video or PDF, in megabytes|Video o PDF más grande, en megabytes)/,
  })
  await expect(largest).toHaveValue('100')
  await largest.fill('250')
  await owner
    .getByRole('button', {
      name: /^(Save the image settings|Guardar la configuración de imágenes)$/,
    })
    .click()
  await expect(owner.getByText(/^(Saved|Guardado)/).first()).toBeVisible()
  await owner.reload()
  await expect(largest).toHaveValue('250')
  await largest.fill('100')
  await widths.fill('640, 1280')
  await owner
    .getByRole('button', {
      name: /^(Save the image settings|Guardar la configuración de imágenes)$/,
    })
    .click()
  await expectAccessible(owner)
})

test('the owner finds the daily backups of the site in Backups, keeps them a week, then turns them off', async () => {
  await owner.goto('/admin/settings/site/backups')
  await expect(owner.getByRole('heading', { name: /^(Backups|Respaldos)$/ })).toBeVisible()
  await expect(
    owner.getByText(/^(No backup yet: the first comes after 03:00 UTC\.|Todavía no hay respaldos)/),
  ).toBeVisible()
  const days = owner.getByRole('spinbutton', {
    name: /^(Days each backup is kept|Días que se guarda)/,
  })
  await expect(days).toHaveValue('30')
  await days.fill('7')
  const save = owner.getByRole('button', {
    name: /^(Save the backup settings|Guardar la configuración de respaldos)$/,
  })
  await save.click()
  await expect(owner.getByText(/^(Saved|Guardado)/).first()).toBeVisible()
  await owner.reload()
  await expect(days).toHaveValue('7')
  await owner
    .getByRole('switch', { name: /^(Back this site up each day|Respaldar este sitio)/ })
    .click()
  await expect(days).toBeHidden()
  await save.click()
  await owner.reload()
  await expect(
    owner.getByRole('switch', { name: /^(Back this site up each day|Respaldar este sitio)/ }),
  ).not.toBeChecked()
  await expectAccessible(owner)
})

test('the owner lets a domain in with no invitation, in Sign-in, then turns it off', async () => {
  await owner.goto('/admin/settings/site/signin')
  await expect(owner.getByRole('heading', { name: /^(Sign-in|Inicio de sesión)$/ })).toBeVisible()
  const allow = owner.getByRole('switch', { name: /^(Let people|Dejar entrar)/ })
  const save = owner.getByRole('button', { name: /^(Save who comes in|Guardar quién entra)$/ })
  await allow.click()
  await save.click()
  await expect(owner.getByText(/^(List a domain|Indica un dominio)/)).toBeVisible()
  await owner.getByRole('textbox', { name: /^(Domains|Dominios)$/ }).fill('@Example.com')
  await save.click()
  await expect(owner.getByText(/^(Saved|Guardado)/).first()).toBeVisible()
  await owner.reload()
  await expect(owner.getByRole('textbox', { name: /^(Domains|Dominios)$/ })).toHaveValue(
    'example.com',
  )
  await expectAccessible(owner)
  await allow.click()
  await save.click()
  await owner.reload()
  await expect(allow).not.toBeChecked()
})

test('the owner makes a lasting token for an agent member, with a date it ends, from Agents', async () => {
  await owner.goto('/admin/settings/site/agents')
  await owner
    .getByRole('textbox', { name: /^(Name of the member|Nombre del miembro)$/ })
    .fill('executor')
  await owner
    .getByRole('button', { name: /^(Make an agent member|Crear un miembro agente)$/ })
    .click()
  await owner
    .getByRole('link', { name: /^(Make a token for|Crear un token para) executor$/ })
    .click()
  await expect(owner).toHaveURL(/\/admin\/settings\/tokens\?member=usr_/)
  await expect(owner.getByRole('checkbox', { name: 'content:publish' })).toHaveCount(0)
  await expect(
    owner.getByRole('checkbox', { name: /^(Read token|Token de lectura)$/ }),
  ).toHaveCount(0)
  await owner.getByRole('textbox', { name: /^(Label|Etiqueta)$/ }).fill('executor gateway')
  await owner.getByLabel(/^(Expires on|Vence el)$/).fill('2099-06-30')
  await owner.getByRole('button', { name: /^(Make a token|Crear un token)$/ }).click()
  await expect(owner.getByText(/^hw_pat_/)).toBeVisible()
  const row = owner.getByRole('row').filter({ hasText: 'executor gateway' })
  await expect(row).toContainText(/executor\s*(agent|agente)/)
  await expect(row).toContainText('content:read content:write')
  await expectAccessible(owner)
})

test('the owner sees their passkey and the admin in Tu cuenta, then signs out', async () => {
  await owner.goto('/admin/')
  await expect(owner.getByRole('heading', { name: 'Inicio', level: 1 })).toBeVisible()
  await owner.getByRole('button', { name: /^Olga/ }).click()
  await owner.getByRole('menuitem', { name: 'Tu cuenta' }).click()

  await expect(owner.getByRole('heading', { name: 'Tu cuenta', level: 1 })).toBeVisible()
  const passkeys = owner.getByRole('region', { name: 'Llaves de acceso' })
  await expect(passkeys.getByRole('button', { name: 'Quitar Passkey' })).toBeDisabled()
  await expect(
    passkeys.getByText('Tu última llave de acceso: agrega otra antes de quitarla.'),
  ).toBeVisible()
  const apps = owner.getByRole('region', { name: 'Aplicaciones conectadas' })
  await expect(apps.getByRole('row', { name: /Hollware admin\s*este admin/ })).toBeVisible()
  await expect(apps.getByRole('button', { name: /^Revocar/ })).toHaveCount(0)
  await expectAccessible(owner)
  await shot(owner, 'account-es')

  await passkeys.getByRole('button', { name: 'Renombrar Passkey' }).click()
  await owner.getByRole('dialog').getByRole('textbox').fill('Portátil')
  await owner.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click()
  await expect(passkeys.getByText('Portátil', { exact: true })).toBeVisible()
  const name = owner.getByRole('textbox', { name: 'Tu nombre' })
  await expect(name).toHaveValue('Olga')
  await name.fill('Olga Ruiz')
  await owner.getByRole('button', { name: 'Guardar el nombre' }).click()
  await expect(owner.getByText('Nombre guardado').first()).toBeVisible()
  await owner.reload()
  await expect(owner.getByRole('textbox', { name: 'Tu nombre' })).toHaveValue('Olga Ruiz')

  await owner.getByRole('button', { name: /^Olga/ }).click()
  await owner.getByRole('menuitem', { name: 'Cerrar sesión' }).click()
  await expect(owner.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible()
  await expect(owner).toHaveURL(/\/signin\?return_to=%2Fadmin%2F$/)
  await owner.goto('/admin/')
  await expect(owner).toHaveURL(/\/signin\?return_to=/)
})
