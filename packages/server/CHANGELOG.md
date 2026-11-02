# @hollware/server

## 1.5.0

### Minor Changes

- [#98](https://github.com/hollware/hollware/pull/98) [`9725c1d`](https://github.com/hollware/hollware/commit/9725c1ddb7f4fcb12c8aa1d9a85ebf2a22a2c3b6) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Two roles join owner, editor and author: an admin runs the site and its people with every scope of an owner but the new `site:owner`, which names, changes and removes owners, deletes and restores sites, reads backups, purges entries and anonymizes people; a reviewer reads and comments. A site may let reviewers in through `access.autoProvision`.

  Invitations are mailed: with a `send_email` binding `EMAIL` of Cloudflare Email Service and `HOLLWARE_EMAIL_FROM`, an invitation that names an address goes to it in the inviter's language, its link is shown to nobody, and the address of whoever accepts it is verified. Without them, or when the mail fails, the admin shows the link as before. An invitation can be renewed with a new link, an expired one stays listed until it is renewed or revoked, and a second invitation of an address or one of a member is refused.

  Every account of a person has an address. An invitation names one, in the admin, in `POST /v1/admin/invitations` and in `hollware invite --email`, and the account made from it keeps it, verified when Hollware mailed the link or when the person signs in with it through a provider. `hollware init` and `npm create hollware` ask for `--owner-email`.

  A person of this Hollware accepts an invitation to another site with the passkey they have, from the setup page, instead of making a second account. In the admin a reviewer reads entries without an editor, and what a person sees follows their scopes.

  Migration `0032_roles_and_invitations` rebuilds `members`, `invitations` and `auth_challenges`. Tokens of an owner made before it carry no `site:owner`: make a new one for `hollware backup` and the site's deletion.

### Patch Changes

- Updated dependencies [[`9725c1d`](https://github.com/hollware/hollware/commit/9725c1ddb7f4fcb12c8aa1d9a85ebf2a22a2c3b6)]:
  - @hollware/core@1.5.0

## 1.4.0

### Patch Changes

- Updated dependencies []:
  - @hollware/core@1.4.0

## 1.3.0

### Minor Changes

- [#89](https://github.com/hollware/hollware/pull/89) [`ac0553d`](https://github.com/hollware/hollware/commit/ac0553d353d78ecba792d2bbf3731c87a69b52d0) Thanks [@sergioazoc](https://github.com/sergioazoc)! - `admin: { path: '/' }` in the config puts the admin at the root of the Worker's origin, such as `https://admin.example.com/`, instead of `/admin/`: its pages answer at `/`, `/entries`, `/reviews`, `/images`, `/settings` and `/callback`, `/admin/…` redirects there with a 301, and its files stay under `/admin/assets/`. The admin's OAuth client is now kept by its redirect URI, so after this release each person signs in to the admin once more.

### Patch Changes

- Updated dependencies [[`ac0553d`](https://github.com/hollware/hollware/commit/ac0553d353d78ecba792d2bbf3731c87a69b52d0)]:
  - @hollware/core@1.3.0

## 1.2.0

### Minor Changes

- [#88](https://github.com/hollware/hollware/pull/88) [`0cfa409`](https://github.com/hollware/hollware/commit/0cfa409f4f2c3f21326f281241e7d7889f018e89) Thanks [@sergioazoc](https://github.com/sergioazoc)! - An agent member can hold a lasting personal token, for an agent that hears no events, such as an MCP gateway: `hollware token create --member <usr_…>` and `member` of `POST /v1/admin/tokens`, for an owner only and never over MCP. Its scopes are an author's at most (content:publish and schema:admin are refused with their fix), what it writes is the agent's, and its publish asks for a review. A token expires when asked like Cloudflare's: in days, at a date (`--expires-at`, `expiresAt`) or never. Removing an agent revokes its tokens with its grants; `hollware token list` and `GET /v1/admin/tokens` say whose each token is.

### Patch Changes

- [#86](https://github.com/hollware/hollware/pull/86) [`aaae242`](https://github.com/hollware/hollware/commit/aaae2421de5d8d9e35371b6acf46b94be81558d8) Thanks [@sergioazoc](https://github.com/sergioazoc)! - `api/ops.json` records the methods of `HollwareOps`, so semver covers them, and a break of the deliveries to agents (`api/agents.json`) is found as one. The documentation of `HollwareOpsRpc` says it takes an agent grant (`hw_agt_…`) as well as a personal token.
- Updated dependencies []:
  - @hollware/core@1.2.0

## 1.1.0

### Minor Changes

- [`b4d307a`](https://github.com/hollware/hollware/commit/b4d307ace92e54fe19be97b3ce40e8184fe3ccbf) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The admin and the sign-in pages show Hollware's flame as their icon (`favicon.ico`, `favicon.svg`, `apple-touch-icon.png`). `admin: { favicon: 'https://…' }` in `hollware.config.ts` shows another image: the Worker serves it from its own origin at the same paths.

- [#85](https://github.com/hollware/hollware/pull/85) [`5934bf8`](https://github.com/hollware/hollware/commit/5934bf84b1202d8b558c185e71e41312dabcc400) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Agents plug into a site with least privilege: a site declares `agents` that hear its events through a signed webhook or a service binding, each with a grant (`hw_agt_`) of an hour that acts as an agent member and dies with its review; the scopes `review:read` and `review:comment` (implied by `content:read` and `content:write`), `review.requireAgents` with `agents_pending` and an owner's `override` on approve_review, each review's `agents`, `verifyAgentEvent`, `hollwareAgentClient` and `api/agents.json`.

- [#85](https://github.com/hollware/hollware/pull/85) [`5934bf8`](https://github.com/hollware/hollware/commit/5934bf84b1202d8b558c185e71e41312dabcc400) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A collection may declare `navigation: { groupBy, groups, orderBy }`: a string or enum field that groups its entries, the groups in order (an enum's own order when none are given), and a number field that orders each group before the title. `getNavigation(site, collection, { locale })` answers the published entries of a locale arranged that way, with their title, description, path and order, over RPC, `GET /v1/:collection/navigation` and the client (`HollwareReader.getNavigation`, `createHollware().getNavigation`). A collection without one is a single group by title; more than 1,000 published entries in the locale are refused. The `docs` preset groups by `section` and orders by `order`. `@hollware/nuxt` adds `useHollwareNavigation` and `/_hollware/navigation/:collection`, `@hollware/vue` `useHollwareNavigation`, and `@hollware/astro` `hollwareNavigation`.

- [#85](https://github.com/hollware/hollware/pull/85) [`5934bf8`](https://github.com/hollware/hollware/commit/5934bf84b1202d8b558c185e71e41312dabcc400) Thanks [@sergioazoc](https://github.com/sergioazoc)! - People sign in through Google, Microsoft, GitHub, any OpenID Connect provider or Cloudflare Access, with passkeys optional. `auth: { providers: [...], passkeys }` in the config lists the providers, each client secret by the name of its Worker secret; a Microsoft tenant must be one directory (`common`, `organizations` and `consumers` are refused). An account signs in by its provider and subject; its verified email links it to the person who has it, accepts an invitation sent to that address, or makes the person a member of a site whose new `access.autoProvision` lets in that address or its domain. An unverified email links nothing. The account page lists the accounts of providers and adds passkeys, and the last passkey goes when an account of a provider signs the person in. An invitation takes an address (`email` of `POST /v1/admin/invitations`, `hollware invite --email`), `hollware init --owner-email` gives the owner theirs, `hollware doctor` says which secret of a provider the local project lacks, and `npm create hollware` takes `--auth <kind>` with its credentials.

- [#85](https://github.com/hollware/hollware/pull/85) [`5934bf8`](https://github.com/hollware/hollware/commit/5934bf84b1202d8b558c185e71e41312dabcc400) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A review can hold several entries. `request_review` takes `group` (more entries to publish) and `unpublish` (published entries to take off the site), and `publish` without `content:publish` turns its `group` into one review; an entry is in one pending review at most, and asking with one that another review holds answers `conflict` with that `review` and the `failedEntry`. `approve_review` publishes and unpublishes every entry of the review in one step, all or none, but those in its new `exclude`, and answers the new outcome `conflict` with `failedEntry` when one moved since; a new revision of any of its entries cancels the whole review. The new tool `get_review` (`content:read`) reads a review with each entry: what is published, what is proposed and the unified diff between them (`unifiedDiff` of `@hollware/core`, three lines of context). `comment_review` takes `entryId` and `lines` to comment on an entry of the review or on lines of its proposal, and comments answer both. `list_reviews` answers how many entries each review holds (`items`), and the events of a review carry them (`items`). Migrations `0029_review_items.sql` and `0030_review_items_backfill.sql` add the table `review_items`, give each review of before its one entry, and add the anchor of a comment. The admin shows every entry of a review with its diff, lets you leave some out of the approval, approves them all at once, and takes comments on an entry and its lines.

- [#85](https://github.com/hollware/hollware/pull/85) [`5934bf8`](https://github.com/hollware/hollware/commit/5934bf84b1202d8b558c185e71e41312dabcc400) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Another Worker of the same account runs any operation, or speaks MCP, over a service binding to the new `HollwareOps` entrypoint, with no check of Host or Origin and always as a personal token (`hw_pat_…`): its site, scopes and the actor of the activity log come from the token, and a read token or a revoked one is refused as `unauthorized`, a new error code. Export it from the project's Worker with `export class HollwareOps extends hollware.HollwareOps {}` and type the binding with `HollwareOpsRpc`. `@hollware/client` adds `createOpsClient({ binding, token })`, whose `call(name, input)` is typed by the operation.

- [#85](https://github.com/hollware/hollware/pull/85) [`5934bf8`](https://github.com/hollware/hollware/commit/5934bf84b1202d8b558c185e71e41312dabcc400) Thanks [@sergioazoc](https://github.com/sergioazoc)! - `list_entries` takes `changedSince`, an ISO 8601 time: only the entries changed at or after it, in the same order. `hollware promote --from <url> --to <url>` copies what one Hollware publishes to another (staging to production) as drafts there, in one grouped review that also unpublishes what the source no longer publishes; `--publish` publishes instead. A state file (`.hollware/promote-<from>-<to>.json`) keeps where it stopped, so the next run reads only what changed; an entry changed in the destination since the last promotion is still promoted, with a comment on it in the review that shows the difference. The images the entries show are copied when the destination lacks them. `--dry-run` prints the plan and writes nothing.

### Patch Changes

- [#85](https://github.com/hollware/hollware/pull/85) [`5934bf8`](https://github.com/hollware/hollware/commit/5934bf84b1202d8b558c185e71e41312dabcc400) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The cron deletes agent grants that expired or were revoked, and the admin API refuses to change the role of an agent member, which stays an author.
- Updated dependencies [[`b4d307a`](https://github.com/hollware/hollware/commit/b4d307ace92e54fe19be97b3ce40e8184fe3ccbf), [`5934bf8`](https://github.com/hollware/hollware/commit/5934bf84b1202d8b558c185e71e41312dabcc400), [`5934bf8`](https://github.com/hollware/hollware/commit/5934bf84b1202d8b558c185e71e41312dabcc400), [`5934bf8`](https://github.com/hollware/hollware/commit/5934bf84b1202d8b558c185e71e41312dabcc400), [`5934bf8`](https://github.com/hollware/hollware/commit/5934bf84b1202d8b558c185e71e41312dabcc400), [`5934bf8`](https://github.com/hollware/hollware/commit/5934bf84b1202d8b558c185e71e41312dabcc400), [`5934bf8`](https://github.com/hollware/hollware/commit/5934bf84b1202d8b558c185e71e41312dabcc400)]:
  - @hollware/core@1.1.0

## 1.0.0

### Major Changes

- [`0647944`](https://github.com/hollware/hollware/commit/06479447b92e584277b0be96162888039e198adb) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Hollware no longer counts page views: a site connects the analytics it already has, and `content_stats` reads them. Connect Cloudflare Web Analytics, PostHog, Plausible or GA4 in the admin (Site, Analytics), with `hollware analytics connect <provider> --credential-file <file>`, or with the new tool `connect_analytics`; the read-only key is tested before it is kept, sealed under `HOLLWARE_SECRET`, and never shown again (`get_analytics`, `disconnect_analytics`).

  To upgrade: remove `beacon` from `hollware` in `nuxt.config`; remove the `analytics_engine_datasets` binding `ANALYTICS` and the variables `HOLLWARE_ANALYTICS_ACCOUNT_ID` and `HOLLWARE_ANALYTICS_DATASET` from the Worker's `wrangler.jsonc`, and delete its secret `HOLLWARE_ANALYTICS_TOKEN` (`wrangler secret delete HOLLWARE_ANALYTICS_TOKEN`); then connect the site's analytics. `POST /events` is gone, and `@hollware/server` no longer exports `AnalyticsWriter` and `PageView`.

- [#73](https://github.com/hollware/hollware/pull/73) [`42df9fb`](https://github.com/hollware/hollware/commit/42df9fb82477bec5b80385bd1b853f68d89092db) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The public API of 1.0 loses 54 values that nothing outside their own package used and no page of the docs names: constants, defaults and helpers internal to how Hollware works. Every type stays, as the names of what remains. Code that imported one of them takes the value from what uses it, or asks for it in an issue:

  - `@hollware/agents`: `AGENTS_CLIENT`, `ALLOWED_TOOLS`, `AUDIT_STATE`, `auditDue`, `capped`, `DailyLimitReached`, `DEFAULT_MODEL`, `kvMemory`, `LAST_AUDIT`, `reportOf`, `ROLES`, `slugOf`, `workersAiModel`
  - `@hollware/astro`: `createSource`
  - `@hollware/client`: `isPreviewToken`, `PREVIEW_COOKIE_MAX_AGE`, `previewCookie`
  - `@hollware/core`: `ASSET_SCHEME`, `assetIdIn`, `AUDIT_ACTOR_KINDS`, `AUDIT_OUTCOMES`, `CHUNK_LIMITS`, `componentDefinitionData`, `DEFAULT_AUDIT`, `DEFAULT_BACKUPS`, `DEFAULT_MAX_MARKDOWN_BYTES`, `DEFAULT_MEDIA`, `defineOperation`, `describeContract`, `describedSchemaOf`, `ERROR_CODES`, `IDENTITY_AUDIT_ACTIONS`, `IMAGE_FORMATS`, `listAssets`, `MEDIA_FORMATS`, `PERSONAL_TOKEN_PREFIX`, `PREVIEW_SECRET_MIN_LENGTH`, `PREVIEW_TOKEN_PREFIX`, `PREVIEW_TTL_SECONDS`, `READ_TOKEN_PREFIX`, `routesFor`, `ruleDefinition`, `SITE_KEY_PATTERN`, `sizesOf`, `updateAsset`, `webhookDefinition`, `WORDS_PER_MINUTE`
  - `@hollware/nuxt`: `ROUTES`
  - `@hollware/server`: `defineHandlers`, `MAX_BOUND_PARAMETERS`, `OPERATION_TIMEOUT_MS`, `OUTPUT_CAP_BYTES`
  - `create-hollware`: `USAGE`
  - `hollware`: `createWranglerRunner`

### Minor Changes

- [`84d96fd`](https://github.com/hollware/hollware/commit/84d96fdbfe0527c5aae28b52d2d5045c8ec69354) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Setting Hollware up from an agent: `hollware init` and `hollware token create` take `--token-file <path>` (mode 0600, refused when the file exists unless `--force`) and print its path instead of the token, and `create-hollware` passes it through. `--json` on `create-hollware`, `init`, `token create`, `invite` and `doctor` prints one JSON object and nothing else. `hollware dev` starts the project's local server, waits for `/health` and stays in the foreground until SIGINT or SIGTERM (`--detach` and `--stop` run it in the background), and `hollware mcp-config` prints the `claude mcp add` line or the JSON block of Claude Code, Cursor and VS Code, which name `HOLLWARE_TOKEN` and never the token. The output of `init` and `create-hollware` says the passkey link is for the admin and an agent starts with the token alone. `GET /v1` answers 200 with the URLs of the OpenAPI document and of `/v1/site`, with no token. `update_site` and `set_collection` answer `conflict` on a stale version with a `message` and a `fix` that say to call `get_structure` again.

- [#71](https://github.com/hollware/hollware/pull/71) [`901959b`](https://github.com/hollware/hollware/commit/901959bff6b8de29b8db6206a47c5b2e03efef55) Thanks [@sergioazoc](https://github.com/sergioazoc)! - An owner can anonymize a person removed from the site, from Former members in People (`POST /v1/admin/people/anonymize`; `GET /v1/admin/people` lists them as `former`). What they wrote stays, and every revision, publication, review, comment, schedule, change of the structure, image and line of the activity log of the site names `FORMER_PERSON` of `@hollware/core` instead of them, without the tokens, IP hashes and client names it held; the name leaves the review events, their tokens and invitations of the site go, and so do the apps they allowed for it. Once no site keeps them, the person goes from the deployment with their passkeys and sessions. The append-only triggers allow those changes only while the anonymization is open, and nothing else; the activity log records `member.anonymize`, naming no one.

- [`f31b9fb`](https://github.com/hollware/hollware/commit/f31b9fbbd99f08ab8d094742813f62dc32834d44) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Fields Hollware fills itself: a collection's `automaticFields` names them and how, `firstPublished` (the date an entry first went out; a date written wins), `lastModified` (the date of a change published after that), `readingTime` (minutes at 200 words a minute) and `wordCount`. Nobody writes them: they are never required, `describe_site` marks them `readOnly`, and the admin's entry form leaves them out. A site reads them filled (RPC, the read API, `createHollware()`), `get_entry` answers their values as `automatic`, and `hollware export --published` writes them into the frontmatter; the Markdown stored stays what was written. The admin chooses them per field on the page of a collection, and a new blog fills its `date`.

- [#66](https://github.com/hollware/hollware/pull/66) [`b29fe9d`](https://github.com/hollware/hollware/commit/b29fe9d074c7b83b77014c59c41a4037d044bed4) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The daily backup is `backup/2`: besides the definition and the Markdown of every entry, it keeps the redirects of the site, with their paths, and the list of its images (id, format, sizes, alt, file name). It goes to the R2 bucket `BACKUPS` when the Worker binds one, apart from the images, and to `MEDIA` without it; `list_backups` and `GET /v1/backups/<date>` read from the same bucket.

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

- [`88965e8`](https://github.com/hollware/hollware/commit/88965e8b3431656e939056cc8cfb7ec0b4206072) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Components to render entries in every framework:

  - `<HollwareImage>` in React, Vue and Nuxt renders the image a frontmatter field holds (a cover) with its alt, its size and the `srcset` of its copies; `imageOf(entry, field)` of `@hollware/client` gives the same attributes for any other renderer. The `images` of a summary carry the alt of each image.
  - `@hollware/astro` exports `HollwareContent.astro`, which renders an entry from its document with the site's own Astro components (`components={{ callout: Callout }}`), through the same rules as the HTML Hollware makes, and `HollwareImage.astro`. Its loaders keep the document and the images of each entry for them.
  - `safeDocument` of `@hollware/core` copies a document through the rules of `renderHtml`, for a renderer of a site's own.

- [`f16f745`](https://github.com/hollware/hollware/commit/f16f7452e24037ab564f4442839c26b463019d58) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Images. `upload_asset` takes a JPEG, PNG, WebP, AVIF, GIF or SVG, judged by its bytes, and converts it once by the site's new `media` setting (WebP at 85 by default, PNG lossless, GIF with its frames, nothing wider than 2400 px; or AVIF, or the file as it came). An SVG is kept as it is, and refused when anything in it can run. R2 keeps the image and its original; content shows it as `img: asset:ast_…` or `![alt](asset:ast_…)`, which reads of the published site and HTML turn into the URL where the Worker serves it, cached for a year. `list_assets` and `get_asset` read them; the admin has an Images page; `hollware export --assets <dir> --assets-url <path>` writes the images for a site that serves them itself, and without it keeps the originals in `_assets/`, which `hollware import` uploads again under the same ids. A new project binds an R2 bucket (`MEDIA`), which the first deploy creates, and the Images binding (`IMAGES`); `hollware doctor` says when either is missing. Migration 0017 adds the `assets` table.

- [`29e7ecc`](https://github.com/hollware/hollware/commit/29e7ecc893fcb5f145e53b99a7f158b518e423f3) Thanks [@sergioazoc](https://github.com/sergioazoc)! - `media.keepOriginals` (true by default): a site that sets it to `false` keeps only the file it serves and its copies, not the file as it was uploaded, which takes less storage in R2. The download of an original then gives the file served, and `hollware export` names each image by what its bytes are. The admin sets it under Site → Images.

- [#42](https://github.com/hollware/hollware/pull/42) [`6da0187`](https://github.com/hollware/hollware/commit/6da018757b7ca742ec9626fa5ad116d3547df290) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The MCP server gives a client its instructions when it starts: read describe_site first, write whole Markdown files, fix what the verdict lists, how to acknowledge warnings, what pending_review means and how to name an image. Clients such as Claude Code put them in the context of the model.

- [`0150c9f`](https://github.com/hollware/hollware/commit/0150c9f4d1be3be699d6987946acd3bc5041e619) Thanks [@sergioazoc](https://github.com/sergioazoc)! - An entry can change its slug: `move_entry` (MCP) and "Change URL" in the admin give it another path and keep its revisions and translations. An entry that was ever published keeps its old slug as a redirect, which `list_redirects`, the RPC method `listRedirects`, `GET /v1/redirects`, `createHollware().redirectFor()` and the admin's Site page answer, so a site serves the old path with a 301; `hollware export --published` writes them to `redirects.json`. Moving a published entry takes content:publish and purges its pages.

- [#70](https://github.com/hollware/hollware/pull/70) [`3b98d87`](https://github.com/hollware/hollware/commit/3b98d8701f82646554a9355e7523addb2ed5b09c) Thanks [@sergioazoc](https://github.com/sergioazoc)! - An owner can delete an entry of the trash for ever, from the trash of Entries in the admin (`POST /v1/admin/entries/:id/purge`): its revisions, publications, reviews and their comments, redirects, schedules and events go with it, and nothing brings it back. The record of the purge (`entry_purges`, who and when) is what lets the append-only triggers delete those rows, and it is never deleted itself; every other revision and publication stays append-only. The activity log records `entry.purge`.

- [`9e93f74`](https://github.com/hollware/hollware/commit/9e93f740a5d3c5fd68d16ea43b2ec79853ab1ee6) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The reading time counts the code a reader reads: the pipeline counts the words of code blocks apart (`codeWords`), each revision keeps them (migration `0022`, filled for older revisions by the reparse of the cron, as `PIPELINE_VERSION` 3 marks them), and `readingTime` of `automaticFields` is the words and the words of code at 200 a minute. `wordCount` stays the words of the text.

- [`cebe6bb`](https://github.com/hollware/hollware/commit/cebe6bb99e776214d595f6223744b3fa670dd8ea) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Entries can refer to entries of another collection: the rule `reference` of the catalog (a field, a collection, and optionally a locale) checks that each slug a field names exists when writing, and is published to publish. `get_entry` with `references: true` (MCP, RPC, `?references=true`, and `createHollware().getEntry(…, { references: true })`) answers the published entries each field names, in its order: an author, a series, the event of a talk.

- [`5e4bee1`](https://github.com/hollware/hollware/commit/5e4bee1adf9d2e119b90ca4ae3c5e07d8055c260) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Responsive images: when an image is uploaded, Hollware also makes its narrower copies, the `media.widths` of the site (640 and 1280 pixels by default, `[]` for none), served at `<url>/<width>`. `upload_asset`, `get_asset` and `list_assets` answer `widths` and `srcset`; the HTML of `get_entry`, and the document a site reads, give each image its `srcset`, `sizes`, `width` and `height`; and a summary read by a site (`get_entry`, `list_entries`, `createHollware()`) carries `images`, the size and `srcset` of each image its frontmatter names, by URL, to lay out a cover. The admin sets the format, quality, widest width and copies in Site, and shows the copies of each image. Images uploaded before keep none.

- [#45](https://github.com/hollware/hollware/pull/45) [`7f6ca95`](https://github.com/hollware/hollware/commit/7f6ca9528c258518065dedb22b3703910ec5e985) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Webhooks get the events of a review: `review.requested` when someone without `content:publish` asks to publish, and `review.decided` when the review is approved, sent back for changes, rejected or cancelled by a new revision. Each one carries the review, its entry and `adminPath`, where the admin opens it, and `parseHollwareEvent` reads it. They reach the webhooks at the next sweep of the cron, within a minute, and never IndexNow. Migration `0024` adds them to the outbox.

- [`1ab4a4c`](https://github.com/hollware/hollware/commit/1ab4a4c26b492dedc77b1e1289ab883b4a0124d3) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The history of an entry, over MCP and in the admin. `list_revisions` lists every revision of an entry, newest first, with who wrote it, when, what the contracts said, and which one the site shows; `get_revision` reads the Markdown of one; `restore_revision` goes back to one, as a new revision, so nothing is ever deleted or rewritten. The admin has a History tab on each entry: a revision opens beside the latest one, and "Restore this version" goes back to it.

- [#52](https://github.com/hollware/hollware/pull/52) [`e6c6fb7`](https://github.com/hollware/hollware/commit/e6c6fb74ce757f74d215564a5174133e2879b1d3) Thanks [@sergioazoc](https://github.com/sergioazoc)! - An invitation that waits can be revoked, and its link stops working at once: from People in the admin (`POST /v1/admin/invitations/:id/revoke`), or with `hollware invite revoke <id>` after `hollware invite list`. The activity log records it as `invitation.revoke`.

- [`4c03dd3`](https://github.com/hollware/hollware/commit/4c03dd3f8fb3a366f095b3f8b84c4704819b714f) Thanks [@sergioazoc](https://github.com/sergioazoc)! - An entry can leave the site at a time: `schedule_unpublish` (MCP) and "Unpublish later" in the admin keep a published entry live until then, and the cron unpublishes it in the name of who scheduled it, if they may still publish. `get_entry` says when, as `unpublishAt`; null cancels it, and an unpublish before the time drops it.

- [`102ea18`](https://github.com/hollware/hollware/commit/102ea18cbc076fbc47f1128b0f71e98e4dd071d8) Thanks [@sergioazoc](https://github.com/sergioazoc)! - `search` answers, with `passages: true`, the passage each result matched: the whole section of the entry, its heading, and the URL of the entry on the site, what a model reads to answer with your content and cite it (RAG). `minScore` leaves out what matches by meaning less, so a question nothing answers finds nothing. Over MCP, RPC, the read API (`?passages=true&minScore=0.5`) and `createHollware`.

- [#40](https://github.com/hollware/hollware/pull/40) [`9305e2d`](https://github.com/hollware/hollware/commit/9305e2dc7bb336c97523a05ea79190c2f733b5c6) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A personal token expires after 90 days unless its maker asks for other days or for none: `hollware token create` takes `--no-expiry`, the admin's Tokens page has a "Never expires" box, and `POST /v1/admin/tokens` takes `expiresInDays: null`. A read token still never expires unless it is given days.

- [#39](https://github.com/hollware/hollware/pull/39) [`e3f3a0c`](https://github.com/hollware/hollware/commit/e3f3a0cdaa409304683d5e182ea4094befc343d3) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A personal token lists only the MCP tools its scopes allow, so an agent no longer sees tools it cannot call, and its client keeps that list to itself. An OAuth client still lists every tool, so that it can ask for more scopes, and a call without the scope still gets the 403 that names it.

- [`bce8006`](https://github.com/hollware/hollware/commit/bce80069a466f41ee929f33bd11c302b92e9e3a2) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A translation says when its source moved past it: `translationOutdated` is true for an entry in another locale than the site's default whose source, the entry of its group in the default locale, was changed after it was saved, until it is saved again. In list_entries, get_entry and get_translations; the admin marks it "behind its source" and filters by it.

- [#58](https://github.com/hollware/hollware/pull/58) [`2a302dc`](https://github.com/hollware/hollware/commit/2a302dcbe1fb41c10757352312b21861aa60f6d5) Thanks [@sergioazoc](https://github.com/sergioazoc)! - `upload_asset` takes a public https `url` instead of `data`: Hollware downloads the image, at most 10 MB, and keeps it as one sent in base64. An agent no longer has to write out the bytes of an image.

- [#41](https://github.com/hollware/hollware/pull/41) [`2244160`](https://github.com/hollware/hollware/commit/2244160693dc307127bced011214b59080832dba) Thanks [@sergioazoc](https://github.com/sergioazoc)! - An entry that waits for review says so in the editor, with a link to its review, and a change to it is not saved until the person chooses: discard it, review the request, or save and cancel the request. Before, an autosave cancelled the request of the author without a word. `list_reviews` takes `entryId` to list the requests of one entry, and Reviews opens the one named in `?review=`.

### Patch Changes

- [`8d6edca`](https://github.com/hollware/hollware/commit/8d6edcadbf06f1c4b85c5fe9739fb09a2a1c1f85) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The same image uploaded to two sites of one deployment is two assets, each with an id of its site and its bytes; with rc.2 the second upload failed with a server error and left its files in R2. Assets uploaded before keep their ids and are found by their bytes. `hollware import` of an export into another site writes the `asset:` references with the ids that site gives.

- [`75c4281`](https://github.com/hollware/hollware/commit/75c4281d6afc557fdccc68f532b6b32780d61021) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A site reads URLs where content wrote `asset:` in every read: a preview of a draft and the related entries of `getEntry` too, which kept the raw reference.

- [`eadb82e`](https://github.com/hollware/hollware/commit/eadb82e6a88d31dfadb688872f32e910d621cb84) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The cron rebuilds, twenty a minute, the stored documents of the revisions that an older Comark or Markdown pipeline parsed, from the Markdown each revision keeps; a release that changes the pipeline (as this one does, to version 2) reaches every revision without a command.

- [`e8155a5`](https://github.com/hollware/hollware/commit/e8155a58dd30540007956d1eb15547cabedf62fa) Thanks [@sergioazoc](https://github.com/sergioazoc)! - `upload_asset` refuses an image that Cloudflare Images cannot decode (error 9516, such as a PNG cut short) with what to do, instead of failing with a server error.

- [#54](https://github.com/hollware/hollware/pull/54) [`ba63bdf`](https://github.com/hollware/hollware/commit/ba63bdf4f49e0821f3f5bc408085169a74710d73) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The MCP SDK loads on the first request to `/mcp` of an isolate, not at every cold start: a Worker that only serves the reads of its sites evaluates about 45 KiB (gzip) less before its first answer.

- [#24](https://github.com/hollware/hollware/pull/24) [`73110f5`](https://github.com/hollware/hollware/commit/73110f5317dd9da454ad45a84baccedd1403767a) Thanks [@sergioazoc](https://github.com/sergioazoc)! - An upload that opens on an XML declaration and many comments no longer stalls the check of its format, and a URL or a path with thousands of trailing slashes no longer takes seconds to trim: both are read in linear time.

- [`8b8b51f`](https://github.com/hollware/hollware/commit/8b8b51fd057b945b826c2c1a67b3193a713f7483) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Hardening: the reply to a publish question counts only for the entry the call publishes; a webhook secret sealed by 0.8 to 0.10 is sealed again to its site and name when it is read; and the webhook route of `@hollware/nuxt` purges only for events of its own site.

- [#24](https://github.com/hollware/hollware/pull/24) [`73110f5`](https://github.com/hollware/hollware/commit/73110f5317dd9da454ad45a84baccedd1403767a) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The packages carry no comments but the TSDoc of their public API, and the help of the CLI and the descriptions of the MCP tools no longer cite decision records the repository does not have. The starter's `AGENTS.md` now says what each setting of its `wrangler.jsonc` is for.

- [`e2c6926`](https://github.com/hollware/hollware/commit/e2c6926c5ccb25787cddd19e1dc8b34b256a0ace) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A Hollware stays out of search engines: every answer carries `X-Robots-Tag: noindex, nofollow`, and `GET /robots.txt` disallows everything. A CMS is never a public site; the sites it feeds are.

- [`0743a55`](https://github.com/hollware/hollware/commit/0743a5544e13678090b591348ed69a8ffaf83ec7) Thanks [@sergioazoc](https://github.com/sergioazoc)! - `content_stats` and `connect_analytics` get 30 seconds instead of 10, and a provider of analytics 25 seconds instead of 8: PostHog's query API takes 5 to 15 seconds, so connecting it answered `unreachable`. Every other tool keeps its 10 seconds. The limit is exported as `OPEN_WORLD_TIMEOUT_MS`.

- [`ea570be`](https://github.com/hollware/hollware/commit/ea570be69416f9a9b87d6d3a449975a42a58ab48) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A preview read on a Hollware without `HOLLWARE_SECRET` is refused as `invalid_preview`, like any refused preview link, so a site drops its preview cookie and shows the published page instead of an error.

- [`1310c51`](https://github.com/hollware/hollware/commit/1310c515a6ee07656aac57f3d5cd0fa0e824dd83) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The READMEs on npm say what each package is and how it is used, instead of "pre-alpha, not usable yet"; the CLI's lists `dev` and `mcp-config`.

- [`84d96fd`](https://github.com/hollware/hollware/commit/84d96fdbfe0527c5aae28b52d2d5045c8ec69354) Thanks [@sergioazoc](https://github.com/sergioazoc)! - What a rehearsal of moving a real site into Hollware turned up. A database that lacks the migrations of its release answers a 503 `not_migrated` that names the command to run, instead of a bare 500. `hollware import` shows an unchanged entry with the verdict of this run, not the one kept since it was written, which a change of the site's definition can have made stale. `npm create hollware` prints how to connect an agent once (init's block, which names `HOLLWARE_TOKEN`, never the token), and starts the project with `hollware dev`.

- [`655ef06`](https://github.com/hollware/hollware/commit/655ef06b1e48a9dd280fa24a4515cb154365bafe) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Security: a spent OAuth refresh token is detected whatever case its request names the media type in, and a scheduled publication is cancelled when, at its time, the token or app that scheduled it was revoked or expired, the person left the site, or their role no longer publishes.

- [`ca4225d`](https://github.com/hollware/hollware/commit/ca4225d3d0a04eb59323c89156ed167ec1b4b905) Thanks [@sergioazoc](https://github.com/sergioazoc)! - An SVG is refused when it holds a character reference or an entity beyond the five of XML, a backslash, or an animation of a link: `&[#106](https://github.com/hollware/hollware/issues/106);avascript:` in a `<set>`, or `@\69mport` in a style, got past the checks that read the text as written.
- Updated dependencies [[`84d96fd`](https://github.com/hollware/hollware/commit/84d96fdbfe0527c5aae28b52d2d5045c8ec69354), [`0647944`](https://github.com/hollware/hollware/commit/06479447b92e584277b0be96162888039e198adb), [`901959b`](https://github.com/hollware/hollware/commit/901959bff6b8de29b8db6206a47c5b2e03efef55), [`8d6edca`](https://github.com/hollware/hollware/commit/8d6edcadbf06f1c4b85c5fe9739fb09a2a1c1f85), [`f31b9fb`](https://github.com/hollware/hollware/commit/f31b9fbbd99f08ab8d094742813f62dc32834d44), [`b29fe9d`](https://github.com/hollware/hollware/commit/b29fe9d074c7b83b77014c59c41a4037d044bed4), [`83f582a`](https://github.com/hollware/hollware/commit/83f582ab6e2483fe94ba7d3953b3b968835443c7), [`4fd2a54`](https://github.com/hollware/hollware/commit/4fd2a54a0426ee128403febc89d45e127c7fa5ac), [`77b98b8`](https://github.com/hollware/hollware/commit/77b98b8e91e34b6b11c70adb16ed5fe35efda837), [`1530a5f`](https://github.com/hollware/hollware/commit/1530a5f2a49cc6e47682e123e35a8d45cef4553b), [`0235865`](https://github.com/hollware/hollware/commit/0235865719899057dc58f7888208c16f1e990eda), [`0075a00`](https://github.com/hollware/hollware/commit/0075a0089e21f378c2295b4f26f5626e866bad67), [`fe98663`](https://github.com/hollware/hollware/commit/fe98663f342ff4f69ea6e579c9dc28670ded00d7), [`44149e0`](https://github.com/hollware/hollware/commit/44149e0d5a2921754521b7be0797306cf2d5cd55), [`18aac23`](https://github.com/hollware/hollware/commit/18aac23e3ef8309fb802437d5166094cb4a7eb03), [`4d9b15e`](https://github.com/hollware/hollware/commit/4d9b15ea2d854cbec6f4390d14317b705d56cc45), [`88965e8`](https://github.com/hollware/hollware/commit/88965e8b3431656e939056cc8cfb7ec0b4206072), [`f16f745`](https://github.com/hollware/hollware/commit/f16f7452e24037ab564f4442839c26b463019d58), [`29e7ecc`](https://github.com/hollware/hollware/commit/29e7ecc893fcb5f145e53b99a7f158b518e423f3), [`73110f5`](https://github.com/hollware/hollware/commit/73110f5317dd9da454ad45a84baccedd1403767a), [`0150c9f`](https://github.com/hollware/hollware/commit/0150c9f4d1be3be699d6987946acd3bc5041e619), [`73110f5`](https://github.com/hollware/hollware/commit/73110f5317dd9da454ad45a84baccedd1403767a), [`b47f74a`](https://github.com/hollware/hollware/commit/b47f74aefaf518df6cc95b8cf9f33388b488cd22), [`42df9fb`](https://github.com/hollware/hollware/commit/42df9fb82477bec5b80385bd1b853f68d89092db), [`3b98d87`](https://github.com/hollware/hollware/commit/3b98d8701f82646554a9355e7523addb2ed5b09c), [`9e93f74`](https://github.com/hollware/hollware/commit/9e93f740a5d3c5fd68d16ea43b2ec79853ab1ee6), [`1310c51`](https://github.com/hollware/hollware/commit/1310c515a6ee07656aac57f3d5cd0fa0e824dd83), [`cebe6bb`](https://github.com/hollware/hollware/commit/cebe6bb99e776214d595f6223744b3fa670dd8ea), [`d0f43a4`](https://github.com/hollware/hollware/commit/d0f43a433a29618c763a8fde6662f777b4bb00e2), [`5e4bee1`](https://github.com/hollware/hollware/commit/5e4bee1adf9d2e119b90ca4ae3c5e07d8055c260), [`7f6ca95`](https://github.com/hollware/hollware/commit/7f6ca9528c258518065dedb22b3703910ec5e985), [`1ab4a4c`](https://github.com/hollware/hollware/commit/1ab4a4c26b492dedc77b1e1289ab883b4a0124d3), [`e6c6fb7`](https://github.com/hollware/hollware/commit/e6c6fb74ce757f74d215564a5174133e2879b1d3), [`4c03dd3`](https://github.com/hollware/hollware/commit/4c03dd3f8fb3a366f095b3f8b84c4704819b714f), [`102ea18`](https://github.com/hollware/hollware/commit/102ea18cbc076fbc47f1128b0f71e98e4dd071d8), [`ca4225d`](https://github.com/hollware/hollware/commit/ca4225d3d0a04eb59323c89156ed167ec1b4b905), [`bce8006`](https://github.com/hollware/hollware/commit/bce80069a466f41ee929f33bd11c302b92e9e3a2), [`2a302dc`](https://github.com/hollware/hollware/commit/2a302dcbe1fb41c10757352312b21861aa60f6d5), [`2244160`](https://github.com/hollware/hollware/commit/2244160693dc307127bced011214b59080832dba), [`865c6c7`](https://github.com/hollware/hollware/commit/865c6c75ebd68f3c30993a0f9f346c9188f7843f), [`51fc47c`](https://github.com/hollware/hollware/commit/51fc47c170d39ce69350c800d287309ba3ebb92e)]:
  - @hollware/core@1.0.0

## 1.0.0-rc.11

### Patch Changes

- Updated dependencies []:
  - @hollware/core@1.0.0-rc.11

## 1.0.0-rc.10

### Patch Changes

- Updated dependencies []:
  - @hollware/core@1.0.0-rc.10

## 1.0.0-rc.9

### Major Changes

- [#73](https://github.com/hollware/hollware/pull/73) [`42df9fb`](https://github.com/hollware/hollware/commit/42df9fb82477bec5b80385bd1b853f68d89092db) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The public API of 1.0 loses 54 values that nothing outside their own package used and no page of the docs names: constants, defaults and helpers internal to how Hollware works. Every type stays, as the names of what remains. Code that imported one of them takes the value from what uses it, or asks for it in an issue:

  - `@hollware/agents`: `AGENTS_CLIENT`, `ALLOWED_TOOLS`, `AUDIT_STATE`, `auditDue`, `capped`, `DailyLimitReached`, `DEFAULT_MODEL`, `kvMemory`, `LAST_AUDIT`, `reportOf`, `ROLES`, `slugOf`, `workersAiModel`
  - `@hollware/astro`: `createSource`
  - `@hollware/client`: `isPreviewToken`, `PREVIEW_COOKIE_MAX_AGE`, `previewCookie`
  - `@hollware/core`: `ASSET_SCHEME`, `assetIdIn`, `AUDIT_ACTOR_KINDS`, `AUDIT_OUTCOMES`, `CHUNK_LIMITS`, `componentDefinitionData`, `DEFAULT_AUDIT`, `DEFAULT_BACKUPS`, `DEFAULT_MAX_MARKDOWN_BYTES`, `DEFAULT_MEDIA`, `defineOperation`, `describeContract`, `describedSchemaOf`, `ERROR_CODES`, `IDENTITY_AUDIT_ACTIONS`, `IMAGE_FORMATS`, `listAssets`, `MEDIA_FORMATS`, `PERSONAL_TOKEN_PREFIX`, `PREVIEW_SECRET_MIN_LENGTH`, `PREVIEW_TOKEN_PREFIX`, `PREVIEW_TTL_SECONDS`, `READ_TOKEN_PREFIX`, `routesFor`, `ruleDefinition`, `SITE_KEY_PATTERN`, `sizesOf`, `updateAsset`, `webhookDefinition`, `WORDS_PER_MINUTE`
  - `@hollware/nuxt`: `ROUTES`
  - `@hollware/server`: `defineHandlers`, `MAX_BOUND_PARAMETERS`, `OPERATION_TIMEOUT_MS`, `OUTPUT_CAP_BYTES`
  - `create-hollware`: `USAGE`
  - `hollware`: `createWranglerRunner`

### Minor Changes

- [#71](https://github.com/hollware/hollware/pull/71) [`901959b`](https://github.com/hollware/hollware/commit/901959bff6b8de29b8db6206a47c5b2e03efef55) Thanks [@sergioazoc](https://github.com/sergioazoc)! - An owner can anonymize a person removed from the site, from Former members in People (`POST /v1/admin/people/anonymize`; `GET /v1/admin/people` lists them as `former`). What they wrote stays, and every revision, publication, review, comment, schedule, change of the structure, image and line of the activity log of the site names `FORMER_PERSON` of `@hollware/core` instead of them, without the tokens, IP hashes and client names it held; the name leaves the review events, their tokens and invitations of the site go, and so do the apps they allowed for it. Once no site keeps them, the person goes from the deployment with their passkeys and sessions. The append-only triggers allow those changes only while the anonymization is open, and nothing else; the activity log records `member.anonymize`, naming no one.

- [#66](https://github.com/hollware/hollware/pull/66) [`b29fe9d`](https://github.com/hollware/hollware/commit/b29fe9d074c7b83b77014c59c41a4037d044bed4) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The daily backup is `backup/2`: besides the definition and the Markdown of every entry, it keeps the redirects of the site, with their paths, and the list of its images (id, format, sizes, alt, file name). It goes to the R2 bucket `BACKUPS` when the Worker binds one, apart from the images, and to `MEDIA` without it; `list_backups` and `GET /v1/backups/<date>` read from the same bucket.

- [#26](https://github.com/hollware/hollware/pull/26) [`4fd2a54`](https://github.com/hollware/hollware/commit/4fd2a54a0426ee128403febc89d45e127c7fa5ac) Thanks [@sergioazoc](https://github.com/sergioazoc)! - One style of Markdown for people and agents. `create_draft` and `update_draft` store the canonical Markdown of Comark (`formatMarkdown` in `@hollware/core`) whenever it means the same document, and answer it as `markdown`; the same file in another style answers `unchanged`. Older revisions keep their bytes; an entry takes the canonical form at its next write.

  The admin is laid out like Linear. An entry is a page with its title and its body in a visual editor (TipTap through Nuxt UI): `/` inserts blocks and the components of the collection, a selection gets a bar of formats, blocks drag and move, Comark components are cards with their props, and anything the editor does not know stays a Markdown block. It saves by itself, writes with the same Comark writer the server uses, and opens a file it cannot keep byte for byte in the Markdown view (⌘⇧M). Properties, checks and a live preview, rendered with the pipeline of `@hollware/core`, sit in a side panel; history sits under the body; Publish is the one action of the bar and the rest is in the `⋯` menu. Entries are a list grouped by status with views, filters, keyboard moves (J, K, X) and a floating bar for many at once. Settings (site, collections, people, tokens, activity, account) have their own section at `/settings`; the old paths are gone. `?` lists the shortcuts.

  A violation may carry `code`, which kind of problem of its contract it is, and `params`, the values its message names, so a client can say it in another language; the admin shows the checks in Spanish from them, and the English `message` and `fix` stay as they were. The entry's side panel holds Properties and History; the live preview is gone, since the editor shows the page as it reads.

- [#63](https://github.com/hollware/hollware/pull/63) [`44149e0`](https://github.com/hollware/hollware/commit/44149e0d5a2921754521b7be0797306cf2d5cd55) Thanks [@sergioazoc](https://github.com/sergioazoc)! - An event no receiver took is no longer lost. When the Queue gives up on an event after five tries, its dead-letter queue, which the Worker now consumes too, marks it as given up on, and the activity log says so (`event.abandon`). Webhooks, in the admin, lists the deliveries that failed, with their last error and whether the Queue still tries, and sends an event again (`GET /v1/admin/deliveries`, `POST /v1/admin/events/:id/retry`). The activity log records that as `event.retry`, and names `move_entry`, `schedule_unpublish`, `app.refresh_reused` and `schedule.unpublish`, which its filter showed blank.

- [#69](https://github.com/hollware/hollware/pull/69) [`b14218b`](https://github.com/hollware/hollware/commit/b14218bbb905f2d8542af396fb83aeeaaa2f437e) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The editor of the admin writes far fewer revisions. It saves 8 seconds after the last change, and at least once a minute while the typing goes on, instead of a second and a half after each pause; it also saves when the tab is hidden, the page is left or another entry opens, such as a translation. Until then the browser keeps what was typed, so a crash loses nothing: the next time the entry opens, the changes come back with a notice, to keep or discard, and changes kept for an older version are offered rather than applied. Home shows an owner how big the database of the deployment is, against the 500 MB of a D1 database on the Free plan (`GET /v1/admin/database`), and `hollware doctor --remote` says it too.

- [#42](https://github.com/hollware/hollware/pull/42) [`6da0187`](https://github.com/hollware/hollware/commit/6da018757b7ca742ec9626fa5ad116d3547df290) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The MCP server gives a client its instructions when it starts: read describe_site first, write whole Markdown files, fix what the verdict lists, how to acknowledge warnings, what pending_review means and how to name an image. Clients such as Claude Code put them in the context of the model.

- [#70](https://github.com/hollware/hollware/pull/70) [`3b98d87`](https://github.com/hollware/hollware/commit/3b98d8701f82646554a9355e7523addb2ed5b09c) Thanks [@sergioazoc](https://github.com/sergioazoc)! - An owner can delete an entry of the trash for ever, from the trash of Entries in the admin (`POST /v1/admin/entries/:id/purge`): its revisions, publications, reviews and their comments, redirects, schedules and events go with it, and nothing brings it back. The record of the purge (`entry_purges`, who and when) is what lets the append-only triggers delete those rows, and it is never deleted itself; every other revision and publication stays append-only. The activity log records `entry.purge`.

- [#45](https://github.com/hollware/hollware/pull/45) [`7f6ca95`](https://github.com/hollware/hollware/commit/7f6ca9528c258518065dedb22b3703910ec5e985) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Webhooks get the events of a review: `review.requested` when someone without `content:publish` asks to publish, and `review.decided` when the review is approved, sent back for changes, rejected or cancelled by a new revision. Each one carries the review, its entry and `adminPath`, where the admin opens it, and `parseHollwareEvent` reads it. They reach the webhooks at the next sweep of the cron, within a minute, and never IndexNow. Migration `0024` adds them to the outbox.

- [#52](https://github.com/hollware/hollware/pull/52) [`e6c6fb7`](https://github.com/hollware/hollware/commit/e6c6fb74ce757f74d215564a5174133e2879b1d3) Thanks [@sergioazoc](https://github.com/sergioazoc)! - An invitation that waits can be revoked, and its link stops working at once: from People in the admin (`POST /v1/admin/invitations/:id/revoke`), or with `hollware invite revoke <id>` after `hollware invite list`. The activity log records it as `invitation.revoke`.

- [#40](https://github.com/hollware/hollware/pull/40) [`9305e2d`](https://github.com/hollware/hollware/commit/9305e2dc7bb336c97523a05ea79190c2f733b5c6) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A personal token expires after 90 days unless its maker asks for other days or for none: `hollware token create` takes `--no-expiry`, the admin's Tokens page has a "Never expires" box, and `POST /v1/admin/tokens` takes `expiresInDays: null`. A read token still never expires unless it is given days.

- [#39](https://github.com/hollware/hollware/pull/39) [`e3f3a0c`](https://github.com/hollware/hollware/commit/e3f3a0cdaa409304683d5e182ea4094befc343d3) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A personal token lists only the MCP tools its scopes allow, so an agent no longer sees tools it cannot call, and its client keeps that list to itself. An OAuth client still lists every tool, so that it can ask for more scopes, and a call without the scope still gets the 403 that names it.

- [#58](https://github.com/hollware/hollware/pull/58) [`2a302dc`](https://github.com/hollware/hollware/commit/2a302dcbe1fb41c10757352312b21861aa60f6d5) Thanks [@sergioazoc](https://github.com/sergioazoc)! - `upload_asset` takes a public https `url` instead of `data`: Hollware downloads the image, at most 10 MB, and keeps it as one sent in base64. An agent no longer has to write out the bytes of an image.

- [#41](https://github.com/hollware/hollware/pull/41) [`2244160`](https://github.com/hollware/hollware/commit/2244160693dc307127bced011214b59080832dba) Thanks [@sergioazoc](https://github.com/sergioazoc)! - An entry that waits for review says so in the editor, with a link to its review, and a change to it is not saved until the person chooses: discard it, review the request, or save and cancel the request. Before, an autosave cancelled the request of the author without a word. `list_reviews` takes `entryId` to list the requests of one entry, and Reviews opens the one named in `?review=`.

### Patch Changes

- [#54](https://github.com/hollware/hollware/pull/54) [`ba63bdf`](https://github.com/hollware/hollware/commit/ba63bdf4f49e0821f3f5bc408085169a74710d73) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The MCP SDK loads on the first request to `/mcp` of an isolate, not at every cold start: a Worker that only serves the reads of its sites evaluates about 45 KiB (gzip) less before its first answer.

- [#24](https://github.com/hollware/hollware/pull/24) [`73110f5`](https://github.com/hollware/hollware/commit/73110f5317dd9da454ad45a84baccedd1403767a) Thanks [@sergioazoc](https://github.com/sergioazoc)! - An upload that opens on an XML declaration and many comments no longer stalls the check of its format, and a URL or a path with thousands of trailing slashes no longer takes seconds to trim: both are read in linear time.

- [#24](https://github.com/hollware/hollware/pull/24) [`73110f5`](https://github.com/hollware/hollware/commit/73110f5317dd9da454ad45a84baccedd1403767a) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The packages carry no comments but the TSDoc of their public API, and the help of the CLI and the descriptions of the MCP tools no longer cite decision records the repository does not have. The starter's `AGENTS.md` now says what each setting of its `wrangler.jsonc` is for.
- Updated dependencies [[`901959b`](https://github.com/hollware/hollware/commit/901959bff6b8de29b8db6206a47c5b2e03efef55), [`b29fe9d`](https://github.com/hollware/hollware/commit/b29fe9d074c7b83b77014c59c41a4037d044bed4), [`4fd2a54`](https://github.com/hollware/hollware/commit/4fd2a54a0426ee128403febc89d45e127c7fa5ac), [`77b98b8`](https://github.com/hollware/hollware/commit/77b98b8e91e34b6b11c70adb16ed5fe35efda837), [`fe98663`](https://github.com/hollware/hollware/commit/fe98663f342ff4f69ea6e579c9dc28670ded00d7), [`44149e0`](https://github.com/hollware/hollware/commit/44149e0d5a2921754521b7be0797306cf2d5cd55), [`18aac23`](https://github.com/hollware/hollware/commit/18aac23e3ef8309fb802437d5166094cb4a7eb03), [`4d9b15e`](https://github.com/hollware/hollware/commit/4d9b15ea2d854cbec6f4390d14317b705d56cc45), [`73110f5`](https://github.com/hollware/hollware/commit/73110f5317dd9da454ad45a84baccedd1403767a), [`73110f5`](https://github.com/hollware/hollware/commit/73110f5317dd9da454ad45a84baccedd1403767a), [`42df9fb`](https://github.com/hollware/hollware/commit/42df9fb82477bec5b80385bd1b853f68d89092db), [`3b98d87`](https://github.com/hollware/hollware/commit/3b98d8701f82646554a9355e7523addb2ed5b09c), [`7f6ca95`](https://github.com/hollware/hollware/commit/7f6ca9528c258518065dedb22b3703910ec5e985), [`e6c6fb7`](https://github.com/hollware/hollware/commit/e6c6fb74ce757f74d215564a5174133e2879b1d3), [`2a302dc`](https://github.com/hollware/hollware/commit/2a302dcbe1fb41c10757352312b21861aa60f6d5), [`2244160`](https://github.com/hollware/hollware/commit/2244160693dc307127bced011214b59080832dba)]:
  - @hollware/core@1.0.0-rc.9

## 1.0.0-rc.8

### Patch Changes

- [`0743a55`](https://github.com/hollware/hollware/commit/0743a5544e13678090b591348ed69a8ffaf83ec7) Thanks [@sergioazoc](https://github.com/sergioazoc)! - `content_stats` and `connect_analytics` get 30 seconds instead of 10, and a provider of analytics 25 seconds instead of 8: PostHog's query API takes 5 to 15 seconds, so connecting it answered `unreachable`. Every other tool keeps its 10 seconds. The limit is exported as `OPEN_WORLD_TIMEOUT_MS`.
- Updated dependencies []:
  - @hollware/core@1.0.0-rc.8

## 1.0.0-rc.7

### Major Changes

- [`0647944`](https://github.com/hollware/hollware/commit/06479447b92e584277b0be96162888039e198adb) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Hollware no longer counts page views: a site connects the analytics it already has, and `content_stats` reads them (ADR-040). Connect Cloudflare Web Analytics, PostHog, Plausible or GA4 in the admin (Site, Analytics), with `hollware analytics connect <provider> --credential-file <file>`, or with the new tool `connect_analytics`; the read-only key is tested before it is kept, sealed under `HOLLWARE_SECRET`, and never shown again (`get_analytics`, `disconnect_analytics`).

  To upgrade: remove `beacon` from `hollware` in `nuxt.config`; remove the `analytics_engine_datasets` binding `ANALYTICS` and the variables `HOLLWARE_ANALYTICS_ACCOUNT_ID` and `HOLLWARE_ANALYTICS_DATASET` from the Worker's `wrangler.jsonc`, and delete its secret `HOLLWARE_ANALYTICS_TOKEN` (`wrangler secret delete HOLLWARE_ANALYTICS_TOKEN`); then connect the site's analytics. `POST /events` is gone, and `@hollware/server` no longer exports `AnalyticsWriter` and `PageView`.

### Patch Changes

- Updated dependencies [[`0647944`](https://github.com/hollware/hollware/commit/06479447b92e584277b0be96162888039e198adb)]:
  - @hollware/core@1.0.0-rc.7

## 1.0.0-rc.6

### Minor Changes

- [`b8b1f62`](https://github.com/hollware/hollware/commit/b8b1f62576bfa753d8f54af8bf871281b4a23ece) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The admin and the sign-in pages take Hollware's own look (ADR-039): the flame pumpkin as the mark, Schibsted Grotesk and JetBrains Mono, a warm black ground and an amber accent. Publishing an entry is the amber button of its page.

### Patch Changes

- Updated dependencies []:
  - @hollware/core@1.0.0-rc.6

## 1.0.0-rc.5

### Minor Changes

- [`88965e8`](https://github.com/hollware/hollware/commit/88965e8b3431656e939056cc8cfb7ec0b4206072) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Components to render entries in every framework:

  - `<HollwareImage>` in React, Vue and Nuxt renders the image a frontmatter field holds (a cover) with its alt, its size and the `srcset` of its copies; `imageOf(entry, field)` of `@hollware/client` gives the same attributes for any other renderer. The `images` of a summary carry the alt of each image.
  - `@hollware/astro` exports `HollwareContent.astro`, which renders an entry from its document with the site's own Astro components (`components={{ callout: Callout }}`), through the same rules as the HTML Hollware makes, and `HollwareImage.astro`. Its loaders keep the document and the images of each entry for them.
  - `safeDocument` of `@hollware/core` copies a document through the rules of `renderHtml`, for a renderer of a site's own.

### Patch Changes

- Updated dependencies [[`88965e8`](https://github.com/hollware/hollware/commit/88965e8b3431656e939056cc8cfb7ec0b4206072)]:
  - @hollware/core@1.0.0-rc.5

## 1.0.0-rc.4

### Minor Changes

- [`9e93f74`](https://github.com/hollware/hollware/commit/9e93f740a5d3c5fd68d16ea43b2ec79853ab1ee6) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The reading time counts the code a reader reads: the pipeline counts the words of code blocks apart (`codeWords`), each revision keeps them (migration `0022`, filled for older revisions by the reparse of the cron, as `PIPELINE_VERSION` 3 marks them), and `readingTime` of `automaticFields` is the words and the words of code at 200 a minute. `wordCount` stays the words of the text.

### Patch Changes

- Updated dependencies [[`9e93f74`](https://github.com/hollware/hollware/commit/9e93f740a5d3c5fd68d16ea43b2ec79853ab1ee6)]:
  - @hollware/core@1.0.0-rc.4

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

- [`cebe6bb`](https://github.com/hollware/hollware/commit/cebe6bb99e776214d595f6223744b3fa670dd8ea) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Entries can refer to entries of another collection: the rule `reference` of the catalog (a field, a collection, and optionally a locale) checks that each slug a field names exists when writing, and is published to publish. `get_entry` with `references: true` (MCP, RPC, `?references=true`, and `createHollware().getEntry(…, { references: true })`) answers the published entries each field names, in its order: an author, a series, the event of a talk.

- [`5e4bee1`](https://github.com/hollware/hollware/commit/5e4bee1adf9d2e119b90ca4ae3c5e07d8055c260) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Responsive images: when an image is uploaded, Hollware also makes its narrower copies, the `media.widths` of the site (640 and 1280 pixels by default, `[]` for none), served at `<url>/<width>`. `upload_asset`, `get_asset` and `list_assets` answer `widths` and `srcset`; the HTML of `get_entry`, and the document a site reads, give each image its `srcset`, `sizes`, `width` and `height`; and a summary read by a site (`get_entry`, `list_entries`, `createHollware()`) carries `images`, the size and `srcset` of each image its frontmatter names, by URL, to lay out a cover. The admin sets the format, quality, widest width and copies in Site, and shows the copies of each image. Images uploaded before keep none.

- [`1ab4a4c`](https://github.com/hollware/hollware/commit/1ab4a4c26b492dedc77b1e1289ab883b4a0124d3) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The history of an entry, over MCP and in the admin. `list_revisions` lists every revision of an entry, newest first, with who wrote it, when, what the contracts said, and which one the site shows; `get_revision` reads the Markdown of one; `restore_revision` goes back to one, as a new revision, so nothing is ever deleted or rewritten. The admin has a History tab on each entry: a revision opens beside the latest one, and "Restore this version" goes back to it.

- [`4c03dd3`](https://github.com/hollware/hollware/commit/4c03dd3f8fb3a366f095b3f8b84c4704819b714f) Thanks [@sergioazoc](https://github.com/sergioazoc)! - An entry can leave the site at a time: `schedule_unpublish` (MCP) and "Unpublish later" in the admin keep a published entry live until then, and the cron unpublishes it in the name of who scheduled it, if they may still publish. `get_entry` says when, as `unpublishAt`; null cancels it, and an unpublish before the time drops it.

- [`102ea18`](https://github.com/hollware/hollware/commit/102ea18cbc076fbc47f1128b0f71e98e4dd071d8) Thanks [@sergioazoc](https://github.com/sergioazoc)! - `search` answers, with `passages: true`, the passage each result matched: the whole section of the entry, its heading, and the URL of the entry on the site, what a model reads to answer with your content and cite it (RAG). `minScore` leaves out what matches by meaning less, so a question nothing answers finds nothing. Over MCP, RPC, the read API (`?passages=true&minScore=0.5`) and `createHollware`.

- [`bce8006`](https://github.com/hollware/hollware/commit/bce80069a466f41ee929f33bd11c302b92e9e3a2) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A translation says when its source moved past it: `translationOutdated` is true for an entry in another locale than the site's default whose source, the entry of its group in the default locale, was changed after it was saved, until it is saved again. In list_entries, get_entry and get_translations; the admin marks it "behind its source" and filters by it.

### Patch Changes

- [`8d6edca`](https://github.com/hollware/hollware/commit/8d6edcadbf06f1c4b85c5fe9739fb09a2a1c1f85) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The same image uploaded to two sites of one deployment is two assets, each with an id of its site and its bytes; with rc.2 the second upload failed with a server error and left its files in R2. Assets uploaded before keep their ids and are found by their bytes. `hollware import` of an export into another site writes the `asset:` references with the ids that site gives.

- [`75c4281`](https://github.com/hollware/hollware/commit/75c4281d6afc557fdccc68f532b6b32780d61021) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A site reads URLs where content wrote `asset:` in every read: a preview of a draft and the related entries of `getEntry` too, which kept the raw reference.

- [`eadb82e`](https://github.com/hollware/hollware/commit/eadb82e6a88d31dfadb688872f32e910d621cb84) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The cron rebuilds, twenty a minute, the stored documents of the revisions that an older Comark or Markdown pipeline parsed, from the Markdown each revision keeps; a release that changes the pipeline (as this one does, to version 2) reaches every revision without a command.

- [`e8155a5`](https://github.com/hollware/hollware/commit/e8155a58dd30540007956d1eb15547cabedf62fa) Thanks [@sergioazoc](https://github.com/sergioazoc)! - `upload_asset` refuses an image that Cloudflare Images cannot decode (error 9516, such as a PNG cut short) with what to do, instead of failing with a server error.

- [`8b8b51f`](https://github.com/hollware/hollware/commit/8b8b51fd057b945b826c2c1a67b3193a713f7483) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Hardening: the reply to a publish question counts only for the entry the call publishes; a webhook secret sealed by 0.8 to 0.10 is sealed again to its site and name when it is read; and the webhook route of `@hollware/nuxt` purges only for events of its own site.

- [`ea570be`](https://github.com/hollware/hollware/commit/ea570be69416f9a9b87d6d3a449975a42a58ab48) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A preview read on a Hollware without `HOLLWARE_SECRET` is refused as `invalid_preview`, like any refused preview link, so a site drops its preview cookie and shows the published page instead of an error.

- [`1310c51`](https://github.com/hollware/hollware/commit/1310c515a6ee07656aac57f3d5cd0fa0e824dd83) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The READMEs on npm say what each package is and how it is used, instead of "pre-alpha, not usable yet"; the CLI's lists `dev` and `mcp-config`.

- [`655ef06`](https://github.com/hollware/hollware/commit/655ef06b1e48a9dd280fa24a4515cb154365bafe) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Security: a spent OAuth refresh token is detected whatever case its request names the media type in (T-34), and a scheduled publication is cancelled when, at its time, the token or app that scheduled it was revoked or expired, the person left the site, or their role no longer publishes (T-108).

- [`ca4225d`](https://github.com/hollware/hollware/commit/ca4225d3d0a04eb59323c89156ed167ec1b4b905) Thanks [@sergioazoc](https://github.com/sergioazoc)! - An SVG is refused when it holds a character reference or an entity beyond the five of XML, a backslash, or an animation of a link: `&[#106](https://github.com/hollware/hollware/issues/106);avascript:` in a `<set>`, or `@\69mport` in a style, got past the checks that read the text as written.
- Updated dependencies [[`8d6edca`](https://github.com/hollware/hollware/commit/8d6edcadbf06f1c4b85c5fe9739fb09a2a1c1f85), [`f31b9fb`](https://github.com/hollware/hollware/commit/f31b9fbbd99f08ab8d094742813f62dc32834d44), [`83f582a`](https://github.com/hollware/hollware/commit/83f582ab6e2483fe94ba7d3953b3b968835443c7), [`1530a5f`](https://github.com/hollware/hollware/commit/1530a5f2a49cc6e47682e123e35a8d45cef4553b), [`0235865`](https://github.com/hollware/hollware/commit/0235865719899057dc58f7888208c16f1e990eda), [`0075a00`](https://github.com/hollware/hollware/commit/0075a0089e21f378c2295b4f26f5626e866bad67), [`29e7ecc`](https://github.com/hollware/hollware/commit/29e7ecc893fcb5f145e53b99a7f158b518e423f3), [`0150c9f`](https://github.com/hollware/hollware/commit/0150c9f4d1be3be699d6987946acd3bc5041e619), [`1310c51`](https://github.com/hollware/hollware/commit/1310c515a6ee07656aac57f3d5cd0fa0e824dd83), [`cebe6bb`](https://github.com/hollware/hollware/commit/cebe6bb99e776214d595f6223744b3fa670dd8ea), [`d0f43a4`](https://github.com/hollware/hollware/commit/d0f43a433a29618c763a8fde6662f777b4bb00e2), [`5e4bee1`](https://github.com/hollware/hollware/commit/5e4bee1adf9d2e119b90ca4ae3c5e07d8055c260), [`1ab4a4c`](https://github.com/hollware/hollware/commit/1ab4a4c26b492dedc77b1e1289ab883b4a0124d3), [`4c03dd3`](https://github.com/hollware/hollware/commit/4c03dd3f8fb3a366f095b3f8b84c4704819b714f), [`102ea18`](https://github.com/hollware/hollware/commit/102ea18cbc076fbc47f1128b0f71e98e4dd071d8), [`ca4225d`](https://github.com/hollware/hollware/commit/ca4225d3d0a04eb59323c89156ed167ec1b4b905), [`bce8006`](https://github.com/hollware/hollware/commit/bce80069a466f41ee929f33bd11c302b92e9e3a2), [`865c6c7`](https://github.com/hollware/hollware/commit/865c6c75ebd68f3c30993a0f9f346c9188f7843f)]:
  - @hollware/core@1.0.0-rc.3

## 1.0.0-rc.2

### Minor Changes

- [`f16f745`](https://github.com/hollware/hollware/commit/f16f7452e24037ab564f4442839c26b463019d58) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Images (ADR-038). `upload_asset` takes a JPEG, PNG, WebP, AVIF, GIF or SVG, judged by its bytes, and converts it once by the site's new `media` setting (WebP at 85 by default, PNG lossless, GIF with its frames, nothing wider than 2400 px; or AVIF, or the file as it came). An SVG is kept as it is, and refused when anything in it can run. R2 keeps the image and its original; content shows it as `img: asset:ast_…` or `![alt](asset:ast_…)`, which reads of the published site and HTML turn into the URL where the Worker serves it, cached for a year. `list_assets` and `get_asset` read them; the admin has an Images page; `hollware export --assets <dir> --assets-url <path>` writes the images for a site that serves them itself, and without it keeps the originals in `_assets/`, which `hollware import` uploads again under the same ids. A new project binds an R2 bucket (`MEDIA`), which the first deploy creates, and the Images binding (`IMAGES`); `hollware doctor` says when either is missing. Migration 0017 adds the `assets` table.

### Patch Changes

- [`e2c6926`](https://github.com/hollware/hollware/commit/e2c6926c5ccb25787cddd19e1dc8b34b256a0ace) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A Hollware stays out of search engines: every answer carries `X-Robots-Tag: noindex, nofollow`, and `GET /robots.txt` disallows everything. A CMS is never a public site; the sites it feeds are.
- Updated dependencies [[`f16f745`](https://github.com/hollware/hollware/commit/f16f7452e24037ab564f4442839c26b463019d58), [`51fc47c`](https://github.com/hollware/hollware/commit/51fc47c170d39ce69350c800d287309ba3ebb92e)]:
  - @hollware/core@1.0.0-rc.2

## 1.0.0-rc.1

### Minor Changes

- [`84d96fd`](https://github.com/hollware/hollware/commit/84d96fdbfe0527c5aae28b52d2d5045c8ec69354) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Setting Hollware up from an agent: `hollware init` and `hollware token create` take `--token-file <path>` (mode 0600, refused when the file exists unless `--force`) and print its path instead of the token, and `create-hollware` passes it through. `--json` on `create-hollware`, `init`, `token create`, `invite` and `doctor` prints one JSON object and nothing else. `hollware dev` starts the project's local server, waits for `/health` and stays in the foreground until SIGINT or SIGTERM (`--detach` and `--stop` run it in the background), and `hollware mcp-config` prints the `claude mcp add` line or the JSON block of Claude Code, Cursor and VS Code, which name `HOLLWARE_TOKEN` and never the token. The output of `init` and `create-hollware` says the passkey link is for the admin and an agent starts with the token alone. `GET /v1` answers 200 with the URLs of the OpenAPI document and of `/v1/site`, with no token. `update_site` and `set_collection` answer `conflict` on a stale version with a `message` and a `fix` that say to call `get_structure` again.

### Patch Changes

- [`84d96fd`](https://github.com/hollware/hollware/commit/84d96fdbfe0527c5aae28b52d2d5045c8ec69354) Thanks [@sergioazoc](https://github.com/sergioazoc)! - What a rehearsal of moving a real site into Hollware turned up. A database that lacks the migrations of its release answers a 503 `not_migrated` that names the command to run, instead of a bare 500. `hollware import` shows an unchanged entry with the verdict of this run, not the one kept since it was written, which a change of the site's definition can have made stale. `npm create hollware` prints how to connect an agent once (init's block, which names `HOLLWARE_TOKEN`, never the token), and starts the project with `hollware dev`.
- Updated dependencies [[`84d96fd`](https://github.com/hollware/hollware/commit/84d96fdbfe0527c5aae28b52d2d5045c8ec69354)]:
  - @hollware/core@1.0.0-rc.1

## 1.0.0-rc.0

### Patch Changes

- Updated dependencies [[`b47f74a`](https://github.com/hollware/hollware/commit/b47f74aefaf518df6cc95b8cf9f33388b488cd22)]:
  - @hollware/core@1.0.0-rc.0

## 0.11.0

### Minor Changes

- [`9e72522`](https://github.com/hollware/hollware/commit/9e725225be6bf8e85518f2521b21e76b9109681b) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A person manages their own sign-in over `/v1/admin/account`: they list and remove their passkeys (never the last one), list and revoke the apps they connected, and end every session at once, and `POST /authorize/signout` signs one browser out.

- [`069c95f`](https://github.com/hollware/hollware/commit/069c95f1e940ea4f9ac013cac3a69d5ad5d7732d) Thanks [@sergioazoc](https://github.com/sergioazoc)! - An activity log of who did what (ADR-037). Every operation that is not a read, every change of tokens, people and invitations in the admin, sign-in and sign-out, an invitation accepted, an app allowed or revoked, and each scheduled publication write a line: who did it as Hollware verified it (a person, a token, an app, or the deployment), what the client declared apart, the action, its target and its outcome, refusals of a scope included. The log is append-only in D1 (migration `0016_audit_log`). Owners read it on the admin's Activity page and download it as CSV.

  The owner decides what it keeps, in the site's `audit`: `ipAddresses` is `off` by default (`hashed` keeps an HMAC of each address keyed by the site, never the address), and `retentionDays` is `null` by default (forever), or 30 to 3650 days. `hollware init` and `npm create hollware` take `--ip-addresses` and `--audit-retention-days`.

- [`304e18d`](https://github.com/hollware/hollware/commit/304e18d68482c88db6987e2453bcfa0b75467595) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A person in the admin opens the latest revision of an entry, a draft included, on the real site before it is published. "Preview on the site" makes a signed link of one hour for that entry (`hw_prv_…`, `POST /v1/admin/preview`, `preview.create` in the activity log), and `getEntry` takes it as `preview` over the RPC binding, the read API (`?preview=`) and `@hollware/client`; a token that does not hold is an error, never the published version. The token is in the URL once: `@hollware/nuxt` and the new `hollwarePreview()` middleware of `@hollware/astro` answer the link with a `303` to the same URL without `?hollware-preview=` and keep the token in the `hollware_preview` cookie (HttpOnly, SameSite=Lax, one hour, Secure but on localhost), `useHollwareEntry` and the live loader (`getLiveEntry('blog', { id, preview })`) read it from there, a token Hollware refuses as expired or invalid clears the cookie, and a previewed page is never cached. `@hollware/client` exports the pure parts. It needs the Worker secret `HOLLWARE_SECRET`.

- [`1b3f3a2`](https://github.com/hollware/hollware/commit/1b3f3a27d6f42852fae1761ca34a9269e19f0609) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The routes anyone may call without a token (sign-in and passkeys, OAuth's token and registration endpoints, the beacon) are rate limited per address when the Worker has a Workers Rate Limiting binding, `HOLLWARE_RATE_LIMIT`, which new projects get (60 requests a minute): past it they answer 429 with Retry-After. And the cron trigger drops the expired sessions and the sign-in challenges nobody took, which anyone could make pile up a row a request.

- [`3893d8e`](https://github.com/hollware/hollware/commit/3893d8e6b2d66ceb429cc24dbad51a5a2191dd89) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A token's expiry is the person's choice: `hollware token create` and the admin's Tokens page make a token that never expires when no days are given, and one that expires in the days given (1 to 365) otherwise. Revoking it ends it at once.

### Patch Changes

- [`ead05f6`](https://github.com/hollware/hollware/commit/ead05f60b7240ede34e78a9f2694a238ac8932a6) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A refresh token used again after it was spent revokes its grant (T-34). The OAuth library takes the previous refresh token again so a client whose answer was lost can retry; past one minute after the rotation that spent it, Hollware now refuses it, revokes the grant with every token of it, and writes `app.refresh_reused` to the site's activity log.

- [`7c7497a`](https://github.com/hollware/hollware/commit/7c7497a5b387bce2897c58e59e27994c30849a9c) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The beacon (`POST /events`) refuses a body over its limit before reading it, by its declared length or as it streams, and answers a site it does not serve as it answers a page of another origin, so it never tells which site keys exist.

- [`6580025`](https://github.com/hollware/hollware/commit/6580025fd537a3756a4f93e04dae69e79bca4b8c) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Security headers that the OWASP ZAP baseline of staging asked for: every answer of the Worker has `X-Content-Type-Options: nosniff`, and `Strict-Transport-Security` when the public URL is https. Its pages add `Cross-Origin-Opener-Policy` and `Cross-Origin-Resource-Policy` of `same-origin` and a `Permissions-Policy` that asks for no device. The sign-in, setup and consent pages allow their own stylesheet by its hash instead of `'unsafe-inline'`, and the admin's built files get the same headers through `_headers`.

- [`5e24d98`](https://github.com/hollware/hollware/commit/5e24d987c38466a315bcb3b94c3dfa23de90e71f) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Security fixes from the threat model:

  - `verifyWebhook` takes `isNew(eventId)`. Given it, a webhook replayed within the tolerance is refused, by the id of its signed body (T-67).
  - The renderer reads a URL bound to the frontmatter (`:href="frontmatter.url"`) under its own rules instead of leaving it to `@comark/html`, which let a `data:image/svg+xml` link through (T-59).
  - An invitation link carries its secret in the fragment (`/setup#invitation=…`), which no request log holds. Older links still work (T-55).
  - Sign-in requires user verification explicitly. A counter that went back, or an assertion from another origin, is a refused passkey, not a server error (T-52, T-53).
  - The admin shows the preview of a draft in a sandboxed frame. Nothing it renders can run, reach the admin or draw over it (T-60).

- [`1b9ebc6`](https://github.com/hollware/hollware/commit/1b9ebc60c67299230f3b537e470f770e3d9a9a71) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The secrets Hollware seals under `HOLLWARE_SECRET` (those of webhooks) are bound to the site and the name they are stored under: a sealed value moved to another row of D1 no longer opens there. Values sealed before (`v1.`) still open.

- [`4293be3`](https://github.com/hollware/hollware/commit/4293be3154afa381c1dd58011d151ed98fa51df3) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The history of the structure of the sites (`site_changes`) is append-only, as revisions and publications are: migration `0015_site_changes_append_only` adds triggers that abort deleting, changing or replacing a line.

- [`6a41fd5`](https://github.com/hollware/hollware/commit/6a41fd538212f352f9115f2a583775db56e19843) Thanks [@sergioazoc](https://github.com/sergioazoc)! - `get_structure` shows the URL of a webhook whole only to a token with `schema:admin`; anyone else sees its origin, as a webhook's path and query are often its secret (a deploy hook).
- Updated dependencies [[`069c95f`](https://github.com/hollware/hollware/commit/069c95f1e940ea4f9ac013cac3a69d5ad5d7732d), [`304e18d`](https://github.com/hollware/hollware/commit/304e18d68482c88db6987e2453bcfa0b75467595), [`ead05f6`](https://github.com/hollware/hollware/commit/ead05f60b7240ede34e78a9f2694a238ac8932a6), [`5e24d98`](https://github.com/hollware/hollware/commit/5e24d987c38466a315bcb3b94c3dfa23de90e71f)]:
  - @hollware/core@0.11.0

## 0.10.0

### Minor Changes

- [`eb4df6d`](https://github.com/hollware/hollware/commit/eb4df6dd3a8eafc7b04266478a2f0950adea0bbc) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Entries have a trash: `delete_entry` moves a draft there and cancels its pending review, `restore_entry` brings it back as the draft it was, `list_entries` lists it with `trashed: true`, every summary carries `deletedAt`, `create_draft` answers `in_trash` for the slug a trashed entry keeps, migration `0014_entry_trash` adds the column, and the admin trashes a draft from the editor and lists, trashes and restores entries in bulk under the filter "In the trash".

- [`ad56b86`](https://github.com/hollware/hollware/commit/ad56b8656041396926ab9b1de602cf15519a5f38) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Security: a site's definition can no longer send a secret of the Worker out. IndexNow's `key` is the key itself now, which is public (8 to 128 letters, digits or hyphens; `INDEXNOW_KEY`), not the name of a Worker secret, and a webhook may not name a secret of Hollware or of Cloudflare (`HOLLWARE_*`, `CLOUDFLARE_*`, `CF_*`). Before, an owner of one site, or an agent with `schema:admin`, could name `HOLLWARE_SECRET` as an IndexNow key and have its value sent to IndexNow. A stored definition of the old form is served with IndexNow off, and logs `indexnow_off`; set the key itself to turn it on. The sign-in page also goes back only to a page of its own origin: a `return_to` such as `/\evil.example` could send a person to another host after their passkey.

- [`75341bf`](https://github.com/hollware/hollware/commit/75341bf1134084e2ac8b316a661ee46fe863b1ca) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A change of a site's structure is an event too: `site.changed`, sent to the site's webhooks with the cache tags it invalidates (`site`, and every list of the collections and locales the site had or has, `tagsOfSiteChange`), so a site that caches its pages purges its navigation and lists when a collection, a route or a locale changes, with no publish. The event carries no entry, and IndexNow is not told of it. Migration `0013_site_events` rebuilds the outbox to take it, keeping every event and delivery.

### Patch Changes

- Updated dependencies [[`eb4df6d`](https://github.com/hollware/hollware/commit/eb4df6dd3a8eafc7b04266478a2f0950adea0bbc), [`6a8e7b5`](https://github.com/hollware/hollware/commit/6a8e7b57f894722d808f1708b353884ad2f0a6d7), [`ad56b86`](https://github.com/hollware/hollware/commit/ad56b8656041396926ab9b1de602cf15519a5f38), [`75341bf`](https://github.com/hollware/hollware/commit/75341bf1134084e2ac8b316a661ee46fe863b1ca)]:
  - @hollware/core@0.10.0

## 0.9.1

### Patch Changes

- Updated dependencies []:
  - @hollware/core@0.9.1

## 0.9.0

### Patch Changes

- Updated dependencies []:
  - @hollware/core@0.9.0

## 0.8.0

### Minor Changes

- [`ed861e0`](https://github.com/hollware/hollware/commit/ed861e0c33e33c24a95c1385d620ff55446f134d) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The admin shapes the site with no deploy (ADR-033): Collections lists them and makes one from a preset (a blog, docs, or a title alone); the editor of a collection edits its fields (kind, bounds, choices, required, order), its paths per locale, the fields of translations, tags and order, its rules from the catalog with their parameters, its style guide and its components, and asks to confirm a change that touches existing entries. Site edits the locales, the public URL, the origins that read from the browser and the style guide, makes a new site, puts this one in the trash and restores one. People gives a member another role or removes them. `/v1/admin/me` lists the trashed sites the person owns.

- [`501174a`](https://github.com/hollware/hollware/commit/501174a4b9cd7e0a5191fa587c09e39f71ff3bd7) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Cache tags are part of the contract: `entryTag`, `listTag`, `groupTag`, `SITE_TAG`, `tagsOfEntries` and `tagsOfChange` of `@hollware/core` name what a page shows, and every event's payload carries `cacheTags`, the tags the change invalidates (the entry, the list of its collection in its locale, its translations), for a site to purge.

- [`3ff1b9a`](https://github.com/hollware/hollware/commit/3ff1b9a63880a61dda9f2267a11a6f2867fef725) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The owners of a site manage its people from the admin: `POST /v1/admin/people/role` gives a member another role, and `POST /v1/admin/people/remove` takes one out of the site, whose tokens and grants of it stop working at once. A site always keeps one owner: the statement that would demote or remove its last one changes nothing (409 `conflict`). A refusal of the admin's routes now carries `not_found` for 404 and `conflict` for 409.

- [`f2f2c3d`](https://github.com/hollware/hollware/commit/f2f2c3d6ac6123d26bc1bc0d2b668b61d42afd9d) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The sites live in D1 (ADR-033). Migration `0011_structure` gives `sites` a definition, a version and `deleted_at`, and adds `site_changes`. The Worker reads the sites from D1 through a registry that polls their versions at most once a second per isolate and compiles again only a site that changed, keeping the last good copy of one that stops compiling. `createHollware()` takes no config; a 0.x config, when given, moves into D1 on the first request for the sites that have no definition, and is never read again. `HollwareConfig.sites` is optional, so `createHollware({ auth })` sets the options of the deployment alone.

- [`3f3cb16`](https://github.com/hollware/hollware/commit/3f3cb16b9779defecc14c95b6607989a3dd22367) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Six operations change the structure of the sites with no deploy (ADR-033), under the scope `schema:admin` that owners have: `get_structure` reads the definition, its version and the catalog of rules; `update_site` and `set_collection` replace the definition or one collection at the version read, answering every problem at its path, and asking to confirm a change that strands entries (a removed collection or locale) or that a new schema refuses (with counts and slugs); `create_site` makes a site with its maker as owner; `delete_site` puts a site its owner confirms in the trash, and `restore_site` brings it back. Every change is appended to `site_changes` with its actor, and the Worker serves it at once.

- [`286149b`](https://github.com/hollware/hollware/commit/286149b7106adb84b5ee02b0433dc780b50be6e3) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Webhooks need no Worker secret of their own (ADR-033): one that names none is signed with a secret Hollware makes with the new operation `make_webhook_secret`, answers once, and keeps sealed in D1 (migration `0012_site_secrets`) under `HOLLWARE_SECRET`, which `hollware deploy` now makes when the Worker has none. The admin's Site adds and removes webhooks and makes their secrets. A site in the trash keeps its rows until it is restored.

### Patch Changes

- Updated dependencies [[`501174a`](https://github.com/hollware/hollware/commit/501174a4b9cd7e0a5191fa587c09e39f71ff3bd7), [`eaa743d`](https://github.com/hollware/hollware/commit/eaa743d4f6a6cb7ec5977f73379e6f414f43403f), [`f2f2c3d`](https://github.com/hollware/hollware/commit/f2f2c3d6ac6123d26bc1bc0d2b668b61d42afd9d), [`d1ea96e`](https://github.com/hollware/hollware/commit/d1ea96e61df8a7b58e0a9b5e76b85abdddc78a7a), [`3f3cb16`](https://github.com/hollware/hollware/commit/3f3cb16b9779defecc14c95b6607989a3dd22367), [`286149b`](https://github.com/hollware/hollware/commit/286149b7106adb84b5ee02b0433dc780b50be6e3)]:
  - @hollware/core@0.8.0

## 0.7.0

### Minor Changes

- [`e43c814`](https://github.com/hollware/hollware/commit/e43c81420272ed1a0835ec681df11ac4cc259539) Thanks [@sergioazoc](https://github.com/sergioazoc)! - An entry's summary says when a scheduled entry will be published (`scheduledAt`), and `describe_site` gives the public origin of the site (`url`), so that a client can link an entry to its page.

### Patch Changes

- [`f5fdd3a`](https://github.com/hollware/hollware/commit/f5fdd3a085d56bbcc1ef1277502da7592df59bab) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The admin is dark only, with the theme of hollware.com: Nuxt UI with black as the primary color, emerald, neutral greys, Inter and JetBrains Mono, and subtle inputs. The pages the Worker renders to sign in follow it, dark whatever the device.
- Updated dependencies [[`e43c814`](https://github.com/hollware/hollware/commit/e43c81420272ed1a0835ec681df11ac4cc259539)]:
  - @hollware/core@0.7.0

## 0.6.0

### Minor Changes

- [`03df44d`](https://github.com/hollware/hollware/commit/03df44d3ff8a24a3b285645f137cd973ff9e1b9c) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The agents fit the Workers free plan: Hollware's cron wakes them every ten minutes over an `AGENTS` service binding to their `run` entrypoint, so they need no cron trigger of their own (five per account), and each run is one agent in turn, within the fifty calls a free run may make (the translator reads each locale in one listing, the reviewer takes eight reviews a run, the auditor checks a dozen entries a run and writes its report from them once a week). Their requests carry the Host of Hollware's public URL, which a service binding does not set. `hollware migrate --remote` takes a Time Travel bookmark of a database D1 cannot export, as any database with the full-text index of 0.5 is, instead of stopping.

- [`30339e0`](https://github.com/hollware/hollware/commit/30339e000c290ddbceab88161be35ef071ccbe0e) Thanks [@sergioazoc](https://github.com/sergioazoc)! - `@hollware/agents` (ADR-032): a reviewer that comments once on each pending review, a translator that drafts the missing translation of a published entry, fixes what the contracts refuse and asks for its review, and a weekly auditor that reports old but much-read entries and published entries the contracts refuse now, as a draft and optionally to a webhook such as Slack's. They run on a Worker of their own made by `createHollwareAgents`, reach Hollware over MCP with a personal token, and never publish: their client refuses every tool that publishes or decides. The new tool `request_review` asks for a review after the same checks as `publish` and never publishes, whatever the caller's scopes.

- [`059ecdf`](https://github.com/hollware/hollware/commit/059ecdffdd9d4394918dd594cf855898bf34b6d1) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Comments on reviews. The new tool `comment_review` (`content:write`) adds a comment to a pending review, in the caller's name and with the name its client gave, for the person who decides and for the author; it decides nothing. `list_reviews` answers each review with its comments, oldest first, and the admin's review screen shows them and takes new ones. Migration `0010_review_comments.sql` adds the table.

### Patch Changes

- Updated dependencies [[`30339e0`](https://github.com/hollware/hollware/commit/30339e000c290ddbceab88161be35ef071ccbe0e), [`059ecdf`](https://github.com/hollware/hollware/commit/059ecdffdd9d4394918dd594cf855898bf34b6d1)]:
  - @hollware/core@0.6.0

## 0.5.0

### Minor Changes

- [`02b2fe2`](https://github.com/hollware/hollware/commit/02b2fe2afc509bb3fb6a0f0110d1002b50953e26) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Page views without personal data (ADR-031). `POST /events` counts a view that a page of a site sends, as the site, the path and the country, in Analytics Engine through an optional `ANALYTICS` binding; never a cookie, an IP or a user agent. The new tool `content_stats` answers the most read pages of the site over the last days, each with the published entry at its path, read from the SQL API with `HOLLWARE_ANALYTICS_ACCOUNT_ID` and the secret `HOLLWARE_ANALYTICS_TOKEN`. The MCP prompt `refresh_content` walks an agent from what readers read to an updated entry. `@hollware/nuxt` sends the views when its `beacon` option names the Hollware.

- [`0712311`](https://github.com/hollware/hollware/commit/071231163dbf2bb7f5e3368466c5ed0ea5a3c20c) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Full-text search (ADR-029). The operation `search` finds the published entries that hold every word of a query, in their title, tags and text, best first, with a snippet that marks the match; it is a tool over MCP, `GET /v1/search` in the read API, and `search` over RPC and in `@hollware/client`. Migration `0008_search.sql` adds the FTS5 index, kept by triggers in the step that publishes or unpublishes, and indexes what is published already. "migracion" finds "migración".

- [`310b3ab`](https://github.com/hollware/hollware/commit/310b3abbadfe303be1c90e4c5009ef99bc08c8e1) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Semantic and hybrid search (ADR-030). `search` takes a `mode`: `fulltext`, `semantic` (by meaning, in any language) or `hybrid`, the default, which merges both; the answer says which mode ran, and a Worker without semantic search answers full text. `get_entry` takes `related: true` and answers the published entries closest to the entry by meaning, in its collection and locale. Over RPC and `@hollware/client` they are the options `mode` and `related`; over the read API, `GET /v1/search?mode=` and `GET /v1/{collection}/{locale}/{slug}?related=true`.

- [`4746735`](https://github.com/hollware/hollware/commit/474673523edeb3ef2922ba187b33a79c65bd3ab8) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The embedding model is the Worker variable `HOLLWARE_EMBEDDING_MODEL` (`@cf/baai/bge-m3` when not set); its Vectorize index must have been made for its dimensions. `HollwareEnv` takes the `VectorizeIndex` type that `wrangler types` writes for a Vectorize binding. The read API says how long a read took on the server, after the token check, in `Server-Timing: read;dur=<ms>`.

- [`b84107c`](https://github.com/hollware/hollware/commit/b84107c9d0dd0d60d9521c7314a030cf4ab0cc67) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Vectors as derived data (ADR-030). A Worker with an `AI` (Workers AI) and a `VECTORIZE` binding embeds every published entry, one vector for its summary and one for each section (`chunksOf` in `@hollware/core`), and keeps them in line with what is published: an internal `vectors` subscriber follows each publish and unpublish, and the cron trigger indexes what no event did, such as entries published before the bindings were added. Migration `0009_embeddings.sql` records which revision, model and chunker each entry's vectors come from. A Worker without those bindings is unchanged.

### Patch Changes

- [`310b3ab`](https://github.com/hollware/hollware/commit/310b3abbadfe303be1c90e4c5009ef99bc08c8e1) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The read API answers an input the caller got wrong with its code and status again: an unknown collection or locale is a 404, a limit out of range a 400. Since the move to Hono 5 they were answered as a 500, because the app's error handler took the error before the read API could.

- [`0942b0b`](https://github.com/hollware/hollware/commit/0942b0b04b400d1f133ab5b21bcd86c7a906276b) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Related entries are found again by the cron trigger: for an entry whose list is empty after ten minutes (entries indexed together miss each other while Vectorize applies their vectors), and for every entry once a day, so that an entry published later shows up among the related entries of those before it.
- Updated dependencies [[`02b2fe2`](https://github.com/hollware/hollware/commit/02b2fe2afc509bb3fb6a0f0110d1002b50953e26), [`0712311`](https://github.com/hollware/hollware/commit/071231163dbf2bb7f5e3368466c5ed0ea5a3c20c), [`310b3ab`](https://github.com/hollware/hollware/commit/310b3abbadfe303be1c90e4c5009ef99bc08c8e1), [`b84107c`](https://github.com/hollware/hollware/commit/b84107c9d0dd0d60d9521c7314a030cf4ab0cc67)]:
  - @hollware/core@0.5.0

## 0.4.0

### Minor Changes

- [`43333d3`](https://github.com/hollware/hollware/commit/43333d309843e464c47b20412d2d1d05738c835a) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A deployment serves every site of its config (ADR-027). A personal token, an OAuth grant and an RPC call each act on the one site they name; a person has one passkey and one session for the deployment, with a role per site. The consent page asks which site when the person is in several, the admin switches sites (`GET /v1/admin/me`), and `hollware init --site <key>` on a database with an owner adds the site to that owner. Migration `0006_people_across_sites.sql` drops `site_id` from passkeys, sessions and sign-in challenges.

- [`a7b5f26`](https://github.com/hollware/hollware/commit/a7b5f261d08bf8b58e3dc98ee0a7148de71d394b) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Read tokens and CORS for the read API (ADR-028). A read token (`hw_read_`) reads the published content of one site over `GET /v1/…` and is refused everywhere else; make one with `hollware token create --read` or in the admin. A site lists the origins of its pages in `cors.origins`, and those pages may read it from the browser. Migration `0007_read_tokens.sql` adds the `kind` of a token.

### Patch Changes

- [`85e70a2`](https://github.com/hollware/hollware/commit/85e70a22adc4b1e256f9a0af57b33ca4ba4a9881) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The admin takes the look of hollware.com: ink greys and a mint accent, Geist and Geist Mono bundled with it, dark by default, and Markdown colors in the editor from the same theme. The sign-in, setup and consent pages of the Worker share it.
- Updated dependencies [[`43333d3`](https://github.com/hollware/hollware/commit/43333d309843e464c47b20412d2d1d05738c835a), [`a7b5f26`](https://github.com/hollware/hollware/commit/a7b5f261d08bf8b58e3dc98ee0a7148de71d394b)]:
  - @hollware/core@0.4.0

## 0.3.0

### Minor Changes

- [`bf0d98c`](https://github.com/hollware/hollware/commit/bf0d98cf151ddb7ae4167ffa43e92cdd2a1709ae) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The admin's screens. A person signs in with their passkey (the admin is the server's own OAuth client, with PKCE, and keeps its token in memory), lists the entries of a collection, creates a draft from the fields its collection requires, edits the Markdown in CodeMirror with the verdict as diagnostics and the saved revision's HTML beside it, saves, and publishes, acknowledging warnings when asked; without `content:publish`, publishing asks for a review. The review queue shows what is live beside the revision asked for, with its verdict, and approves it or asks for changes. A review now carries `requestedByName`.

- [`56f72c6`](https://github.com/hollware/hollware/commit/56f72c6a71155a05a4ceb9a350bf3f062838bd9f) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The admin's groundwork. The server answers the operations over HTTP at `POST /v1/ops/{name}`, with the input and output of the MCP tool of that name, registers the admin as its own OAuth client (no consent page), and serves the admin at `/admin/` from the Worker's static assets, with a policy that runs only its own scripts. `@hollware/admin` builds a Vue single-page app and exports `adminAssets()`, the directory a project's Vite config serves as its `publicDir`; a project binds its static assets as `ASSETS`.

- [`aefb102`](https://github.com/hollware/hollware/commit/aefb1026078d3e860a7b6731953b8bec3a78d4ab) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Tokens and people in the admin. An owner signed in to the admin makes, lists and revokes personal tokens (a token is shown once, and gets no scope its maker lacks), and invites editors and authors with a link to `/setup`. These are routes of the admin's own (`/v1/admin/…`), not operations: they take only an access token of the admin's client with `schema:admin`, so neither a personal token nor another MCP client can make a token.

- [`2580f76`](https://github.com/hollware/hollware/commit/2580f7658f82a534624b7343b1f1d55e121f6b19) Thanks [@sergioazoc](https://github.com/sergioazoc)! - `get_entry` takes `published: true` to read the revision that is live instead of the latest one, as a reviewer compares them.

- [`736214b`](https://github.com/hollware/hollware/commit/736214b5f8656113a5f52f46e96c328da4ab819e) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Passkeys, invitations and sessions for the admin. The server adds migration `0004_identity.sql` and the `/setup` and `/signin` pages; a person's role in a site is their row of the new `members` table, `owner`, `editor` or `author` (every person with a token becomes a member of its site, a `reviewer` of v0.2 an `author`). `hollware init` prints the owner's link to set up a passkey, and `hollware invite --role editor|author` invites a person.

- [`30479f5`](https://github.com/hollware/hollware/commit/30479f5402b29b934ce5bc06c8f3d2af3cf1bfdf) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The OAuth server of ADR-026. `/mcp` and `/v1` are OAuth protected resources: a request without a token gets a 401 whose challenge names their metadata, and MCP clients that speak OAuth, such as claude.ai, sign in through `/authorize`, where a person with a passkey allows them the scopes their role has. Personal tokens work as before. A project needs a KV namespace bound as `OAUTH_KV` and the `global_fetch_strictly_public` compatibility flag; `auth: { dynamicClientRegistration: true }` in the config lets clients register themselves.

- [`777ce1d`](https://github.com/hollware/hollware/commit/777ce1dee559ffa13ad576ab2f60d485097f104b) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Reviews. `publish` needs `content:write`: without `content:publish` it runs the same checks and answers `pending_review`, and a person who may publish answers with the new operations `approve_review`, which publishes the revision in their name, or `request_changes`, with a note; `list_reviews` lists them. A new revision of the entry cancels its pending review. The server adds migration `0005_reviews.sql`. `hollware import --publish` reports `pending_review` for an entry that a token without `content:publish` asked to publish. A schedule made through OAuth now publishes as that client.

### Patch Changes

- [`88b921f`](https://github.com/hollware/hollware/commit/88b921fac97aca124cadbe171d4d422d4e318e93) Thanks [@sergioazoc](https://github.com/sergioazoc)! - `hollware import --publish` publishes what it imported as one group (in groups of 100), so entries that link to each other are published together; an entry that stops the group is reported and left out, and the rest is published. The CLI also reads wrangler's JSON past a warning printed before it, which made `hollware init` lose its token. `publish` with a group names the entry that has a warning to acknowledge in `failedEntry`.
- Updated dependencies [[`bf0d98c`](https://github.com/hollware/hollware/commit/bf0d98cf151ddb7ae4167ffa43e92cdd2a1709ae), [`2580f76`](https://github.com/hollware/hollware/commit/2580f7658f82a534624b7343b1f1d55e121f6b19), [`30479f5`](https://github.com/hollware/hollware/commit/30479f5402b29b934ce5bc06c8f3d2af3cf1bfdf), [`777ce1d`](https://github.com/hollware/hollware/commit/777ce1dee559ffa13ad576ab2f60d485097f104b)]:
  - @hollware/core@0.3.0

## 0.2.0

### Minor Changes

- [`705aabf`](https://github.com/hollware/hollware/commit/705aabf95c83ef7ddb2b2c0b2b633a25f03dabe4) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Publication events (ADR-025): a publish or an unpublish writes its event to an outbox in the same batch, and the Worker delivers it from a Queue (its new `queue` handler) or, without one, from the cron trigger: to the webhooks of the site, signed with HMAC-SHA256 (`signWebhook` and `verifyWebhook` in `@hollware/core`), and to IndexNow. Each subscriber gets each event once; a failure is retried and ends in the dead-letter queue. A site declares its `url` and its `events` in the config.

- [`24faa62`](https://github.com/hollware/hollware/commit/24faa62acd99f961885adb76fe05813df1d9adcb) Thanks [@sergioazoc](https://github.com/sergioazoc)! - `publish` takes a `group` of other entries to publish in the same step, all or none (ADR-024): links between the entries of the group count as published, so entries that link to each other can be published together, and a refusal names the entry that stopped the group in `failedEntry`.

- [`ac2937b`](https://github.com/hollware/hollware/commit/ac2937bafc0cf5b6f1020af96d8873e3c32d9a00) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The HTTP read API at `/v1`: the four read methods of the RPC binding, over published content, for a personal token with `content:read`, with ETags (304) and an OpenAPI 3.1 document at `/v1/openapi.json`. `@hollware/client` reads a Hollware over a service binding or over HTTP with one interface, and re-exports `verifyWebhook`.

- [`58b2bb1`](https://github.com/hollware/hollware/commit/58b2bb135ab37f295c4043331f914ba2d3bd78f8) Thanks [@sergioazoc](https://github.com/sergioazoc)! - `publish` takes `publishAt` to schedule a publication (ADR-025): the entry is checked now and waits as `scheduled`, and the Worker's new `scheduled` handler, run by a cron trigger every minute, publishes it at its time in the name of who scheduled it. A change after scheduling, or `unpublish`, takes it back to a draft. The migration `0003_events_and_schedules.sql` adds the tables of schedules and of the outbox of v0.2.

### Patch Changes

- Updated dependencies [[`705aabf`](https://github.com/hollware/hollware/commit/705aabf95c83ef7ddb2b2c0b2b633a25f03dabe4), [`24faa62`](https://github.com/hollware/hollware/commit/24faa62acd99f961885adb76fe05813df1d9adcb), [`58b2bb1`](https://github.com/hollware/hollware/commit/58b2bb135ab37f295c4043331f914ba2d3bd78f8)]:
  - @hollware/core@0.2.0

## 0.1.0

### Minor Changes

- [`1660281`](https://github.com/hollware/hollware/commit/1660281f9ea7e048060c4f65801caff9f92ba29a) Thanks [@sergioazoc](https://github.com/sergioazoc)! - v0.1, the core: an agent writes and publishes Markdown over MCP, contracts check every write, and a site reads what is published over a service binding.

  - `@hollware/core`: the config (`defineConfig`, `defineCollection`, `defineComponent`), the contracts and their opt-in factories, the nine operation specs and the Markdown pipeline on Comark.
  - `@hollware/server`: `createHollware(config)`, the Worker with the MCP endpoint behind personal tokens and the read-only `Hollware` entrypoint for sites, and the D1 migrations.
  - `hollware`: the CLI's `init`, `migrate`, `token` and `import`.

### Patch Changes

- Updated dependencies [[`1660281`](https://github.com/hollware/hollware/commit/1660281f9ea7e048060c4f65801caff9f92ba29a)]:
  - @hollware/core@0.1.0

## 0.0.2

### Patch Changes

- [`d834e1e`](https://github.com/hollware/hollware/commit/d834e1e6cff6d04795842f0d847af64067f104af) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Releases now ship from the `release` branch and are published directly from CI with provenance, after the maintainer approves the `npm` environment (ADR-015). The packages themselves are unchanged.

## 0.0.1

### Patch Changes

- [`622b862`](https://github.com/hollware/hollware/commit/622b8621227246aec6425471de2b257516cea3e0) Thanks [@sergioazoc](https://github.com/sergioazoc)! - First release: the package skeletons. Nothing is usable yet; this release proves the publishing pipeline end to end.
