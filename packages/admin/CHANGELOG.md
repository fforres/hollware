# @hollware/admin

## 1.5.1

No changes in this release.

## 1.5.0

### Minor Changes

- [#98](https://github.com/hollware/hollware/pull/98) [`9725c1d`](https://github.com/hollware/hollware/commit/9725c1ddb7f4fcb12c8aa1d9a85ebf2a22a2c3b6) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Two roles join owner, editor and author: an admin runs the site and its people with every scope of an owner but the new `site:owner`, which names, changes and removes owners, deletes and restores sites, reads backups, purges entries and anonymizes people; a reviewer reads and comments. A site may let reviewers in through `access.autoProvision`.

  Invitations are mailed: with a `send_email` binding `EMAIL` of Cloudflare Email Service and `HOLLWARE_EMAIL_FROM`, an invitation that names an address goes to it in the inviter's language, its link is shown to nobody, and the address of whoever accepts it is verified. Without them, or when the mail fails, the admin shows the link as before. An invitation can be renewed with a new link, an expired one stays listed until it is renewed or revoked, and a second invitation of an address or one of a member is refused.

  Every account of a person has an address. An invitation names one, in the admin, in `POST /v1/admin/invitations` and in `hollware invite --email`, and the account made from it keeps it, verified when Hollware mailed the link or when the person signs in with it through a provider. `hollware init` and `npm create hollware` ask for `--owner-email`.

  A person of this Hollware accepts an invitation to another site with the passkey they have, from the setup page, instead of making a second account. In the admin a reviewer reads entries without an editor, and what a person sees follows their scopes.

  Migration `0032_roles_and_invitations` rebuilds `members`, `invitations` and `auth_challenges`. Tokens of an owner made before it carry no `site:owner`: make a new one for `hollware backup` and the site's deletion.

## 1.4.0

### Minor Changes

- [#92](https://github.com/hollware/hollware/pull/92) [`5a5417b`](https://github.com/hollware/hollware/commit/5a5417b38d26786b09f1ba70f7b8081086545b47) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The admin shows what the server holds as it changes: pages read through shared queries of Pinia Colada, every write refreshes what is on screen (the count of reviews in the sidebar, the sites, the collections), and coming back to the tab, or the network, reads again. Reviews and the count of what waits are read again every few seconds while the tab is visible, an entry follows a change made elsewhere when it has no unsaved edits, and a settings form saves against the version it was filled from.

- [#91](https://github.com/hollware/hollware/pull/91) [`66289d3`](https://github.com/hollware/hollware/commit/66289d36d0b71126d34fdd9739ba157be11c8940) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A translation behind its source is no longer a view of Entries, which are the states of an entry: Home lists the translations behind their source, and the entry shows what changed in the source since the translation was saved, beside a link to it.

### Patch Changes

- [#93](https://github.com/hollware/hollware/pull/93) [`2abcc5d`](https://github.com/hollware/hollware/commit/2abcc5dcbf37adfcff71a158e29c306fc96f20a5) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The single-file components of the admin are type-checked, with `vue-tsc` on TypeScript 6.0.3, and the errors it found are fixed.

## 1.3.0

### Minor Changes

- [#89](https://github.com/hollware/hollware/pull/89) [`ac0553d`](https://github.com/hollware/hollware/commit/ac0553d353d78ecba792d2bbf3731c87a69b52d0) Thanks [@sergioazoc](https://github.com/sergioazoc)! - `admin: { path: '/' }` in the config puts the admin at the root of the Worker's origin, such as `https://admin.example.com/`, instead of `/admin/`: its pages answer at `/`, `/entries`, `/reviews`, `/images`, `/settings` and `/callback`, `/admin/…` redirects there with a 301, and its files stay under `/admin/assets/`. The admin's OAuth client is now kept by its redirect URI, so after this release each person signs in to the admin once more.

## 1.2.0

### Minor Changes

- [#88](https://github.com/hollware/hollware/pull/88) [`0cfa409`](https://github.com/hollware/hollware/commit/0cfa409f4f2c3f21326f281241e7d7889f018e89) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Tokens makes a lasting token for an agent member as well as for you: choose the agent under For, or follow the key of the agent in Agents. Its scopes are those an agent may hold, a read token is not offered, and a token of any kind may end on a date (Expires on) as well as after a number of days or never. The table marks the tokens of agents.

## 1.1.0

### Minor Changes

- [#85](https://github.com/hollware/hollware/pull/85) [`5934bf8`](https://github.com/hollware/hollware/commit/5934bf84b1202d8b558c185e71e41312dabcc400) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The admin manages agent members and their subscriptions, shows each review's agents, and lets an owner approve without the required agents.

- [`b4d307a`](https://github.com/hollware/hollware/commit/b4d307ace92e54fe19be97b3ce40e8184fe3ccbf) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The admin and the sign-in pages show Hollware's flame as their icon (`favicon.ico`, `favicon.svg`, `apple-touch-icon.png`). `admin: { favicon: 'https://…' }` in `hollware.config.ts` shows another image: the Worker serves it from its own origin at the same paths.

- [#85](https://github.com/hollware/hollware/pull/85) [`5934bf8`](https://github.com/hollware/hollware/commit/5934bf84b1202d8b558c185e71e41312dabcc400) Thanks [@sergioazoc](https://github.com/sergioazoc)! - People sign in through Google, Microsoft, GitHub, any OpenID Connect provider or Cloudflare Access, with passkeys optional. `auth: { providers: [...], passkeys }` in the config lists the providers, each client secret by the name of its Worker secret; a Microsoft tenant must be one directory (`common`, `organizations` and `consumers` are refused). An account signs in by its provider and subject; its verified email links it to the person who has it, accepts an invitation sent to that address, or makes the person a member of a site whose new `access.autoProvision` lets in that address or its domain. An unverified email links nothing. The account page lists the accounts of providers and adds passkeys, and the last passkey goes when an account of a provider signs the person in. An invitation takes an address (`email` of `POST /v1/admin/invitations`, `hollware invite --email`), `hollware init --owner-email` gives the owner theirs, `hollware doctor` says which secret of a provider the local project lacks, and `npm create hollware` takes `--auth <kind>` with its credentials.

- [#85](https://github.com/hollware/hollware/pull/85) [`5934bf8`](https://github.com/hollware/hollware/commit/5934bf84b1202d8b558c185e71e41312dabcc400) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A review can hold several entries. `request_review` takes `group` (more entries to publish) and `unpublish` (published entries to take off the site), and `publish` without `content:publish` turns its `group` into one review; an entry is in one pending review at most, and asking with one that another review holds answers `conflict` with that `review` and the `failedEntry`. `approve_review` publishes and unpublishes every entry of the review in one step, all or none, but those in its new `exclude`, and answers the new outcome `conflict` with `failedEntry` when one moved since; a new revision of any of its entries cancels the whole review. The new tool `get_review` (`content:read`) reads a review with each entry: what is published, what is proposed and the unified diff between them (`unifiedDiff` of `@hollware/core`, three lines of context). `comment_review` takes `entryId` and `lines` to comment on an entry of the review or on lines of its proposal, and comments answer both. `list_reviews` answers how many entries each review holds (`items`), and the events of a review carry them (`items`). Migrations `0029_review_items.sql` and `0030_review_items_backfill.sql` add the table `review_items`, give each review of before its one entry, and add the anchor of a comment. The admin shows every entry of a review with its diff, lets you leave some out of the approval, approves them all at once, and takes comments on an entry and its lines.

## 1.0.0

### Minor Changes

- [#33](https://github.com/hollware/hollware/pull/33) [`68c4862`](https://github.com/hollware/hollware/commit/68c4862449fd790a9832d5513ce85b95f3af5721) Thanks [@sergioazoc](https://github.com/sergioazoc)! - ⌘K acts on the open entry: publish it, schedule it, view its Markdown or preview it on the site. It also goes to each part of the settings and to the entries of each collection.

- [#60](https://github.com/hollware/hollware/pull/60) [`de4f740`](https://github.com/hollware/hollware/commit/de4f740a8e90c916bd4ee870a085cdd154ef33b3) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The form of an entry edits more of its frontmatter. A field of the image kind, new in the editor of a collection, gets a button that picks an image of the library and writes its `asset:` reference. A field that a `reference` rule points at another collection picks its entries by title, one or several. A field the form cannot show, such as an object, is named above the form with a button that opens the Markdown, where it is edited.

- [#35](https://github.com/hollware/hollware/pull/35) [`04e844d`](https://github.com/hollware/hollware/commit/04e844d90c7d014bb4253bc37ab05a4353282541) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The image picker of the editor uploads an image too, and inserts it at once.

- [#34](https://github.com/hollware/hollware/pull/34) [`1fc58d9`](https://github.com/hollware/hollware/commit/1fc58d952af6e334002587f0e8bb75a670b110cd) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Reviews is an inbox, as in Linear: the reviews on the left, the diff and the comments of the one chosen on the right. J and K move between them, A approves, R asks for changes or rejects, and `?` lists these shortcuts.

- [#31](https://github.com/hollware/hollware/pull/31) [`2155362`](https://github.com/hollware/hollware/commit/215536293ad13f2b8d240971b098765fc1650f39) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Settings has a sidebar of its own, as in Linear, and Site is split into pages: General, Images, Webhooks, Analytics, Backups, Redirects and Danger zone, each under `/admin/settings/site/`.

- [`0647944`](https://github.com/hollware/hollware/commit/06479447b92e584277b0be96162888039e198adb) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Hollware no longer counts page views: a site connects the analytics it already has, and `content_stats` reads them. Connect Cloudflare Web Analytics, PostHog, Plausible or GA4 in the admin (Site, Analytics), with `hollware analytics connect <provider> --credential-file <file>`, or with the new tool `connect_analytics`; the read-only key is tested before it is kept, sealed under `HOLLWARE_SECRET`, and never shown again (`get_analytics`, `disconnect_analytics`).

  To upgrade: remove `beacon` from `hollware` in `nuxt.config`; remove the `analytics_engine_datasets` binding `ANALYTICS` and the variables `HOLLWARE_ANALYTICS_ACCOUNT_ID` and `HOLLWARE_ANALYTICS_DATASET` from the Worker's `wrangler.jsonc`, and delete its secret `HOLLWARE_ANALYTICS_TOKEN` (`wrangler secret delete HOLLWARE_ANALYTICS_TOKEN`); then connect the site's analytics. `POST /events` is gone, and `@hollware/server` no longer exports `AnalyticsWriter` and `PageView`.

- [#71](https://github.com/hollware/hollware/pull/71) [`901959b`](https://github.com/hollware/hollware/commit/901959bff6b8de29b8db6206a47c5b2e03efef55) Thanks [@sergioazoc](https://github.com/sergioazoc)! - An owner can anonymize a person removed from the site, from Former members in People (`POST /v1/admin/people/anonymize`; `GET /v1/admin/people` lists them as `former`). What they wrote stays, and every revision, publication, review, comment, schedule, change of the structure, image and line of the activity log of the site names `FORMER_PERSON` of `@hollware/core` instead of them, without the tokens, IP hashes and client names it held; the name leaves the review events, their tokens and invitations of the site go, and so do the apps they allowed for it. Once no site keeps them, the person goes from the deployment with their passkeys and sessions. The append-only triggers allow those changes only while the anonymization is open, and nothing else; the activity log records `member.anonymize`, naming no one.

- [`f31b9fb`](https://github.com/hollware/hollware/commit/f31b9fbbd99f08ab8d094742813f62dc32834d44) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Fields Hollware fills itself: a collection's `automaticFields` names them and how, `firstPublished` (the date an entry first went out; a date written wins), `lastModified` (the date of a change published after that), `readingTime` (minutes at 200 words a minute) and `wordCount`. Nobody writes them: they are never required, `describe_site` marks them `readOnly`, and the admin's entry form leaves them out. A site reads them filled (RPC, the read API, `createHollware()`), `get_entry` answers their values as `automatic`, and `hollware export --published` writes them into the frontmatter; the Markdown stored stays what was written. The admin chooses them per field on the page of a collection, and a new blog fills its `date`.

- [`83f582a`](https://github.com/hollware/hollware/commit/83f582ab6e2483fe94ba7d3953b3b968835443c7) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The daily backups of a site are configurable: `backups` of its definition turns them off (`enabled: false`) or keeps each one from 1 to 365 days (`retentionDays`, 30 by default), over MCP with `update_site` or in the admin under Site → Backups. A site that turns them off gets no new backup, and the ones it kept go when their retention passes. Backups hold the content only, never the images, which are in the bucket already.

- [`b8b1f62`](https://github.com/hollware/hollware/commit/b8b1f62576bfa753d8f54af8bf871281b4a23ece) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The admin and the sign-in pages take Hollware's own look: the flame pumpkin as the mark, Schibsted Grotesk and JetBrains Mono, a warm black ground and an amber accent. Publishing an entry is the amber button of its page.

- [#26](https://github.com/hollware/hollware/pull/26) [`4fd2a54`](https://github.com/hollware/hollware/commit/4fd2a54a0426ee128403febc89d45e127c7fa5ac) Thanks [@sergioazoc](https://github.com/sergioazoc)! - One style of Markdown for people and agents. `create_draft` and `update_draft` store the canonical Markdown of Comark (`formatMarkdown` in `@hollware/core`) whenever it means the same document, and answer it as `markdown`; the same file in another style answers `unchanged`. Older revisions keep their bytes; an entry takes the canonical form at its next write.

  The admin is laid out like Linear. An entry is a page with its title and its body in a visual editor (TipTap through Nuxt UI): `/` inserts blocks and the components of the collection, a selection gets a bar of formats, blocks drag and move, Comark components are cards with their props, and anything the editor does not know stays a Markdown block. It saves by itself, writes with the same Comark writer the server uses, and opens a file it cannot keep byte for byte in the Markdown view (⌘⇧M). Properties, checks and a live preview, rendered with the pipeline of `@hollware/core`, sit in a side panel; history sits under the body; Publish is the one action of the bar and the rest is in the `⋯` menu. Entries are a list grouped by status with views, filters, keyboard moves (J, K, X) and a floating bar for many at once. Settings (site, collections, people, tokens, activity, account) have their own section at `/settings`; the old paths are gone. `?` lists the shortcuts.

  A violation may carry `code`, which kind of problem of its contract it is, and `params`, the values its message names, so a client can say it in another language; the admin shows the checks in Spanish from them, and the English `message` and `fix` stay as they were. The entry's side panel holds Properties and History; the live preview is gone, since the editor shows the page as it reads.

- [`0235865`](https://github.com/hollware/hollware/commit/0235865719899057dc58f7888208c16f1e990eda) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Daily backups of each site to R2: after 03:00 UTC the cron writes `backups/<site>/<date>.json` to the bucket `MEDIA`, with the definition of the site and every entry, its latest Markdown and the published one, and keeps 30 days. `list_backups` (MCP and the admin's Site page) lists them, `GET /v1/backups/<date>` downloads one with `schema:admin`, and `hollware backup list` and `hollware backup get <date> <dir> [--published]` turn one back into the files `hollware import` reads.

- [`0075a00`](https://github.com/hollware/hollware/commit/0075a0089e21f378c2295b4f26f5626e866bad67) Thanks [@sergioazoc](https://github.com/sergioazoc)! - What people can change, and a way to say no:

  - `reject_review` closes a pending review as `rejected`, with the reason: unlike `request_changes`, it does not ask for another try. The admin's Reviews page has Reject beside Ask for changes. Migration `0021` lets a review be rejected.
  - `update_asset` changes the alt of an image (the admin's Images page edits it). An image of the site written with no alt of its own takes its asset's when a site reads it, and `images-have-alt` no longer flags it.
  - A person changes their own name, and the labels of their passkeys, under Account; nobody else can change them.

- [#63](https://github.com/hollware/hollware/pull/63) [`44149e0`](https://github.com/hollware/hollware/commit/44149e0d5a2921754521b7be0797306cf2d5cd55) Thanks [@sergioazoc](https://github.com/sergioazoc)! - An event no receiver took is no longer lost. When the Queue gives up on an event after five tries, its dead-letter queue, which the Worker now consumes too, marks it as given up on, and the activity log says so (`event.abandon`). Webhooks, in the admin, lists the deliveries that failed, with their last error and whether the Queue still tries, and sends an event again (`GET /v1/admin/deliveries`, `POST /v1/admin/events/:id/retry`). The activity log records that as `event.retry`, and names `move_entry`, `schedule_unpublish`, `app.refresh_reused` and `schedule.unpublish`, which its filter showed blank.

- [#69](https://github.com/hollware/hollware/pull/69) [`b14218b`](https://github.com/hollware/hollware/commit/b14218bbb905f2d8542af396fb83aeeaaa2f437e) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The editor of the admin writes far fewer revisions. It saves 8 seconds after the last change, and at least once a minute while the typing goes on, instead of a second and a half after each pause; it also saves when the tab is hidden, the page is left or another entry opens, such as a translation. Until then the browser keeps what was typed, so a crash loses nothing: the next time the entry opens, the changes come back with a notice, to keep or discard, and changes kept for an older version are offered rather than applied. Home shows an owner how big the database of the deployment is, against the 500 MB of a D1 database on the Free plan (`GET /v1/admin/database`), and `hollware doctor --remote` says it too.

- [#53](https://github.com/hollware/hollware/pull/53) [`786e9a6`](https://github.com/hollware/hollware/commit/786e9a65f63a40cc9533de18e81fba39b3dc6532) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Home shows an owner the first steps of a site until they are done: connect an agent (the `claude mcp add` line of this Hollware, to copy), write the first entry, invite a person and connect the analytics of the site. «Last audit» shows only once there is an audit report.

- [`f16f745`](https://github.com/hollware/hollware/commit/f16f7452e24037ab564f4442839c26b463019d58) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Images. `upload_asset` takes a JPEG, PNG, WebP, AVIF, GIF or SVG, judged by its bytes, and converts it once by the site's new `media` setting (WebP at 85 by default, PNG lossless, GIF with its frames, nothing wider than 2400 px; or AVIF, or the file as it came). An SVG is kept as it is, and refused when anything in it can run. R2 keeps the image and its original; content shows it as `img: asset:ast_…` or `![alt](asset:ast_…)`, which reads of the published site and HTML turn into the URL where the Worker serves it, cached for a year. `list_assets` and `get_asset` read them; the admin has an Images page; `hollware export --assets <dir> --assets-url <path>` writes the images for a site that serves them itself, and without it keeps the originals in `_assets/`, which `hollware import` uploads again under the same ids. A new project binds an R2 bucket (`MEDIA`), which the first deploy creates, and the Images binding (`IMAGES`); `hollware doctor` says when either is missing. Migration 0017 adds the `assets` table.

- [`29e7ecc`](https://github.com/hollware/hollware/commit/29e7ecc893fcb5f145e53b99a7f158b518e423f3) Thanks [@sergioazoc](https://github.com/sergioazoc)! - `media.keepOriginals` (true by default): a site that sets it to `false` keeps only the file it serves and its copies, not the file as it was uploaded, which takes less storage in R2. The download of an original then gives the file served, and `hollware export` names each image by what its bytes are. The admin sets it under Site → Images.

- [`0150c9f`](https://github.com/hollware/hollware/commit/0150c9f4d1be3be699d6987946acd3bc5041e619) Thanks [@sergioazoc](https://github.com/sergioazoc)! - An entry can change its slug: `move_entry` (MCP) and "Change URL" in the admin give it another path and keep its revisions and translations. An entry that was ever published keeps its old slug as a redirect, which `list_redirects`, the RPC method `listRedirects`, `GET /v1/redirects`, `createHollware().redirectFor()` and the admin's Site page answer, so a site serves the old path with a 301; `hollware export --published` writes them to `redirects.json`. Moving a published entry takes content:publish and purges its pages.

- [#70](https://github.com/hollware/hollware/pull/70) [`3b98d87`](https://github.com/hollware/hollware/commit/3b98d8701f82646554a9355e7523addb2ed5b09c) Thanks [@sergioazoc](https://github.com/sergioazoc)! - An owner can delete an entry of the trash for ever, from the trash of Entries in the admin (`POST /v1/admin/entries/:id/purge`): its revisions, publications, reviews and their comments, redirects, schedules and events go with it, and nothing brings it back. The record of the purge (`entry_purges`, who and when) is what lets the append-only triggers delete those rows, and it is never deleted itself; every other revision and publication stays append-only. The activity log records `entry.purge`.

- [`5e4bee1`](https://github.com/hollware/hollware/commit/5e4bee1adf9d2e119b90ca4ae3c5e07d8055c260) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Responsive images: when an image is uploaded, Hollware also makes its narrower copies, the `media.widths` of the site (640 and 1280 pixels by default, `[]` for none), served at `<url>/<width>`. `upload_asset`, `get_asset` and `list_assets` answer `widths` and `srcset`; the HTML of `get_entry`, and the document a site reads, give each image its `srcset`, `sizes`, `width` and `height`; and a summary read by a site (`get_entry`, `list_entries`, `createHollware()`) carries `images`, the size and `srcset` of each image its frontmatter names, by URL, to lay out a cover. The admin sets the format, quality, widest width and copies in Site, and shows the copies of each image. Images uploaded before keep none.

- [#44](https://github.com/hollware/hollware/pull/44) [`23bb496`](https://github.com/hollware/hollware/commit/23bb49660659646a12ea627757b245876269d31a) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A review shows the revision asked for as its body reads, in a Preview tab next to the changes, and opens it on the site through a preview link. A reviewer no longer has to read YAML and Markdown to judge a change.

- [`1ab4a4c`](https://github.com/hollware/hollware/commit/1ab4a4c26b492dedc77b1e1289ab883b4a0124d3) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The history of an entry, over MCP and in the admin. `list_revisions` lists every revision of an entry, newest first, with who wrote it, when, what the contracts said, and which one the site shows; `get_revision` reads the Markdown of one; `restore_revision` goes back to one, as a new revision, so nothing is ever deleted or rewritten. The admin has a History tab on each entry: a revision opens beside the latest one, and "Restore this version" goes back to it.

- [#52](https://github.com/hollware/hollware/pull/52) [`e6c6fb7`](https://github.com/hollware/hollware/commit/e6c6fb74ce757f74d215564a5174133e2879b1d3) Thanks [@sergioazoc](https://github.com/sergioazoc)! - An invitation that waits can be revoked, and its link stops working at once: from People in the admin (`POST /v1/admin/invitations/:id/revoke`), or with `hollware invite revoke <id>` after `hollware invite list`. The activity log records it as `invitation.revoke`.

- [`4c03dd3`](https://github.com/hollware/hollware/commit/4c03dd3f8fb3a366f095b3f8b84c4704819b714f) Thanks [@sergioazoc](https://github.com/sergioazoc)! - An entry can leave the site at a time: `schedule_unpublish` (MCP) and "Unpublish later" in the admin keep a published entry live until then, and the cron unpublishes it in the name of who scheduled it, if they may still publish. `get_entry` says when, as `unpublishAt`; null cancels it, and an unpublish before the time drops it.

- [#40](https://github.com/hollware/hollware/pull/40) [`9305e2d`](https://github.com/hollware/hollware/commit/9305e2dc7bb336c97523a05ea79190c2f733b5c6) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A personal token expires after 90 days unless its maker asks for other days or for none: `hollware token create` takes `--no-expiry`, the admin's Tokens page has a "Never expires" box, and `POST /v1/admin/tokens` takes `expiresInDays: null`. A read token still never expires unless it is given days.

- [`bce8006`](https://github.com/hollware/hollware/commit/bce80069a466f41ee929f33bd11c302b92e9e3a2) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A translation says when its source moved past it: `translationOutdated` is true for an entry in another locale than the site's default whose source, the entry of its group in the default locale, was changed after it was saved, until it is saved again. In list_entries, get_entry and get_translations; the admin marks it "behind its source" and filters by it.

- [#41](https://github.com/hollware/hollware/pull/41) [`2244160`](https://github.com/hollware/hollware/commit/2244160693dc307127bced011214b59080832dba) Thanks [@sergioazoc](https://github.com/sergioazoc)! - An entry that waits for review says so in the editor, with a link to its review, and a change to it is not saved until the person chooses: discard it, review the request, or save and cancel the request. Before, an autosave cancelled the request of the author without a word. `list_reviews` takes `entryId` to list the requests of one entry, and Reviews opens the one named in `?review=`.

### Patch Changes

- [#51](https://github.com/hollware/hollware/pull/51) [`f5b2322`](https://github.com/hollware/hollware/commit/f5b2322f826ee18573530e12e5490242e4a5db69) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The admin has landmarks a screen reader can move between: the content of each page is the main one, the sidebar is one navigation named «Admin», and the side panel of the editor is complementary. A skip link, the first thing Tab reaches, goes straight to the content.

- [#56](https://github.com/hollware/hollware/pull/56) [`af2ac74`](https://github.com/hollware/hollware/commit/af2ac7447acf214524e6ed94e793b41eb6d4aa73) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The editor and Reviews fit a phone: on a narrow screen the editor hides its breadcrumb and opens with its side panel closed, a review keeps its title on a row of its own, and the diff is one column instead of two.

- [#55](https://github.com/hollware/hollware/pull/55) [`77b98b8`](https://github.com/hollware/hollware/commit/77b98b8e91e34b6b11c70adb16ed5fe35efda837) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Comark 0.8.1, with its fixes for URLs, markup and nested props. The documents of the shared fixtures come out the same, byte for byte, as with 0.7.0, and the cron reparses the revisions that 0.7.0 parsed. Two things change. A code block renders its language as `data-language` on the `<pre>`. And as Comark keeps 49 levels of nesting and drops the text below them, a document that nests elements more than 49 levels deep is refused with its fix, where 100 was the limit, so no word is lost quietly.

- [`35bafa0`](https://github.com/hollware/hollware/commit/35bafa07af847f1810905eaa5963a71f98b2c7cd) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The unchanged lines a diff folds (in Reviews and in the history of an entry) are a flat band in the colors of the admin, with the number of lines and a way to show them, in English or Spanish, instead of the merge view's light gradient.

- [#46](https://github.com/hollware/hollware/pull/46) [`62573fd`](https://github.com/hollware/hollware/commit/62573fd1ce9d80aabb772ea1b00e88d375155586) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The dimmed text of the admin is lighter (`[#878074](https://github.com/hollware/hollware/issues/878074)`, the step 500 of Carbón), so it reaches the 4.5:1 contrast of WCAG AA on every ground of the theme; it had 4.09:1 on the panels.

- [#74](https://github.com/hollware/hollware/pull/74) [`bdeb962`](https://github.com/hollware/hollware/commit/bdeb9625dc9df025bd8eeeaa45cb8ae6db05ae8c) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The editor reads the copy the browser kept once it knows who is signed in: on a page loaded cold, the entry could arrive first, and the copy of a tab that closed was ignored. Typing back to the saved text also says Saved again, instead of Unsaved changes until the next save.

- [#24](https://github.com/hollware/hollware/pull/24) [`73110f5`](https://github.com/hollware/hollware/commit/73110f5317dd9da454ad45a84baccedd1403767a) Thanks [@sergioazoc](https://github.com/sergioazoc)! - An upload that opens on an XML declaration and many comments no longer stalls the check of its format, and a URL or a path with thousands of trailing slashes no longer takes seconds to trim: both are read in linear time.

- [#24](https://github.com/hollware/hollware/pull/24) [`73110f5`](https://github.com/hollware/hollware/commit/73110f5317dd9da454ad45a84baccedd1403767a) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The packages carry no comments but the TSDoc of their public API, and the help of the CLI and the descriptions of the MCP tools no longer cite decision records the repository does not have. The starter's `AGENTS.md` now says what each setting of its `wrangler.jsonc` is for.

- [#48](https://github.com/hollware/hollware/pull/48) [`5984354`](https://github.com/hollware/hollware/commit/5984354fc132c15b8ab5c125585f16baa37a8363) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Each page of the admin has a title of its own, such as `Reviews · my-site · Hollware`, and an entry the title it was given, so tabs and screen readers tell them apart.

- [`1310c51`](https://github.com/hollware/hollware/commit/1310c515a6ee07656aac57f3d5cd0fa0e824dd83) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The READMEs on npm say what each package is and how it is used, instead of "pre-alpha, not usable yet"; the CLI's lists `dev` and `mcp-config`.

- [`8c9de8f`](https://github.com/hollware/hollware/commit/8c9de8f4eb46eedcad1f4bf0635ae80acd678edf) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The count under every table of the admin names the rows of its page, "1–25 of 120", and what a filter left, "1–3 of 3, filtered from 120"; it kept the number it read before the rows arrived.

## 1.0.0-rc.11

No changes in this release.

## 1.0.0-rc.10

### Patch Changes

- [#74](https://github.com/hollware/hollware/pull/74) [`bdeb962`](https://github.com/hollware/hollware/commit/bdeb9625dc9df025bd8eeeaa45cb8ae6db05ae8c) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The editor reads the copy the browser kept once it knows who is signed in: on a page loaded cold, the entry could arrive first, and the copy of a tab that closed was ignored. Typing back to the saved text also says Saved again, instead of Unsaved changes until the next save.

## 1.0.0-rc.9

### Minor Changes

- [#33](https://github.com/hollware/hollware/pull/33) [`68c4862`](https://github.com/hollware/hollware/commit/68c4862449fd790a9832d5513ce85b95f3af5721) Thanks [@sergioazoc](https://github.com/sergioazoc)! - ⌘K acts on the open entry: publish it, schedule it, view its Markdown or preview it on the site. It also goes to each part of the settings and to the entries of each collection.

- [#60](https://github.com/hollware/hollware/pull/60) [`de4f740`](https://github.com/hollware/hollware/commit/de4f740a8e90c916bd4ee870a085cdd154ef33b3) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The form of an entry edits more of its frontmatter. A field of the image kind, new in the editor of a collection, gets a button that picks an image of the library and writes its `asset:` reference. A field that a `reference` rule points at another collection picks its entries by title, one or several. A field the form cannot show, such as an object, is named above the form with a button that opens the Markdown, where it is edited.

- [#35](https://github.com/hollware/hollware/pull/35) [`04e844d`](https://github.com/hollware/hollware/commit/04e844d90c7d014bb4253bc37ab05a4353282541) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The image picker of the editor uploads an image too, and inserts it at once.

- [#34](https://github.com/hollware/hollware/pull/34) [`1fc58d9`](https://github.com/hollware/hollware/commit/1fc58d952af6e334002587f0e8bb75a670b110cd) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Reviews is an inbox, as in Linear: the reviews on the left, the diff and the comments of the one chosen on the right. J and K move between them, A approves, R asks for changes or rejects, and `?` lists these shortcuts.

- [#31](https://github.com/hollware/hollware/pull/31) [`2155362`](https://github.com/hollware/hollware/commit/215536293ad13f2b8d240971b098765fc1650f39) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Settings has a sidebar of its own, as in Linear, and Site is split into pages: General, Images, Webhooks, Analytics, Backups, Redirects and Danger zone, each under `/admin/settings/site/`.

- [#71](https://github.com/hollware/hollware/pull/71) [`901959b`](https://github.com/hollware/hollware/commit/901959bff6b8de29b8db6206a47c5b2e03efef55) Thanks [@sergioazoc](https://github.com/sergioazoc)! - An owner can anonymize a person removed from the site, from Former members in People (`POST /v1/admin/people/anonymize`; `GET /v1/admin/people` lists them as `former`). What they wrote stays, and every revision, publication, review, comment, schedule, change of the structure, image and line of the activity log of the site names `FORMER_PERSON` of `@hollware/core` instead of them, without the tokens, IP hashes and client names it held; the name leaves the review events, their tokens and invitations of the site go, and so do the apps they allowed for it. Once no site keeps them, the person goes from the deployment with their passkeys and sessions. The append-only triggers allow those changes only while the anonymization is open, and nothing else; the activity log records `member.anonymize`, naming no one.

- [#26](https://github.com/hollware/hollware/pull/26) [`4fd2a54`](https://github.com/hollware/hollware/commit/4fd2a54a0426ee128403febc89d45e127c7fa5ac) Thanks [@sergioazoc](https://github.com/sergioazoc)! - One style of Markdown for people and agents. `create_draft` and `update_draft` store the canonical Markdown of Comark (`formatMarkdown` in `@hollware/core`) whenever it means the same document, and answer it as `markdown`; the same file in another style answers `unchanged`. Older revisions keep their bytes; an entry takes the canonical form at its next write.

  The admin is laid out like Linear. An entry is a page with its title and its body in a visual editor (TipTap through Nuxt UI): `/` inserts blocks and the components of the collection, a selection gets a bar of formats, blocks drag and move, Comark components are cards with their props, and anything the editor does not know stays a Markdown block. It saves by itself, writes with the same Comark writer the server uses, and opens a file it cannot keep byte for byte in the Markdown view (⌘⇧M). Properties, checks and a live preview, rendered with the pipeline of `@hollware/core`, sit in a side panel; history sits under the body; Publish is the one action of the bar and the rest is in the `⋯` menu. Entries are a list grouped by status with views, filters, keyboard moves (J, K, X) and a floating bar for many at once. Settings (site, collections, people, tokens, activity, account) have their own section at `/settings`; the old paths are gone. `?` lists the shortcuts.

  A violation may carry `code`, which kind of problem of its contract it is, and `params`, the values its message names, so a client can say it in another language; the admin shows the checks in Spanish from them, and the English `message` and `fix` stay as they were. The entry's side panel holds Properties and History; the live preview is gone, since the editor shows the page as it reads.

- [#63](https://github.com/hollware/hollware/pull/63) [`44149e0`](https://github.com/hollware/hollware/commit/44149e0d5a2921754521b7be0797306cf2d5cd55) Thanks [@sergioazoc](https://github.com/sergioazoc)! - An event no receiver took is no longer lost. When the Queue gives up on an event after five tries, its dead-letter queue, which the Worker now consumes too, marks it as given up on, and the activity log says so (`event.abandon`). Webhooks, in the admin, lists the deliveries that failed, with their last error and whether the Queue still tries, and sends an event again (`GET /v1/admin/deliveries`, `POST /v1/admin/events/:id/retry`). The activity log records that as `event.retry`, and names `move_entry`, `schedule_unpublish`, `app.refresh_reused` and `schedule.unpublish`, which its filter showed blank.

- [#69](https://github.com/hollware/hollware/pull/69) [`b14218b`](https://github.com/hollware/hollware/commit/b14218bbb905f2d8542af396fb83aeeaaa2f437e) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The editor of the admin writes far fewer revisions. It saves 8 seconds after the last change, and at least once a minute while the typing goes on, instead of a second and a half after each pause; it also saves when the tab is hidden, the page is left or another entry opens, such as a translation. Until then the browser keeps what was typed, so a crash loses nothing: the next time the entry opens, the changes come back with a notice, to keep or discard, and changes kept for an older version are offered rather than applied. Home shows an owner how big the database of the deployment is, against the 500 MB of a D1 database on the Free plan (`GET /v1/admin/database`), and `hollware doctor --remote` says it too.

- [#53](https://github.com/hollware/hollware/pull/53) [`786e9a6`](https://github.com/hollware/hollware/commit/786e9a65f63a40cc9533de18e81fba39b3dc6532) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Home shows an owner the first steps of a site until they are done: connect an agent (the `claude mcp add` line of this Hollware, to copy), write the first entry, invite a person and connect the analytics of the site. «Last audit» shows only once there is an audit report.

- [#70](https://github.com/hollware/hollware/pull/70) [`3b98d87`](https://github.com/hollware/hollware/commit/3b98d8701f82646554a9355e7523addb2ed5b09c) Thanks [@sergioazoc](https://github.com/sergioazoc)! - An owner can delete an entry of the trash for ever, from the trash of Entries in the admin (`POST /v1/admin/entries/:id/purge`): its revisions, publications, reviews and their comments, redirects, schedules and events go with it, and nothing brings it back. The record of the purge (`entry_purges`, who and when) is what lets the append-only triggers delete those rows, and it is never deleted itself; every other revision and publication stays append-only. The activity log records `entry.purge`.

- [#44](https://github.com/hollware/hollware/pull/44) [`23bb496`](https://github.com/hollware/hollware/commit/23bb49660659646a12ea627757b245876269d31a) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A review shows the revision asked for as its body reads, in a Preview tab next to the changes, and opens it on the site through a preview link. A reviewer no longer has to read YAML and Markdown to judge a change.

- [#52](https://github.com/hollware/hollware/pull/52) [`e6c6fb7`](https://github.com/hollware/hollware/commit/e6c6fb74ce757f74d215564a5174133e2879b1d3) Thanks [@sergioazoc](https://github.com/sergioazoc)! - An invitation that waits can be revoked, and its link stops working at once: from People in the admin (`POST /v1/admin/invitations/:id/revoke`), or with `hollware invite revoke <id>` after `hollware invite list`. The activity log records it as `invitation.revoke`.

- [#40](https://github.com/hollware/hollware/pull/40) [`9305e2d`](https://github.com/hollware/hollware/commit/9305e2dc7bb336c97523a05ea79190c2f733b5c6) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A personal token expires after 90 days unless its maker asks for other days or for none: `hollware token create` takes `--no-expiry`, the admin's Tokens page has a "Never expires" box, and `POST /v1/admin/tokens` takes `expiresInDays: null`. A read token still never expires unless it is given days.

- [#41](https://github.com/hollware/hollware/pull/41) [`2244160`](https://github.com/hollware/hollware/commit/2244160693dc307127bced011214b59080832dba) Thanks [@sergioazoc](https://github.com/sergioazoc)! - An entry that waits for review says so in the editor, with a link to its review, and a change to it is not saved until the person chooses: discard it, review the request, or save and cancel the request. Before, an autosave cancelled the request of the author without a word. `list_reviews` takes `entryId` to list the requests of one entry, and Reviews opens the one named in `?review=`.

### Patch Changes

- [#51](https://github.com/hollware/hollware/pull/51) [`f5b2322`](https://github.com/hollware/hollware/commit/f5b2322f826ee18573530e12e5490242e4a5db69) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The admin has landmarks a screen reader can move between: the content of each page is the main one, the sidebar is one navigation named «Admin», and the side panel of the editor is complementary. A skip link, the first thing Tab reaches, goes straight to the content.

- [#56](https://github.com/hollware/hollware/pull/56) [`af2ac74`](https://github.com/hollware/hollware/commit/af2ac7447acf214524e6ed94e793b41eb6d4aa73) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The editor and Reviews fit a phone: on a narrow screen the editor hides its breadcrumb and opens with its side panel closed, a review keeps its title on a row of its own, and the diff is one column instead of two.

- [#55](https://github.com/hollware/hollware/pull/55) [`77b98b8`](https://github.com/hollware/hollware/commit/77b98b8e91e34b6b11c70adb16ed5fe35efda837) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Comark 0.8.1, with its fixes for URLs, markup and nested props. The documents of the shared fixtures come out the same, byte for byte, as with 0.7.0, and the cron reparses the revisions that 0.7.0 parsed. Two things change. A code block renders its language as `data-language` on the `<pre>`. And as Comark keeps 49 levels of nesting and drops the text below them, a document that nests elements more than 49 levels deep is refused with its fix, where 100 was the limit, so no word is lost quietly.

- [#46](https://github.com/hollware/hollware/pull/46) [`62573fd`](https://github.com/hollware/hollware/commit/62573fd1ce9d80aabb772ea1b00e88d375155586) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The dimmed text of the admin is lighter (`[#878074](https://github.com/hollware/hollware/issues/878074)`, the step 500 of Carbón), so it reaches the 4.5:1 contrast of WCAG AA on every ground of the theme; it had 4.09:1 on the panels.

- [#24](https://github.com/hollware/hollware/pull/24) [`73110f5`](https://github.com/hollware/hollware/commit/73110f5317dd9da454ad45a84baccedd1403767a) Thanks [@sergioazoc](https://github.com/sergioazoc)! - An upload that opens on an XML declaration and many comments no longer stalls the check of its format, and a URL or a path with thousands of trailing slashes no longer takes seconds to trim: both are read in linear time.

- [#24](https://github.com/hollware/hollware/pull/24) [`73110f5`](https://github.com/hollware/hollware/commit/73110f5317dd9da454ad45a84baccedd1403767a) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The packages carry no comments but the TSDoc of their public API, and the help of the CLI and the descriptions of the MCP tools no longer cite decision records the repository does not have. The starter's `AGENTS.md` now says what each setting of its `wrangler.jsonc` is for.

- [#48](https://github.com/hollware/hollware/pull/48) [`5984354`](https://github.com/hollware/hollware/commit/5984354fc132c15b8ab5c125585f16baa37a8363) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Each page of the admin has a title of its own, such as `Reviews · my-site · Hollware`, and an entry the title it was given, so tabs and screen readers tell them apart.

## 1.0.0-rc.8

No changes in this release.

## 1.0.0-rc.7

### Minor Changes

- [`0647944`](https://github.com/hollware/hollware/commit/06479447b92e584277b0be96162888039e198adb) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Hollware no longer counts page views: a site connects the analytics it already has, and `content_stats` reads them (ADR-040). Connect Cloudflare Web Analytics, PostHog, Plausible or GA4 in the admin (Site, Analytics), with `hollware analytics connect <provider> --credential-file <file>`, or with the new tool `connect_analytics`; the read-only key is tested before it is kept, sealed under `HOLLWARE_SECRET`, and never shown again (`get_analytics`, `disconnect_analytics`).

  To upgrade: remove `beacon` from `hollware` in `nuxt.config`; remove the `analytics_engine_datasets` binding `ANALYTICS` and the variables `HOLLWARE_ANALYTICS_ACCOUNT_ID` and `HOLLWARE_ANALYTICS_DATASET` from the Worker's `wrangler.jsonc`, and delete its secret `HOLLWARE_ANALYTICS_TOKEN` (`wrangler secret delete HOLLWARE_ANALYTICS_TOKEN`); then connect the site's analytics. `POST /events` is gone, and `@hollware/server` no longer exports `AnalyticsWriter` and `PageView`.

## 1.0.0-rc.6

### Minor Changes

- [`b8b1f62`](https://github.com/hollware/hollware/commit/b8b1f62576bfa753d8f54af8bf871281b4a23ece) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The admin and the sign-in pages take Hollware's own look (ADR-039): the flame pumpkin as the mark, Schibsted Grotesk and JetBrains Mono, a warm black ground and an amber accent. Publishing an entry is the amber button of its page.

## 1.0.0-rc.5

### Patch Changes

- [`35bafa0`](https://github.com/hollware/hollware/commit/35bafa07af847f1810905eaa5963a71f98b2c7cd) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The unchanged lines a diff folds (in Reviews and in the history of an entry) are a flat band in the colors of the admin, with the number of lines and a way to show them, in English or Spanish, instead of the merge view's light gradient.

## 1.0.0-rc.4

No changes in this release.

## 1.0.0-rc.3

### Minor Changes

- [`f31b9fb`](https://github.com/hollware/hollware/commit/f31b9fbbd99f08ab8d094742813f62dc32834d44) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Fields Hollware fills itself: a collection's `automaticFields` names them and how, `firstPublished` (the date an entry first went out; a date written wins), `lastModified` (the date of a change published after that), `readingTime` (minutes at 200 words a minute) and `wordCount`. Nobody writes them: they are never required, `describe_site` marks them `readOnly`, and the admin's entry form leaves them out. A site reads them filled (RPC, the read API, `createHollware()`), `get_entry` answers their values as `automatic`, and `hollware export --published` writes them into the frontmatter; the Markdown stored stays what was written. The admin chooses them per field on the page of a collection, and a new blog fills its `date`.

- [`83f582a`](https://github.com/hollware/hollware/commit/83f582ab6e2483fe94ba7d3953b3b968835443c7) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The daily backups of a site are configurable: `backups` of its definition turns them off (`enabled: false`) or keeps each one from 1 to 365 days (`retentionDays`, 30 by default), over MCP with `update_site` or in the admin under Site → Backups. A site that turns them off gets no new backup, and the ones it kept go when their retention passes. Backups hold the content only, never the images, which are in the bucket already.

- [`0235865`](https://github.com/hollware/hollware/commit/0235865719899057dc58f7888208c16f1e990eda) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Daily backups of each site to R2: after 03:00 UTC the cron writes `backups/<site>/<date>.json` to the bucket `MEDIA`, with the definition of the site and every entry, its latest Markdown and the published one, and keeps 30 days. `list_backups` (MCP and the admin's Site page) lists them, `GET /v1/backups/<date>` downloads one with `schema:admin`, and `hollware backup list` and `hollware backup get <date> <dir> [--published]` turn one back into the files `hollware import` reads.

- [`0075a00`](https://github.com/hollware/hollware/commit/0075a0089e21f378c2295b4f26f5626e866bad67) Thanks [@sergioazoc](https://github.com/sergioazoc)! - What people can change, and a way to say no:

  - `reject_review` closes a pending review as `rejected`, with the reason: unlike `request_changes`, it does not ask for another try. The admin's Reviews page has Reject beside Ask for changes. Migration `0021` lets a review be rejected.
  - `update_asset` changes the alt of an image (the admin's Images page edits it). An image of the site written with no alt of its own takes its asset's when a site reads it, and `images-have-alt` no longer flags it.
  - A person changes their own name, and the labels of their passkeys, under Account; nobody else can change them.

- [`29e7ecc`](https://github.com/hollware/hollware/commit/29e7ecc893fcb5f145e53b99a7f158b518e423f3) Thanks [@sergioazoc](https://github.com/sergioazoc)! - `media.keepOriginals` (true by default): a site that sets it to `false` keeps only the file it serves and its copies, not the file as it was uploaded, which takes less storage in R2. The download of an original then gives the file served, and `hollware export` names each image by what its bytes are. The admin sets it under Site → Images.

- [`0150c9f`](https://github.com/hollware/hollware/commit/0150c9f4d1be3be699d6987946acd3bc5041e619) Thanks [@sergioazoc](https://github.com/sergioazoc)! - An entry can change its slug: `move_entry` (MCP) and "Change URL" in the admin give it another path and keep its revisions and translations. An entry that was ever published keeps its old slug as a redirect, which `list_redirects`, the RPC method `listRedirects`, `GET /v1/redirects`, `createHollware().redirectFor()` and the admin's Site page answer, so a site serves the old path with a 301; `hollware export --published` writes them to `redirects.json`. Moving a published entry takes content:publish and purges its pages.

- [`5e4bee1`](https://github.com/hollware/hollware/commit/5e4bee1adf9d2e119b90ca4ae3c5e07d8055c260) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Responsive images: when an image is uploaded, Hollware also makes its narrower copies, the `media.widths` of the site (640 and 1280 pixels by default, `[]` for none), served at `<url>/<width>`. `upload_asset`, `get_asset` and `list_assets` answer `widths` and `srcset`; the HTML of `get_entry`, and the document a site reads, give each image its `srcset`, `sizes`, `width` and `height`; and a summary read by a site (`get_entry`, `list_entries`, `createHollware()`) carries `images`, the size and `srcset` of each image its frontmatter names, by URL, to lay out a cover. The admin sets the format, quality, widest width and copies in Site, and shows the copies of each image. Images uploaded before keep none.

- [`1ab4a4c`](https://github.com/hollware/hollware/commit/1ab4a4c26b492dedc77b1e1289ab883b4a0124d3) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The history of an entry, over MCP and in the admin. `list_revisions` lists every revision of an entry, newest first, with who wrote it, when, what the contracts said, and which one the site shows; `get_revision` reads the Markdown of one; `restore_revision` goes back to one, as a new revision, so nothing is ever deleted or rewritten. The admin has a History tab on each entry: a revision opens beside the latest one, and "Restore this version" goes back to it.

- [`4c03dd3`](https://github.com/hollware/hollware/commit/4c03dd3f8fb3a366f095b3f8b84c4704819b714f) Thanks [@sergioazoc](https://github.com/sergioazoc)! - An entry can leave the site at a time: `schedule_unpublish` (MCP) and "Unpublish later" in the admin keep a published entry live until then, and the cron unpublishes it in the name of who scheduled it, if they may still publish. `get_entry` says when, as `unpublishAt`; null cancels it, and an unpublish before the time drops it.

- [`bce8006`](https://github.com/hollware/hollware/commit/bce80069a466f41ee929f33bd11c302b92e9e3a2) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A translation says when its source moved past it: `translationOutdated` is true for an entry in another locale than the site's default whose source, the entry of its group in the default locale, was changed after it was saved, until it is saved again. In list_entries, get_entry and get_translations; the admin marks it "behind its source" and filters by it.

### Patch Changes

- [`1310c51`](https://github.com/hollware/hollware/commit/1310c515a6ee07656aac57f3d5cd0fa0e824dd83) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The READMEs on npm say what each package is and how it is used, instead of "pre-alpha, not usable yet"; the CLI's lists `dev` and `mcp-config`.

- [`8c9de8f`](https://github.com/hollware/hollware/commit/8c9de8f4eb46eedcad1f4bf0635ae80acd678edf) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The count under every table of the admin names the rows of its page, "1–25 of 120", and what a filter left, "1–3 of 3, filtered from 120"; it kept the number it read before the rows arrived.

## 1.0.0-rc.2

### Minor Changes

- [`f16f745`](https://github.com/hollware/hollware/commit/f16f7452e24037ab564f4442839c26b463019d58) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Images (ADR-038). `upload_asset` takes a JPEG, PNG, WebP, AVIF, GIF or SVG, judged by its bytes, and converts it once by the site's new `media` setting (WebP at 85 by default, PNG lossless, GIF with its frames, nothing wider than 2400 px; or AVIF, or the file as it came). An SVG is kept as it is, and refused when anything in it can run. R2 keeps the image and its original; content shows it as `img: asset:ast_…` or `![alt](asset:ast_…)`, which reads of the published site and HTML turn into the URL where the Worker serves it, cached for a year. `list_assets` and `get_asset` read them; the admin has an Images page; `hollware export --assets <dir> --assets-url <path>` writes the images for a site that serves them itself, and without it keeps the originals in `_assets/`, which `hollware import` uploads again under the same ids. A new project binds an R2 bucket (`MEDIA`), which the first deploy creates, and the Images binding (`IMAGES`); `hollware doctor` says when either is missing. Migration 0017 adds the `assets` table.

## 1.0.0-rc.1

No changes in this release.

## 1.0.0-rc.0

No changes in this release.

## 0.11.0

### Minor Changes

- [`9e72522`](https://github.com/hollware/hollware/commit/9e725225be6bf8e85518f2521b21e76b9109681b) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The admin has an Account page, from the person menu, where a person removes a passkey, revokes an app they connected or signs out everywhere, and the person menu signs this browser out.

- [`069c95f`](https://github.com/hollware/hollware/commit/069c95f1e940ea4f9ac013cac3a69d5ad5d7732d) Thanks [@sergioazoc](https://github.com/sergioazoc)! - An activity log of who did what (ADR-037). Every operation that is not a read, every change of tokens, people and invitations in the admin, sign-in and sign-out, an invitation accepted, an app allowed or revoked, and each scheduled publication write a line: who did it as Hollware verified it (a person, a token, an app, or the deployment), what the client declared apart, the action, its target and its outcome, refusals of a scope included. The log is append-only in D1 (migration `0016_audit_log`). Owners read it on the admin's Activity page and download it as CSV.

  The owner decides what it keeps, in the site's `audit`: `ipAddresses` is `off` by default (`hashed` keeps an HMAC of each address keyed by the site, never the address), and `retentionDays` is `null` by default (forever), or 30 to 3650 days. `hollware init` and `npm create hollware` take `--ip-addresses` and `--audit-retention-days`.

- [`304e18d`](https://github.com/hollware/hollware/commit/304e18d68482c88db6987e2453bcfa0b75467595) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A person in the admin opens the latest revision of an entry, a draft included, on the real site before it is published. "Preview on the site" makes a signed link of one hour for that entry (`hw_prv_…`, `POST /v1/admin/preview`, `preview.create` in the activity log), and `getEntry` takes it as `preview` over the RPC binding, the read API (`?preview=`) and `@hollware/client`; a token that does not hold is an error, never the published version. The token is in the URL once: `@hollware/nuxt` and the new `hollwarePreview()` middleware of `@hollware/astro` answer the link with a `303` to the same URL without `?hollware-preview=` and keep the token in the `hollware_preview` cookie (HttpOnly, SameSite=Lax, one hour, Secure but on localhost), `useHollwareEntry` and the live loader (`getLiveEntry('blog', { id, preview })`) read it from there, a token Hollware refuses as expired or invalid clears the cookie, and a previewed page is never cached. `@hollware/client` exports the pure parts. It needs the Worker secret `HOLLWARE_SECRET`.

- [`3893d8e`](https://github.com/hollware/hollware/commit/3893d8e6b2d66ceb429cc24dbad51a5a2191dd89) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A token's expiry is the person's choice: `hollware token create` and the admin's Tokens page make a token that never expires when no days are given, and one that expires in the days given (1 to 365) otherwise. Revoking it ends it at once.

### Patch Changes

- [`39dd8fa`](https://github.com/hollware/hollware/commit/39dd8fa82280d9d3fe1f57c0606a1954cb583e8e) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The button of the person at the foot of the sidebar has a name while the admin still loads who is signed in.

- [`6580025`](https://github.com/hollware/hollware/commit/6580025fd537a3756a4f93e04dae69e79bca4b8c) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Security headers that the OWASP ZAP baseline of staging asked for: every answer of the Worker has `X-Content-Type-Options: nosniff`, and `Strict-Transport-Security` when the public URL is https. Its pages add `Cross-Origin-Opener-Policy` and `Cross-Origin-Resource-Policy` of `same-origin` and a `Permissions-Policy` that asks for no device. The sign-in, setup and consent pages allow their own stylesheet by its hash instead of `'unsafe-inline'`, and the admin's built files get the same headers through `_headers`.

- [`5e24d98`](https://github.com/hollware/hollware/commit/5e24d987c38466a315bcb3b94c3dfa23de90e71f) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Security fixes from the threat model:

  - `verifyWebhook` takes `isNew(eventId)`. Given it, a webhook replayed within the tolerance is refused, by the id of its signed body (T-67).
  - The renderer reads a URL bound to the frontmatter (`:href="frontmatter.url"`) under its own rules instead of leaving it to `@comark/html`, which let a `data:image/svg+xml` link through (T-59).
  - An invitation link carries its secret in the fragment (`/setup#invitation=…`), which no request log holds. Older links still work (T-55).
  - Sign-in requires user verification explicitly. A counter that went back, or an assertion from another origin, is a refused passkey, not a server error (T-52, T-53).
  - The admin shows the preview of a draft in a sandboxed frame. Nothing it renders can run, reach the admin or draw over it (T-60).

## 0.10.0

### Minor Changes

- [`eb4df6d`](https://github.com/hollware/hollware/commit/eb4df6dd3a8eafc7b04266478a2f0950adea0bbc) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Entries have a trash: `delete_entry` moves a draft there and cancels its pending review, `restore_entry` brings it back as the draft it was, `list_entries` lists it with `trashed: true`, every summary carries `deletedAt`, `create_draft` answers `in_trash` for the slug a trashed entry keeps, migration `0014_entry_trash` adds the column, and the admin trashes a draft from the editor and lists, trashes and restores entries in bulk under the filter "In the trash".

### Patch Changes

- [`eb4df6d`](https://github.com/hollware/hollware/commit/eb4df6dd3a8eafc7b04266478a2f0950adea0bbc) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The bar of every page names the site the page is of, with the menu to switch to another, so it is clear whose collections, entries and people a page shows.

- [`f21e6f8`](https://github.com/hollware/hollware/commit/f21e6f8e4245d0a2ead778d120e4d2e6c63213d2) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The admin loads less than half the JavaScript it did on its first page (Nuxt UI 4.12 loads the code of a component only on the pages that use it, and its menus, palette and toasts when they open), and its site and person buttons, and the links to translations, are named by what they show. New projects get wrangler 4.151.0 and zod 4.6.7.

## 0.9.1

### Patch Changes

- [`7d86c7f`](https://github.com/hollware/hollware/commit/7d86c7ff6bd375d2a66f8b72648abc74746e84b8) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A page of the admin loaded before a deploy no longer breaks when it asks for a file the new version does not have: it loads the new version, at the page the person was going to (at most once in ten seconds, so a file that is truly missing still shows its error).

## 0.9.0

### Minor Changes

- [`ca25564`](https://github.com/hollware/hollware/commit/ca255645591bd4a12fd857cb4ba42fe92b99414f) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Act on many rows at once: select entries to publish, schedule or unpublish them; reviews to approve them or ask for changes with one note; tokens to revoke them; and people to change their role or remove them from the site. Each runs the operation of one row, a few at a time, and a toast says how many came to each outcome; warnings to accept come back together, to accept at once.

- [`7b56817`](https://github.com/hollware/hollware/commit/7b56817bd7e1c02f90b4106d69882c6a16a5e4d0) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The admin speaks English and Spanish: it starts in the browser's language, and the person menu switches it.

- [`c9ac710`](https://github.com/hollware/hollware/commit/c9ac710464cf19773076c285784cc3300eae2957) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The admin is laid out as Linear lays out a workspace, with Nuxt UI's dashboard: a sidebar that collapses and resizes, with the site to work in at the top (and the sites to switch to), search on ⌘K, the sections with their icons (the reviews that wait counted, the collections of the site one click away), and the person at the foot; each page is a panel beside it, its title and its actions in the bar at the top.

- [`5b594c8`](https://github.com/hollware/hollware/commit/5b594c81c23649ff67f3f7ab91f8293b8af68a69) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Every table of the admin is a data table: a filter, sorting by column and pages of 25 (entries, collections, people, invitations and tokens). The search of ⌘K finds published entries with their snippet, drafts and entries waiting for review, and goes to every page, collection, creation and site.

### Patch Changes

- [`5d2716d`](https://github.com/hollware/hollware/commit/5d2716d64ff3d30280e19e8d01caa70d87e55777) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The admin takes the whole Nuxt UI theme of hollware.com and nothing else: Nuxt UI's own radius (0.25rem, which the theme leaves as it is; 0.5rem was a leftover of the brand before), its own container width, and no pill of its own.

## 0.8.0

### Minor Changes

- [`ed861e0`](https://github.com/hollware/hollware/commit/ed861e0c33e33c24a95c1385d620ff55446f134d) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The admin shapes the site with no deploy (ADR-033): Collections lists them and makes one from a preset (a blog, docs, or a title alone); the editor of a collection edits its fields (kind, bounds, choices, required, order), its paths per locale, the fields of translations, tags and order, its rules from the catalog with their parameters, its style guide and its components, and asks to confirm a change that touches existing entries. Site edits the locales, the public URL, the origins that read from the browser and the style guide, makes a new site, puts this one in the trash and restores one. People gives a member another role or removes them. `/v1/admin/me` lists the trashed sites the person owns.

- [`286149b`](https://github.com/hollware/hollware/commit/286149b7106adb84b5ee02b0433dc780b50be6e3) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Webhooks need no Worker secret of their own (ADR-033): one that names none is signed with a secret Hollware makes with the new operation `make_webhook_secret`, answers once, and keeps sealed in D1 (migration `0012_site_secrets`) under `HOLLWARE_SECRET`, which `hollware deploy` now makes when the Worker has none. The admin's Site adds and removes webhooks and makes their secrets. A site in the trash keeps its rows until it is restored.

### Patch Changes

- [`eaa743d`](https://github.com/hollware/hollware/commit/eaa743d4f6a6cb7ec5977f73379e6f414f43403f) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A new project has no `hollware.config.ts` (ADR-033): the starter's Worker is `createHollware()`, and `hollware init` gives the site its first definition from a preset, `--preset blog|docs|empty` (blog by default) in `--locales` (en by default), which `create-hollware` takes too and hands to it. A project that still has a config keeps it: `init` writes no definition there, and the Worker moves the config into the database on its first request. The presets live in `@hollware/core` (`sitePreset`, `collectionPreset`), shared by the CLI and the admin. The fixes Hollware gives point at the admin and the operations instead of a config file.

## 0.7.0

### Minor Changes

- [`2350777`](https://github.com/hollware/hollware/commit/2350777371cc9ec731214a51a96c9d97303d40fa) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The admin gets a home page (what readers read, what waits for review, unpublished work and the last audit), a list of entries with filters for locale, status and text, paged, with translations and a link to the site, and an editor that unpublishes, schedules and cancels a schedule, validates on demand, edits the frontmatter as a form beside the Markdown, switches between translations, starts a missing one, and shows related entries.

- [`f5fdd3a`](https://github.com/hollware/hollware/commit/f5fdd3a085d56bbcc1ef1277502da7592df59bab) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The admin is dark only, with the theme of hollware.com: Nuxt UI with black as the primary color, emerald, neutral greys, Inter and JetBrains Mono, and subtle inputs. The pages the Worker renders to sign in follow it, dark whatever the device.

## 0.6.0

### Minor Changes

- [`059ecdf`](https://github.com/hollware/hollware/commit/059ecdffdd9d4394918dd594cf855898bf34b6d1) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Comments on reviews. The new tool `comment_review` (`content:write`) adds a comment to a pending review, in the caller's name and with the name its client gave, for the person who decides and for the author; it decides nothing. `list_reviews` answers each review with its comments, oldest first, and the admin's review screen shows them and takes new ones. Migration `0010_review_comments.sql` adds the table.

## 0.5.0

No changes in this release.

## 0.4.0

### Minor Changes

- [`85e70a2`](https://github.com/hollware/hollware/commit/85e70a22adc4b1e256f9a0af57b33ca4ba4a9881) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The admin takes the look of hollware.com: ink greys and a mint accent, Geist and Geist Mono bundled with it, dark by default, and Markdown colors in the editor from the same theme. The sign-in, setup and consent pages of the Worker share it.

- [`43333d3`](https://github.com/hollware/hollware/commit/43333d309843e464c47b20412d2d1d05738c835a) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A deployment serves every site of its config (ADR-027). A personal token, an OAuth grant and an RPC call each act on the one site they name; a person has one passkey and one session for the deployment, with a role per site. The consent page asks which site when the person is in several, the admin switches sites (`GET /v1/admin/me`), and `hollware init --site <key>` on a database with an owner adds the site to that owner. Migration `0006_people_across_sites.sql` drops `site_id` from passkeys, sessions and sign-in challenges.

- [`a7b5f26`](https://github.com/hollware/hollware/commit/a7b5f261d08bf8b58e3dc98ee0a7148de71d394b) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Read tokens and CORS for the read API (ADR-028). A read token (`hw_read_`) reads the published content of one site over `GET /v1/…` and is refused everywhere else; make one with `hollware token create --read` or in the admin. A site lists the origins of its pages in `cors.origins`, and those pages may read it from the browser. Migration `0007_read_tokens.sql` adds the `kind` of a token.

## 0.3.0

### Minor Changes

- [`bf0d98c`](https://github.com/hollware/hollware/commit/bf0d98cf151ddb7ae4167ffa43e92cdd2a1709ae) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The admin's screens. A person signs in with their passkey (the admin is the server's own OAuth client, with PKCE, and keeps its token in memory), lists the entries of a collection, creates a draft from the fields its collection requires, edits the Markdown in CodeMirror with the verdict as diagnostics and the saved revision's HTML beside it, saves, and publishes, acknowledging warnings when asked; without `content:publish`, publishing asks for a review. The review queue shows what is live beside the revision asked for, with its verdict, and approves it or asks for changes. A review now carries `requestedByName`.

- [`56f72c6`](https://github.com/hollware/hollware/commit/56f72c6a71155a05a4ceb9a350bf3f062838bd9f) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The admin's groundwork. The server answers the operations over HTTP at `POST /v1/ops/{name}`, with the input and output of the MCP tool of that name, registers the admin as its own OAuth client (no consent page), and serves the admin at `/admin/` from the Worker's static assets, with a policy that runs only its own scripts. `@hollware/admin` builds a Vue single-page app and exports `adminAssets()`, the directory a project's Vite config serves as its `publicDir`; a project binds its static assets as `ASSETS`.

- [`aefb102`](https://github.com/hollware/hollware/commit/aefb1026078d3e860a7b6731953b8bec3a78d4ab) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Tokens and people in the admin. An owner signed in to the admin makes, lists and revokes personal tokens (a token is shown once, and gets no scope its maker lacks), and invites editors and authors with a link to `/setup`. These are routes of the admin's own (`/v1/admin/…`), not operations: they take only an access token of the admin's client with `schema:admin`, so neither a personal token nor another MCP client can make a token.

### Patch Changes

- [`59a8989`](https://github.com/hollware/hollware/commit/59a898963cbda2cb9bb4bb81bfbec48fa846c286) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The admin passes axe: its colors in light mode reach a contrast of 4.5:1, the line numbers of the editor too, and the two sides of a review's diff are named.

## 0.2.0

No changes in this release.

## 0.1.0

No changes in this release.

## 0.0.2

### Patch Changes

- [`d834e1e`](https://github.com/hollware/hollware/commit/d834e1e6cff6d04795842f0d847af64067f104af) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Releases now ship from the `release` branch and are published directly from CI with provenance, after the maintainer approves the `npm` environment (ADR-015). The packages themselves are unchanged.

## 0.0.1

### Patch Changes

- [`622b862`](https://github.com/hollware/hollware/commit/622b8621227246aec6425471de2b257516cea3e0) Thanks [@sergioazoc](https://github.com/sergioazoc)! - First release: the package skeletons. Nothing is usable yet; this release proves the publishing pipeline end to end.
