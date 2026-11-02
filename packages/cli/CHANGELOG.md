# hollware

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

### Patch Changes

- Updated dependencies [[`ac0553d`](https://github.com/hollware/hollware/commit/ac0553d353d78ecba792d2bbf3731c87a69b52d0)]:
  - @hollware/core@1.3.0

## 1.2.0

### Minor Changes

- [#88](https://github.com/hollware/hollware/pull/88) [`0cfa409`](https://github.com/hollware/hollware/commit/0cfa409f4f2c3f21326f281241e7d7889f018e89) Thanks [@sergioazoc](https://github.com/sergioazoc)! - An agent member can hold a lasting personal token, for an agent that hears no events, such as an MCP gateway: `hollware token create --member <usr_…>` and `member` of `POST /v1/admin/tokens`, for an owner only and never over MCP. Its scopes are an author's at most (content:publish and schema:admin are refused with their fix), what it writes is the agent's, and its publish asks for a review. A token expires when asked like Cloudflare's: in days, at a date (`--expires-at`, `expiresAt`) or never. Removing an agent revokes its tokens with its grants; `hollware token list` and `GET /v1/admin/tokens` say whose each token is.

- [#88](https://github.com/hollware/hollware/pull/88) [`0cfa409`](https://github.com/hollware/hollware/commit/0cfa409f4f2c3f21326f281241e7d7889f018e89) Thanks [@sergioazoc](https://github.com/sergioazoc)! - `hollware import --from nuxt-content --public-dir <dir>` uploads the images the pages show by path, `/blog/x.webp` from that folder and `./x.webp` from the folder of the page, in the Markdown or as a value of the frontmatter, once each however many pages show them, and writes `asset:ast_…` in their place. A missing image, or one over 10 MB, stops the import before anything is sent, with how to fix it.

### Patch Changes

- [#88](https://github.com/hollware/hollware/pull/88) [`0cfa409`](https://github.com/hollware/hollware/commit/0cfa409f4f2c3f21326f281241e7d7889f018e89) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The CLI trusts the certificates of the system besides Node's, so `import`, `export`, `promote` and every command with `--url` work behind a proxy that inspects TLS, such as Cloudflare WARP or Gateway, instead of failing with `SELF_SIGNED_CERT_IN_CHAIN`.
- Updated dependencies []:
  - @hollware/core@1.2.0

## 1.1.0

### Minor Changes

- [#85](https://github.com/hollware/hollware/pull/85) [`5934bf8`](https://github.com/hollware/hollware/commit/5934bf84b1202d8b558c185e71e41312dabcc400) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Add `hollware agent add|list|remove` to manage the agent members of a site and revoke their grants.

- [#85](https://github.com/hollware/hollware/pull/85) [`5934bf8`](https://github.com/hollware/hollware/commit/5934bf84b1202d8b558c185e71e41312dabcc400) Thanks [@sergioazoc](https://github.com/sergioazoc)! - People sign in through Google, Microsoft, GitHub, any OpenID Connect provider or Cloudflare Access, with passkeys optional. `auth: { providers: [...], passkeys }` in the config lists the providers, each client secret by the name of its Worker secret; a Microsoft tenant must be one directory (`common`, `organizations` and `consumers` are refused). An account signs in by its provider and subject; its verified email links it to the person who has it, accepts an invitation sent to that address, or makes the person a member of a site whose new `access.autoProvision` lets in that address or its domain. An unverified email links nothing. The account page lists the accounts of providers and adds passkeys, and the last passkey goes when an account of a provider signs the person in. An invitation takes an address (`email` of `POST /v1/admin/invitations`, `hollware invite --email`), `hollware init --owner-email` gives the owner theirs, `hollware doctor` says which secret of a provider the local project lacks, and `npm create hollware` takes `--auth <kind>` with its credentials.

- [#85](https://github.com/hollware/hollware/pull/85) [`5934bf8`](https://github.com/hollware/hollware/commit/5934bf84b1202d8b558c185e71e41312dabcc400) Thanks [@sergioazoc](https://github.com/sergioazoc)! - `hollware import --from notion --root <page> --collection <name>` imports a public Notion page and its subpages as drafts of one collection. Each page is an entry, with its title in `title`, the title of its top page below the root in `section` and its place among its siblings in `order` (`--section-field`, `--order-field`); slugs come from the titles in ASCII, numbered when two match, unless `--slug-map` names them. Blocks become Markdown: headings, nested lists, tasks, quotes, code, GFM tables, callouts as `::callout` (or GitHub alerts by their color with `--callouts alerts`), toggles as `::details` (or flat with `--toggles flatten`), videos and embeds as `::embed` when the collection declares it. Images and custom emoji are downloaded at once and uploaded as assets, with the caption as their alt or the title of the page and their place in it. Links to imported pages point at the route of the collection. It checks first that the collection declares the components the pages use; `--id-map` writes the page id of each entry and `--report` what each page lost on the way.

- [#85](https://github.com/hollware/hollware/pull/85) [`5934bf8`](https://github.com/hollware/hollware/commit/5934bf84b1202d8b558c185e71e41312dabcc400) Thanks [@sergioazoc](https://github.com/sergioazoc)! - `list_entries` takes `changedSince`, an ISO 8601 time: only the entries changed at or after it, in the same order. `hollware promote --from <url> --to <url>` copies what one Hollware publishes to another (staging to production) as drafts there, in one grouped review that also unpublishes what the source no longer publishes; `--publish` publishes instead. A state file (`.hollware/promote-<from>-<to>.json`) keeps where it stopped, so the next run reads only what changed; an entry changed in the destination since the last promotion is still promoted, with a comment on it in the review that shows the difference. The images the entries show are copied when the destination lacks them. `--dry-run` prints the plan and writes nothing.

### Patch Changes

- Updated dependencies [[`b4d307a`](https://github.com/hollware/hollware/commit/b4d307ace92e54fe19be97b3ce40e8184fe3ccbf), [`5934bf8`](https://github.com/hollware/hollware/commit/5934bf84b1202d8b558c185e71e41312dabcc400), [`5934bf8`](https://github.com/hollware/hollware/commit/5934bf84b1202d8b558c185e71e41312dabcc400), [`5934bf8`](https://github.com/hollware/hollware/commit/5934bf84b1202d8b558c185e71e41312dabcc400), [`5934bf8`](https://github.com/hollware/hollware/commit/5934bf84b1202d8b558c185e71e41312dabcc400), [`5934bf8`](https://github.com/hollware/hollware/commit/5934bf84b1202d8b558c185e71e41312dabcc400), [`5934bf8`](https://github.com/hollware/hollware/commit/5934bf84b1202d8b558c185e71e41312dabcc400)]:
  - @hollware/core@1.1.0

## 1.0.0

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

- [`84d96fd`](https://github.com/hollware/hollware/commit/84d96fdbfe0527c5aae28b52d2d5045c8ec69354) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Setting Hollware up from an agent: `hollware init` and `hollware token create` take `--token-file <path>` (mode 0600, refused when the file exists unless `--force`) and print its path instead of the token, and `create-hollware` passes it through. `--json` on `create-hollware`, `init`, `token create`, `invite` and `doctor` prints one JSON object and nothing else. `hollware dev` starts the project's local server, waits for `/health` and stays in the foreground until SIGINT or SIGTERM (`--detach` and `--stop` run it in the background), and `hollware mcp-config` prints the `claude mcp add` line or the JSON block of Claude Code, Cursor and VS Code, which name `HOLLWARE_TOKEN` and never the token. The output of `init` and `create-hollware` says the passkey link is for the admin and an agent starts with the token alone. `GET /v1` answers 200 with the URLs of the OpenAPI document and of `/v1/site`, with no token. `update_site` and `set_collection` answer `conflict` on a stale version with a `message` and a `fix` that say to call `get_structure` again.

- [`0647944`](https://github.com/hollware/hollware/commit/06479447b92e584277b0be96162888039e198adb) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Hollware no longer counts page views: a site connects the analytics it already has, and `content_stats` reads them. Connect Cloudflare Web Analytics, PostHog, Plausible or GA4 in the admin (Site, Analytics), with `hollware analytics connect <provider> --credential-file <file>`, or with the new tool `connect_analytics`; the read-only key is tested before it is kept, sealed under `HOLLWARE_SECRET`, and never shown again (`get_analytics`, `disconnect_analytics`).

  To upgrade: remove `beacon` from `hollware` in `nuxt.config`; remove the `analytics_engine_datasets` binding `ANALYTICS` and the variables `HOLLWARE_ANALYTICS_ACCOUNT_ID` and `HOLLWARE_ANALYTICS_DATASET` from the Worker's `wrangler.jsonc`, and delete its secret `HOLLWARE_ANALYTICS_TOKEN` (`wrangler secret delete HOLLWARE_ANALYTICS_TOKEN`); then connect the site's analytics. `POST /events` is gone, and `@hollware/server` no longer exports `AnalyticsWriter` and `PageView`.

- [`f31b9fb`](https://github.com/hollware/hollware/commit/f31b9fbbd99f08ab8d094742813f62dc32834d44) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Fields Hollware fills itself: a collection's `automaticFields` names them and how, `firstPublished` (the date an entry first went out; a date written wins), `lastModified` (the date of a change published after that), `readingTime` (minutes at 200 words a minute) and `wordCount`. Nobody writes them: they are never required, `describe_site` marks them `readOnly`, and the admin's entry form leaves them out. A site reads them filled (RPC, the read API, `createHollware()`), `get_entry` answers their values as `automatic`, and `hollware export --published` writes them into the frontmatter; the Markdown stored stays what was written. The admin chooses them per field on the page of a collection, and a new blog fills its `date`.

- [#66](https://github.com/hollware/hollware/pull/66) [`b29fe9d`](https://github.com/hollware/hollware/commit/b29fe9d074c7b83b77014c59c41a4037d044bed4) Thanks [@sergioazoc](https://github.com/sergioazoc)! - `hollware backup get` writes a backup as an export would: the entries and site.json, `redirects.json` with the 301s of the entries that moved, and the images of the site in `_assets`, which `hollware import` uploads again. An image whose original the deployment no longer has is named and left out. A new project binds the R2 bucket `BACKUPS`, `<name>-backups`, so its backups live apart from its images, and `hollware doctor` says whether a project has one.

- [`0235865`](https://github.com/hollware/hollware/commit/0235865719899057dc58f7888208c16f1e990eda) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Daily backups of each site to R2: after 03:00 UTC the cron writes `backups/<site>/<date>.json` to the bucket `MEDIA`, with the definition of the site and every entry, its latest Markdown and the published one, and keeps 30 days. `list_backups` (MCP and the admin's Site page) lists them, `GET /v1/backups/<date>` downloads one with `schema:admin`, and `hollware backup list` and `hollware backup get <date> <dir> [--published]` turn one back into the files `hollware import` reads.

- [#63](https://github.com/hollware/hollware/pull/63) [`44149e0`](https://github.com/hollware/hollware/commit/44149e0d5a2921754521b7be0797306cf2d5cd55) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A new project consumes the dead-letter queue of its events, `<name>-events-dlq`, so Hollware keeps the events it gave up on for the admin to send again. `hollware doctor` says when the consumer of the events has no dead-letter queue, or when nothing consumes it. A project made before adds `{ "queue": "<name>-events-dlq" }` to `queues.consumers` in its wrangler.jsonc.

- [`055d933`](https://github.com/hollware/hollware/commit/055d9332daf8cd27117e0a0e5868ffb2c735b1c1) Thanks [@sergioazoc](https://github.com/sergioazoc)! - `hollware deploy --url https://cms.example.com` now serves the Worker there: a public URL on a domain of your own (not workers.dev) gets a `custom_domain` route in `wrangler.jsonc` before the first deploy, so Cloudflare makes its DNS record and its certificate, and the Worker is deployed once. A config with routes of its own is left as it is, and deploy says which route is missing.

- [#69](https://github.com/hollware/hollware/pull/69) [`b14218b`](https://github.com/hollware/hollware/commit/b14218bbb905f2d8542af396fb83aeeaaa2f437e) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The editor of the admin writes far fewer revisions. It saves 8 seconds after the last change, and at least once a minute while the typing goes on, instead of a second and a half after each pause; it also saves when the tab is hidden, the page is left or another entry opens, such as a translation. Until then the browser keeps what was typed, so a crash loses nothing: the next time the entry opens, the changes come back with a notice, to keep or discard, and changes kept for an older version are offered rather than applied. Home shows an owner how big the database of the deployment is, against the 500 MB of a D1 database on the Free plan (`GET /v1/admin/database`), and `hollware doctor --remote` says it too.

- [`f16f745`](https://github.com/hollware/hollware/commit/f16f7452e24037ab564f4442839c26b463019d58) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Images. `upload_asset` takes a JPEG, PNG, WebP, AVIF, GIF or SVG, judged by its bytes, and converts it once by the site's new `media` setting (WebP at 85 by default, PNG lossless, GIF with its frames, nothing wider than 2400 px; or AVIF, or the file as it came). An SVG is kept as it is, and refused when anything in it can run. R2 keeps the image and its original; content shows it as `img: asset:ast_…` or `![alt](asset:ast_…)`, which reads of the published site and HTML turn into the URL where the Worker serves it, cached for a year. `list_assets` and `get_asset` read them; the admin has an Images page; `hollware export --assets <dir> --assets-url <path>` writes the images for a site that serves them itself, and without it keeps the originals in `_assets/`, which `hollware import` uploads again under the same ids. A new project binds an R2 bucket (`MEDIA`), which the first deploy creates, and the Images binding (`IMAGES`); `hollware doctor` says when either is missing. Migration 0017 adds the `assets` table.

- [`29e7ecc`](https://github.com/hollware/hollware/commit/29e7ecc893fcb5f145e53b99a7f158b518e423f3) Thanks [@sergioazoc](https://github.com/sergioazoc)! - `media.keepOriginals` (true by default): a site that sets it to `false` keeps only the file it serves and its copies, not the file as it was uploaded, which takes less storage in R2. The download of an original then gives the file served, and `hollware export` names each image by what its bytes are. The admin sets it under Site → Images.

- [`0150c9f`](https://github.com/hollware/hollware/commit/0150c9f4d1be3be699d6987946acd3bc5041e619) Thanks [@sergioazoc](https://github.com/sergioazoc)! - An entry can change its slug: `move_entry` (MCP) and "Change URL" in the admin give it another path and keep its revisions and translations. An entry that was ever published keeps its old slug as a redirect, which `list_redirects`, the RPC method `listRedirects`, `GET /v1/redirects`, `createHollware().redirectFor()` and the admin's Site page answer, so a site serves the old path with a 301; `hollware export --published` writes them to `redirects.json`. Moving a published entry takes content:publish and purges its pages.

- [#52](https://github.com/hollware/hollware/pull/52) [`e6c6fb7`](https://github.com/hollware/hollware/commit/e6c6fb74ce757f74d215564a5174133e2879b1d3) Thanks [@sergioazoc](https://github.com/sergioazoc)! - An invitation that waits can be revoked, and its link stops working at once: from People in the admin (`POST /v1/admin/invitations/:id/revoke`), or with `hollware invite revoke <id>` after `hollware invite list`. The activity log records it as `invitation.revoke`.

- [#40](https://github.com/hollware/hollware/pull/40) [`9305e2d`](https://github.com/hollware/hollware/commit/9305e2dc7bb336c97523a05ea79190c2f733b5c6) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A personal token expires after 90 days unless its maker asks for other days or for none: `hollware token create` takes `--no-expiry`, the admin's Tokens page has a "Never expires" box, and `POST /v1/admin/tokens` takes `expiresInDays: null`. A read token still never expires unless it is given days.

### Patch Changes

- [`8d6edca`](https://github.com/hollware/hollware/commit/8d6edcadbf06f1c4b85c5fe9739fb09a2a1c1f85) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The same image uploaded to two sites of one deployment is two assets, each with an id of its site and its bytes; with rc.2 the second upload failed with a server error and left its files in R2. Assets uploaded before keep their ids and are found by their bytes. `hollware import` of an export into another site writes the `asset:` references with the ids that site gives.

- [#78](https://github.com/hollware/hollware/pull/78) [`c238a55`](https://github.com/hollware/hollware/commit/c238a5583cdc8eaa63733586951208b824f158cc) Thanks [@sergioazoc](https://github.com/sergioazoc)! - `hollware deploy` creates the dead-letter queue of the events when it does not exist yet: wrangler creates the other queues, the database, the KV namespace and the buckets of a new project by itself, but stopped the first deploy at a dead-letter queue it does not make. `npm create hollware .` no longer says `cd .`, and the README of `create-hollware` lists every option of `--help`.

- [`28f0198`](https://github.com/hollware/hollware/commit/28f0198a417044d1d67584dcccaa9977bb97f657) Thanks [@sergioazoc](https://github.com/sergioazoc)! - `hollware deploy` says why wrangler failed in full, over every line of a wrapped `[ERROR]`, and suggests `wrangler login` only when wrangler's failure is about logging in. Its closing line no longer says the deploy wrote ids into `wrangler.jsonc`: wrangler now binds what it creates to the deployed Worker by name.

- [`20f1fe3`](https://github.com/hollware/hollware/commit/20f1fe3d065d6b8484f1264ea23c41dcf061005b) Thanks [@sergioazoc](https://github.com/sergioazoc)! - `hollware deploy` of a project deployed before applies the new migrations to the remote database first, while its Worker still serves, and then deploys the new Worker, which so never serves a database without its tables. The starter's README and AGENTS.md say how to upgrade: one version for every package, a project of the new release to compare with, then deploy.

- [`d6ef107`](https://github.com/hollware/hollware/commit/d6ef10750cbd045b20225eb289b3b76859cba61a) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A project keeps working at localhost after `hollware deploy`: the starter's `vite.config.ts` sets `HOLLWARE_PUBLIC_URL` to `http://localhost:5199` in development (`vp dev`), whatever public URL the deploy wrote into `wrangler.jsonc`, and `hollware dev` waits for the server there. `hollware deploy` writes `worker-configuration.d.ts` again whenever it rewrites `wrangler.jsonc`, so `wrangler types --check` keeps passing.

- [`9e07b1e`](https://github.com/hollware/hollware/commit/9e07b1e893afc0c808ad2cfaff8c5edae91dca3f) Thanks [@sergioazoc](https://github.com/sergioazoc)! - `hollware doctor` also checks the cron trigger, the events queue (its producer and its consumer) and the rate limit `HOLLWARE_RATE_LIMIT`, which a project needs for scheduled publications, webhooks and IndexNow, and limits on sign-in.

- [#24](https://github.com/hollware/hollware/pull/24) [`73110f5`](https://github.com/hollware/hollware/commit/73110f5317dd9da454ad45a84baccedd1403767a) Thanks [@sergioazoc](https://github.com/sergioazoc)! - An upload that opens on an XML declaration and many comments no longer stalls the check of its format, and a URL or a path with thousands of trailing slashes no longer takes seconds to trim: both are read in linear time.

- [#24](https://github.com/hollware/hollware/pull/24) [`73110f5`](https://github.com/hollware/hollware/commit/73110f5317dd9da454ad45a84baccedd1403767a) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The packages carry no comments but the TSDoc of their public API, and the help of the CLI and the descriptions of the MCP tools no longer cite decision records the repository does not have. The starter's `AGENTS.md` now says what each setting of its `wrangler.jsonc` is for.

- [`1310c51`](https://github.com/hollware/hollware/commit/1310c515a6ee07656aac57f3d5cd0fa0e824dd83) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The READMEs on npm say what each package is and how it is used, instead of "pre-alpha, not usable yet"; the CLI's lists `dev` and `mcp-config`.

- [`84d96fd`](https://github.com/hollware/hollware/commit/84d96fdbfe0527c5aae28b52d2d5045c8ec69354) Thanks [@sergioazoc](https://github.com/sergioazoc)! - What a rehearsal of moving a real site into Hollware turned up. A database that lacks the migrations of its release answers a 503 `not_migrated` that names the command to run, instead of a bare 500. `hollware import` shows an unchanged entry with the verdict of this run, not the one kept since it was written, which a change of the site's definition can have made stale. `npm create hollware` prints how to connect an agent once (init's block, which names `HOLLWARE_TOKEN`, never the token), and starts the project with `hollware dev`.
- Updated dependencies [[`84d96fd`](https://github.com/hollware/hollware/commit/84d96fdbfe0527c5aae28b52d2d5045c8ec69354), [`0647944`](https://github.com/hollware/hollware/commit/06479447b92e584277b0be96162888039e198adb), [`901959b`](https://github.com/hollware/hollware/commit/901959bff6b8de29b8db6206a47c5b2e03efef55), [`8d6edca`](https://github.com/hollware/hollware/commit/8d6edcadbf06f1c4b85c5fe9739fb09a2a1c1f85), [`f31b9fb`](https://github.com/hollware/hollware/commit/f31b9fbbd99f08ab8d094742813f62dc32834d44), [`b29fe9d`](https://github.com/hollware/hollware/commit/b29fe9d074c7b83b77014c59c41a4037d044bed4), [`83f582a`](https://github.com/hollware/hollware/commit/83f582ab6e2483fe94ba7d3953b3b968835443c7), [`4fd2a54`](https://github.com/hollware/hollware/commit/4fd2a54a0426ee128403febc89d45e127c7fa5ac), [`77b98b8`](https://github.com/hollware/hollware/commit/77b98b8e91e34b6b11c70adb16ed5fe35efda837), [`1530a5f`](https://github.com/hollware/hollware/commit/1530a5f2a49cc6e47682e123e35a8d45cef4553b), [`0235865`](https://github.com/hollware/hollware/commit/0235865719899057dc58f7888208c16f1e990eda), [`0075a00`](https://github.com/hollware/hollware/commit/0075a0089e21f378c2295b4f26f5626e866bad67), [`fe98663`](https://github.com/hollware/hollware/commit/fe98663f342ff4f69ea6e579c9dc28670ded00d7), [`44149e0`](https://github.com/hollware/hollware/commit/44149e0d5a2921754521b7be0797306cf2d5cd55), [`18aac23`](https://github.com/hollware/hollware/commit/18aac23e3ef8309fb802437d5166094cb4a7eb03), [`4d9b15e`](https://github.com/hollware/hollware/commit/4d9b15ea2d854cbec6f4390d14317b705d56cc45), [`88965e8`](https://github.com/hollware/hollware/commit/88965e8b3431656e939056cc8cfb7ec0b4206072), [`f16f745`](https://github.com/hollware/hollware/commit/f16f7452e24037ab564f4442839c26b463019d58), [`29e7ecc`](https://github.com/hollware/hollware/commit/29e7ecc893fcb5f145e53b99a7f158b518e423f3), [`73110f5`](https://github.com/hollware/hollware/commit/73110f5317dd9da454ad45a84baccedd1403767a), [`0150c9f`](https://github.com/hollware/hollware/commit/0150c9f4d1be3be699d6987946acd3bc5041e619), [`73110f5`](https://github.com/hollware/hollware/commit/73110f5317dd9da454ad45a84baccedd1403767a), [`b47f74a`](https://github.com/hollware/hollware/commit/b47f74aefaf518df6cc95b8cf9f33388b488cd22), [`42df9fb`](https://github.com/hollware/hollware/commit/42df9fb82477bec5b80385bd1b853f68d89092db), [`3b98d87`](https://github.com/hollware/hollware/commit/3b98d8701f82646554a9355e7523addb2ed5b09c), [`9e93f74`](https://github.com/hollware/hollware/commit/9e93f740a5d3c5fd68d16ea43b2ec79853ab1ee6), [`1310c51`](https://github.com/hollware/hollware/commit/1310c515a6ee07656aac57f3d5cd0fa0e824dd83), [`cebe6bb`](https://github.com/hollware/hollware/commit/cebe6bb99e776214d595f6223744b3fa670dd8ea), [`d0f43a4`](https://github.com/hollware/hollware/commit/d0f43a433a29618c763a8fde6662f777b4bb00e2), [`5e4bee1`](https://github.com/hollware/hollware/commit/5e4bee1adf9d2e119b90ca4ae3c5e07d8055c260), [`7f6ca95`](https://github.com/hollware/hollware/commit/7f6ca9528c258518065dedb22b3703910ec5e985), [`1ab4a4c`](https://github.com/hollware/hollware/commit/1ab4a4c26b492dedc77b1e1289ab883b4a0124d3), [`e6c6fb7`](https://github.com/hollware/hollware/commit/e6c6fb74ce757f74d215564a5174133e2879b1d3), [`4c03dd3`](https://github.com/hollware/hollware/commit/4c03dd3f8fb3a366f095b3f8b84c4704819b714f), [`102ea18`](https://github.com/hollware/hollware/commit/102ea18cbc076fbc47f1128b0f71e98e4dd071d8), [`ca4225d`](https://github.com/hollware/hollware/commit/ca4225d3d0a04eb59323c89156ed167ec1b4b905), [`bce8006`](https://github.com/hollware/hollware/commit/bce80069a466f41ee929f33bd11c302b92e9e3a2), [`2a302dc`](https://github.com/hollware/hollware/commit/2a302dcbe1fb41c10757352312b21861aa60f6d5), [`2244160`](https://github.com/hollware/hollware/commit/2244160693dc307127bced011214b59080832dba), [`865c6c7`](https://github.com/hollware/hollware/commit/865c6c75ebd68f3c30993a0f9f346c9188f7843f), [`51fc47c`](https://github.com/hollware/hollware/commit/51fc47c170d39ce69350c800d287309ba3ebb92e)]:
  - @hollware/core@1.0.0

## 1.0.0-rc.11

### Patch Changes

- [#78](https://github.com/hollware/hollware/pull/78) [`c238a55`](https://github.com/hollware/hollware/commit/c238a5583cdc8eaa63733586951208b824f158cc) Thanks [@sergioazoc](https://github.com/sergioazoc)! - `hollware deploy` creates the dead-letter queue of the events when it does not exist yet: wrangler creates the other queues, the database, the KV namespace and the buckets of a new project by itself, but stopped the first deploy at a dead-letter queue it does not make. `npm create hollware .` no longer says `cd .`, and the README of `create-hollware` lists every option of `--help`.
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

- [#66](https://github.com/hollware/hollware/pull/66) [`b29fe9d`](https://github.com/hollware/hollware/commit/b29fe9d074c7b83b77014c59c41a4037d044bed4) Thanks [@sergioazoc](https://github.com/sergioazoc)! - `hollware backup get` writes a backup as an export would: the entries and site.json, `redirects.json` with the 301s of the entries that moved, and the images of the site in `_assets`, which `hollware import` uploads again. An image whose original the deployment no longer has is named and left out. A new project binds the R2 bucket `BACKUPS`, `<name>-backups`, so its backups live apart from its images, and `hollware doctor` says whether a project has one.

- [#63](https://github.com/hollware/hollware/pull/63) [`44149e0`](https://github.com/hollware/hollware/commit/44149e0d5a2921754521b7be0797306cf2d5cd55) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A new project consumes the dead-letter queue of its events, `<name>-events-dlq`, so Hollware keeps the events it gave up on for the admin to send again. `hollware doctor` says when the consumer of the events has no dead-letter queue, or when nothing consumes it. A project made before adds `{ "queue": "<name>-events-dlq" }` to `queues.consumers` in its wrangler.jsonc.

- [#69](https://github.com/hollware/hollware/pull/69) [`b14218b`](https://github.com/hollware/hollware/commit/b14218bbb905f2d8542af396fb83aeeaaa2f437e) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The editor of the admin writes far fewer revisions. It saves 8 seconds after the last change, and at least once a minute while the typing goes on, instead of a second and a half after each pause; it also saves when the tab is hidden, the page is left or another entry opens, such as a translation. Until then the browser keeps what was typed, so a crash loses nothing: the next time the entry opens, the changes come back with a notice, to keep or discard, and changes kept for an older version are offered rather than applied. Home shows an owner how big the database of the deployment is, against the 500 MB of a D1 database on the Free plan (`GET /v1/admin/database`), and `hollware doctor --remote` says it too.

- [#52](https://github.com/hollware/hollware/pull/52) [`e6c6fb7`](https://github.com/hollware/hollware/commit/e6c6fb74ce757f74d215564a5174133e2879b1d3) Thanks [@sergioazoc](https://github.com/sergioazoc)! - An invitation that waits can be revoked, and its link stops working at once: from People in the admin (`POST /v1/admin/invitations/:id/revoke`), or with `hollware invite revoke <id>` after `hollware invite list`. The activity log records it as `invitation.revoke`.

- [#40](https://github.com/hollware/hollware/pull/40) [`9305e2d`](https://github.com/hollware/hollware/commit/9305e2dc7bb336c97523a05ea79190c2f733b5c6) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A personal token expires after 90 days unless its maker asks for other days or for none: `hollware token create` takes `--no-expiry`, the admin's Tokens page has a "Never expires" box, and `POST /v1/admin/tokens` takes `expiresInDays: null`. A read token still never expires unless it is given days.

### Patch Changes

- [#24](https://github.com/hollware/hollware/pull/24) [`73110f5`](https://github.com/hollware/hollware/commit/73110f5317dd9da454ad45a84baccedd1403767a) Thanks [@sergioazoc](https://github.com/sergioazoc)! - An upload that opens on an XML declaration and many comments no longer stalls the check of its format, and a URL or a path with thousands of trailing slashes no longer takes seconds to trim: both are read in linear time.

- [#24](https://github.com/hollware/hollware/pull/24) [`73110f5`](https://github.com/hollware/hollware/commit/73110f5317dd9da454ad45a84baccedd1403767a) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The packages carry no comments but the TSDoc of their public API, and the help of the CLI and the descriptions of the MCP tools no longer cite decision records the repository does not have. The starter's `AGENTS.md` now says what each setting of its `wrangler.jsonc` is for.
- Updated dependencies [[`901959b`](https://github.com/hollware/hollware/commit/901959bff6b8de29b8db6206a47c5b2e03efef55), [`b29fe9d`](https://github.com/hollware/hollware/commit/b29fe9d074c7b83b77014c59c41a4037d044bed4), [`4fd2a54`](https://github.com/hollware/hollware/commit/4fd2a54a0426ee128403febc89d45e127c7fa5ac), [`77b98b8`](https://github.com/hollware/hollware/commit/77b98b8e91e34b6b11c70adb16ed5fe35efda837), [`fe98663`](https://github.com/hollware/hollware/commit/fe98663f342ff4f69ea6e579c9dc28670ded00d7), [`44149e0`](https://github.com/hollware/hollware/commit/44149e0d5a2921754521b7be0797306cf2d5cd55), [`18aac23`](https://github.com/hollware/hollware/commit/18aac23e3ef8309fb802437d5166094cb4a7eb03), [`4d9b15e`](https://github.com/hollware/hollware/commit/4d9b15ea2d854cbec6f4390d14317b705d56cc45), [`73110f5`](https://github.com/hollware/hollware/commit/73110f5317dd9da454ad45a84baccedd1403767a), [`73110f5`](https://github.com/hollware/hollware/commit/73110f5317dd9da454ad45a84baccedd1403767a), [`42df9fb`](https://github.com/hollware/hollware/commit/42df9fb82477bec5b80385bd1b853f68d89092db), [`3b98d87`](https://github.com/hollware/hollware/commit/3b98d8701f82646554a9355e7523addb2ed5b09c), [`7f6ca95`](https://github.com/hollware/hollware/commit/7f6ca9528c258518065dedb22b3703910ec5e985), [`e6c6fb7`](https://github.com/hollware/hollware/commit/e6c6fb74ce757f74d215564a5174133e2879b1d3), [`2a302dc`](https://github.com/hollware/hollware/commit/2a302dcbe1fb41c10757352312b21861aa60f6d5), [`2244160`](https://github.com/hollware/hollware/commit/2244160693dc307127bced011214b59080832dba)]:
  - @hollware/core@1.0.0-rc.9

## 1.0.0-rc.8

### Patch Changes

- Updated dependencies []:
  - @hollware/core@1.0.0-rc.8

## 1.0.0-rc.7

### Minor Changes

- [`0647944`](https://github.com/hollware/hollware/commit/06479447b92e584277b0be96162888039e198adb) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Hollware no longer counts page views: a site connects the analytics it already has, and `content_stats` reads them (ADR-040). Connect Cloudflare Web Analytics, PostHog, Plausible or GA4 in the admin (Site, Analytics), with `hollware analytics connect <provider> --credential-file <file>`, or with the new tool `connect_analytics`; the read-only key is tested before it is kept, sealed under `HOLLWARE_SECRET`, and never shown again (`get_analytics`, `disconnect_analytics`).

  To upgrade: remove `beacon` from `hollware` in `nuxt.config`; remove the `analytics_engine_datasets` binding `ANALYTICS` and the variables `HOLLWARE_ANALYTICS_ACCOUNT_ID` and `HOLLWARE_ANALYTICS_DATASET` from the Worker's `wrangler.jsonc`, and delete its secret `HOLLWARE_ANALYTICS_TOKEN` (`wrangler secret delete HOLLWARE_ANALYTICS_TOKEN`); then connect the site's analytics. `POST /events` is gone, and `@hollware/server` no longer exports `AnalyticsWriter` and `PageView`.

### Patch Changes

- Updated dependencies [[`0647944`](https://github.com/hollware/hollware/commit/06479447b92e584277b0be96162888039e198adb)]:
  - @hollware/core@1.0.0-rc.7

## 1.0.0-rc.6

### Patch Changes

- Updated dependencies []:
  - @hollware/core@1.0.0-rc.6

## 1.0.0-rc.5

### Patch Changes

- Updated dependencies [[`88965e8`](https://github.com/hollware/hollware/commit/88965e8b3431656e939056cc8cfb7ec0b4206072)]:
  - @hollware/core@1.0.0-rc.5

## 1.0.0-rc.4

### Patch Changes

- Updated dependencies [[`9e93f74`](https://github.com/hollware/hollware/commit/9e93f740a5d3c5fd68d16ea43b2ec79853ab1ee6)]:
  - @hollware/core@1.0.0-rc.4

## 1.0.0-rc.3

### Minor Changes

- [`f31b9fb`](https://github.com/hollware/hollware/commit/f31b9fbbd99f08ab8d094742813f62dc32834d44) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Fields Hollware fills itself: a collection's `automaticFields` names them and how, `firstPublished` (the date an entry first went out; a date written wins), `lastModified` (the date of a change published after that), `readingTime` (minutes at 200 words a minute) and `wordCount`. Nobody writes them: they are never required, `describe_site` marks them `readOnly`, and the admin's entry form leaves them out. A site reads them filled (RPC, the read API, `createHollware()`), `get_entry` answers their values as `automatic`, and `hollware export --published` writes them into the frontmatter; the Markdown stored stays what was written. The admin chooses them per field on the page of a collection, and a new blog fills its `date`.

- [`0235865`](https://github.com/hollware/hollware/commit/0235865719899057dc58f7888208c16f1e990eda) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Daily backups of each site to R2: after 03:00 UTC the cron writes `backups/<site>/<date>.json` to the bucket `MEDIA`, with the definition of the site and every entry, its latest Markdown and the published one, and keeps 30 days. `list_backups` (MCP and the admin's Site page) lists them, `GET /v1/backups/<date>` downloads one with `schema:admin`, and `hollware backup list` and `hollware backup get <date> <dir> [--published]` turn one back into the files `hollware import` reads.

- [`29e7ecc`](https://github.com/hollware/hollware/commit/29e7ecc893fcb5f145e53b99a7f158b518e423f3) Thanks [@sergioazoc](https://github.com/sergioazoc)! - `media.keepOriginals` (true by default): a site that sets it to `false` keeps only the file it serves and its copies, not the file as it was uploaded, which takes less storage in R2. The download of an original then gives the file served, and `hollware export` names each image by what its bytes are. The admin sets it under Site → Images.

- [`0150c9f`](https://github.com/hollware/hollware/commit/0150c9f4d1be3be699d6987946acd3bc5041e619) Thanks [@sergioazoc](https://github.com/sergioazoc)! - An entry can change its slug: `move_entry` (MCP) and "Change URL" in the admin give it another path and keep its revisions and translations. An entry that was ever published keeps its old slug as a redirect, which `list_redirects`, the RPC method `listRedirects`, `GET /v1/redirects`, `createHollware().redirectFor()` and the admin's Site page answer, so a site serves the old path with a 301; `hollware export --published` writes them to `redirects.json`. Moving a published entry takes content:publish and purges its pages.

### Patch Changes

- [`8d6edca`](https://github.com/hollware/hollware/commit/8d6edcadbf06f1c4b85c5fe9739fb09a2a1c1f85) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The same image uploaded to two sites of one deployment is two assets, each with an id of its site and its bytes; with rc.2 the second upload failed with a server error and left its files in R2. Assets uploaded before keep their ids and are found by their bytes. `hollware import` of an export into another site writes the `asset:` references with the ids that site gives.

- [`20f1fe3`](https://github.com/hollware/hollware/commit/20f1fe3d065d6b8484f1264ea23c41dcf061005b) Thanks [@sergioazoc](https://github.com/sergioazoc)! - `hollware deploy` of a project deployed before applies the new migrations to the remote database first, while its Worker still serves, and then deploys the new Worker, which so never serves a database without its tables. The starter's README and AGENTS.md say how to upgrade: one version for every package, a project of the new release to compare with, then deploy.

- [`9e07b1e`](https://github.com/hollware/hollware/commit/9e07b1e893afc0c808ad2cfaff8c5edae91dca3f) Thanks [@sergioazoc](https://github.com/sergioazoc)! - `hollware doctor` also checks the cron trigger, the events queue (its producer and its consumer) and the rate limit `HOLLWARE_RATE_LIMIT`, which a project needs for scheduled publications, webhooks and IndexNow, and limits on sign-in.

- [`1310c51`](https://github.com/hollware/hollware/commit/1310c515a6ee07656aac57f3d5cd0fa0e824dd83) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The READMEs on npm say what each package is and how it is used, instead of "pre-alpha, not usable yet"; the CLI's lists `dev` and `mcp-config`.
- Updated dependencies [[`8d6edca`](https://github.com/hollware/hollware/commit/8d6edcadbf06f1c4b85c5fe9739fb09a2a1c1f85), [`f31b9fb`](https://github.com/hollware/hollware/commit/f31b9fbbd99f08ab8d094742813f62dc32834d44), [`83f582a`](https://github.com/hollware/hollware/commit/83f582ab6e2483fe94ba7d3953b3b968835443c7), [`1530a5f`](https://github.com/hollware/hollware/commit/1530a5f2a49cc6e47682e123e35a8d45cef4553b), [`0235865`](https://github.com/hollware/hollware/commit/0235865719899057dc58f7888208c16f1e990eda), [`0075a00`](https://github.com/hollware/hollware/commit/0075a0089e21f378c2295b4f26f5626e866bad67), [`29e7ecc`](https://github.com/hollware/hollware/commit/29e7ecc893fcb5f145e53b99a7f158b518e423f3), [`0150c9f`](https://github.com/hollware/hollware/commit/0150c9f4d1be3be699d6987946acd3bc5041e619), [`1310c51`](https://github.com/hollware/hollware/commit/1310c515a6ee07656aac57f3d5cd0fa0e824dd83), [`cebe6bb`](https://github.com/hollware/hollware/commit/cebe6bb99e776214d595f6223744b3fa670dd8ea), [`d0f43a4`](https://github.com/hollware/hollware/commit/d0f43a433a29618c763a8fde6662f777b4bb00e2), [`5e4bee1`](https://github.com/hollware/hollware/commit/5e4bee1adf9d2e119b90ca4ae3c5e07d8055c260), [`1ab4a4c`](https://github.com/hollware/hollware/commit/1ab4a4c26b492dedc77b1e1289ab883b4a0124d3), [`4c03dd3`](https://github.com/hollware/hollware/commit/4c03dd3f8fb3a366f095b3f8b84c4704819b714f), [`102ea18`](https://github.com/hollware/hollware/commit/102ea18cbc076fbc47f1128b0f71e98e4dd071d8), [`ca4225d`](https://github.com/hollware/hollware/commit/ca4225d3d0a04eb59323c89156ed167ec1b4b905), [`bce8006`](https://github.com/hollware/hollware/commit/bce80069a466f41ee929f33bd11c302b92e9e3a2), [`865c6c7`](https://github.com/hollware/hollware/commit/865c6c75ebd68f3c30993a0f9f346c9188f7843f)]:
  - @hollware/core@1.0.0-rc.3

## 1.0.0-rc.2

### Minor Changes

- [`055d933`](https://github.com/hollware/hollware/commit/055d9332daf8cd27117e0a0e5868ffb2c735b1c1) Thanks [@sergioazoc](https://github.com/sergioazoc)! - `hollware deploy --url https://cms.example.com` now serves the Worker there: a public URL on a domain of your own (not workers.dev) gets a `custom_domain` route in `wrangler.jsonc` before the first deploy, so Cloudflare makes its DNS record and its certificate, and the Worker is deployed once. A config with routes of its own is left as it is, and deploy says which route is missing.

- [`f16f745`](https://github.com/hollware/hollware/commit/f16f7452e24037ab564f4442839c26b463019d58) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Images (ADR-038). `upload_asset` takes a JPEG, PNG, WebP, AVIF, GIF or SVG, judged by its bytes, and converts it once by the site's new `media` setting (WebP at 85 by default, PNG lossless, GIF with its frames, nothing wider than 2400 px; or AVIF, or the file as it came). An SVG is kept as it is, and refused when anything in it can run. R2 keeps the image and its original; content shows it as `img: asset:ast_…` or `![alt](asset:ast_…)`, which reads of the published site and HTML turn into the URL where the Worker serves it, cached for a year. `list_assets` and `get_asset` read them; the admin has an Images page; `hollware export --assets <dir> --assets-url <path>` writes the images for a site that serves them itself, and without it keeps the originals in `_assets/`, which `hollware import` uploads again under the same ids. A new project binds an R2 bucket (`MEDIA`), which the first deploy creates, and the Images binding (`IMAGES`); `hollware doctor` says when either is missing. Migration 0017 adds the `assets` table.

### Patch Changes

- [`28f0198`](https://github.com/hollware/hollware/commit/28f0198a417044d1d67584dcccaa9977bb97f657) Thanks [@sergioazoc](https://github.com/sergioazoc)! - `hollware deploy` says why wrangler failed in full, over every line of a wrapped `[ERROR]`, and suggests `wrangler login` only when wrangler's failure is about logging in. Its closing line no longer says the deploy wrote ids into `wrangler.jsonc`: wrangler now binds what it creates to the deployed Worker by name.

- [`d6ef107`](https://github.com/hollware/hollware/commit/d6ef10750cbd045b20225eb289b3b76859cba61a) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A project keeps working at localhost after `hollware deploy`: the starter's `vite.config.ts` sets `HOLLWARE_PUBLIC_URL` to `http://localhost:5199` in development (`vp dev`), whatever public URL the deploy wrote into `wrangler.jsonc`, and `hollware dev` waits for the server there. `hollware deploy` writes `worker-configuration.d.ts` again whenever it rewrites `wrangler.jsonc`, so `wrangler types --check` keeps passing.
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

- [`069c95f`](https://github.com/hollware/hollware/commit/069c95f1e940ea4f9ac013cac3a69d5ad5d7732d) Thanks [@sergioazoc](https://github.com/sergioazoc)! - An activity log of who did what (ADR-037). Every operation that is not a read, every change of tokens, people and invitations in the admin, sign-in and sign-out, an invitation accepted, an app allowed or revoked, and each scheduled publication write a line: who did it as Hollware verified it (a person, a token, an app, or the deployment), what the client declared apart, the action, its target and its outcome, refusals of a scope included. The log is append-only in D1 (migration `0016_audit_log`). Owners read it on the admin's Activity page and download it as CSV.

  The owner decides what it keeps, in the site's `audit`: `ipAddresses` is `off` by default (`hashed` keeps an HMAC of each address keyed by the site, never the address), and `retentionDays` is `null` by default (forever), or 30 to 3650 days. `hollware init` and `npm create hollware` take `--ip-addresses` and `--audit-retention-days`.

- [`3893d8e`](https://github.com/hollware/hollware/commit/3893d8e6b2d66ceb429cc24dbad51a5a2191dd89) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A token's expiry is the person's choice: `hollware token create` and the admin's Tokens page make a token that never expires when no days are given, and one that expires in the days given (1 to 365) otherwise. Revoking it ends it at once.

### Patch Changes

- [`5e24d98`](https://github.com/hollware/hollware/commit/5e24d987c38466a315bcb3b94c3dfa23de90e71f) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Security fixes from the threat model:

  - `verifyWebhook` takes `isNew(eventId)`. Given it, a webhook replayed within the tolerance is refused, by the id of its signed body (T-67).
  - The renderer reads a URL bound to the frontmatter (`:href="frontmatter.url"`) under its own rules instead of leaving it to `@comark/html`, which let a `data:image/svg+xml` link through (T-59).
  - An invitation link carries its secret in the fragment (`/setup#invitation=…`), which no request log holds. Older links still work (T-55).
  - Sign-in requires user verification explicitly. A counter that went back, or an assertion from another origin, is a refused passkey, not a server error (T-52, T-53).
  - The admin shows the preview of a draft in a sandboxed frame. Nothing it renders can run, reach the admin or draw over it (T-60).

- Updated dependencies [[`069c95f`](https://github.com/hollware/hollware/commit/069c95f1e940ea4f9ac013cac3a69d5ad5d7732d), [`304e18d`](https://github.com/hollware/hollware/commit/304e18d68482c88db6987e2453bcfa0b75467595), [`ead05f6`](https://github.com/hollware/hollware/commit/ead05f60b7240ede34e78a9f2694a238ac8932a6), [`5e24d98`](https://github.com/hollware/hollware/commit/5e24d987c38466a315bcb3b94c3dfa23de90e71f)]:
  - @hollware/core@0.11.0

## 0.10.0

### Minor Changes

- [`2d70e42`](https://github.com/hollware/hollware/commit/2d70e428142983d3859dbc68450dfa9510baabc2) Thanks [@sergioazoc](https://github.com/sergioazoc)! - `hollware export <directory>` writes the entries of a site over MCP as `<collection>/<locale>/<slug>.md`, byte for byte as Hollware keeps them, so that `hollware import` takes them back unchanged, with `--published`, `--collection`, `--locale`, `--site` and `--dry-run`.

- [`2d70e42`](https://github.com/hollware/hollware/commit/2d70e428142983d3859dbc68450dfa9510baabc2) Thanks [@sergioazoc](https://github.com/sergioazoc)! - `hollware import --from nuxt-content` moves a Nuxt Content site to Hollware: the pages of its `content/` routed as Nuxt Content routes them, their Markdown kept, a `title` from their first heading when they have none, and with `--locale-dirs` their locale from the first folder and their translations tied in a group.

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

- [`eaa743d`](https://github.com/hollware/hollware/commit/eaa743d4f6a6cb7ec5977f73379e6f414f43403f) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A new project has no `hollware.config.ts` (ADR-033): the starter's Worker is `createHollware()`, and `hollware init` gives the site its first definition from a preset, `--preset blog|docs|empty` (blog by default) in `--locales` (en by default), which `create-hollware` takes too and hands to it. A project that still has a config keeps it: `init` writes no definition there, and the Worker moves the config into the database on its first request. The presets live in `@hollware/core` (`sitePreset`, `collectionPreset`), shared by the CLI and the admin. The fixes Hollware gives point at the admin and the operations instead of a config file.

- [`286149b`](https://github.com/hollware/hollware/commit/286149b7106adb84b5ee02b0433dc780b50be6e3) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Webhooks need no Worker secret of their own (ADR-033): one that names none is signed with a secret Hollware makes with the new operation `make_webhook_secret`, answers once, and keeps sealed in D1 (migration `0012_site_secrets`) under `HOLLWARE_SECRET`, which `hollware deploy` now makes when the Worker has none. The admin's Site adds and removes webhooks and makes their secrets. A site in the trash keeps its rows until it is restored.

### Patch Changes

- Updated dependencies [[`501174a`](https://github.com/hollware/hollware/commit/501174a4b9cd7e0a5191fa587c09e39f71ff3bd7), [`eaa743d`](https://github.com/hollware/hollware/commit/eaa743d4f6a6cb7ec5977f73379e6f414f43403f), [`f2f2c3d`](https://github.com/hollware/hollware/commit/f2f2c3d6ac6123d26bc1bc0d2b668b61d42afd9d), [`d1ea96e`](https://github.com/hollware/hollware/commit/d1ea96e61df8a7b58e0a9b5e76b85abdddc78a7a), [`3f3cb16`](https://github.com/hollware/hollware/commit/3f3cb16b9779defecc14c95b6607989a3dd22367), [`286149b`](https://github.com/hollware/hollware/commit/286149b7106adb84b5ee02b0433dc780b50be6e3)]:
  - @hollware/core@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies [[`e43c814`](https://github.com/hollware/hollware/commit/e43c81420272ed1a0835ec681df11ac4cc259539)]:
  - @hollware/core@0.7.0

## 0.6.0

### Patch Changes

- [`03df44d`](https://github.com/hollware/hollware/commit/03df44d3ff8a24a3b285645f137cd973ff9e1b9c) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The agents fit the Workers free plan: Hollware's cron wakes them every ten minutes over an `AGENTS` service binding to their `run` entrypoint, so they need no cron trigger of their own (five per account), and each run is one agent in turn, within the fifty calls a free run may make (the translator reads each locale in one listing, the reviewer takes eight reviews a run, the auditor checks a dozen entries a run and writes its report from them once a week). Their requests carry the Host of Hollware's public URL, which a service binding does not set. `hollware migrate --remote` takes a Time Travel bookmark of a database D1 cannot export, as any database with the full-text index of 0.5 is, instead of stopping.
- Updated dependencies [[`30339e0`](https://github.com/hollware/hollware/commit/30339e000c290ddbceab88161be35ef071ccbe0e), [`059ecdf`](https://github.com/hollware/hollware/commit/059ecdffdd9d4394918dd594cf855898bf34b6d1)]:
  - @hollware/core@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [[`02b2fe2`](https://github.com/hollware/hollware/commit/02b2fe2afc509bb3fb6a0f0110d1002b50953e26), [`0712311`](https://github.com/hollware/hollware/commit/071231163dbf2bb7f5e3368466c5ed0ea5a3c20c), [`310b3ab`](https://github.com/hollware/hollware/commit/310b3abbadfe303be1c90e4c5009ef99bc08c8e1), [`b84107c`](https://github.com/hollware/hollware/commit/b84107c9d0dd0d60d9521c7314a030cf4ab0cc67)]:
  - @hollware/core@0.5.0

## 0.4.0

### Minor Changes

- [`2b76bb0`](https://github.com/hollware/hollware/commit/2b76bb01979986c7f9ec8bb2b2080bad7c252fcd) Thanks [@sergioazoc](https://github.com/sergioazoc)! - `npm create hollware <dir>` makes a project: the starter, every Hollware package at its own version, `git init`, the install, the local migrations, and the site with its owner and a first token, then the `claude mcp add` line for it. `hollware deploy` deploys to Cloudflare, creating the D1 database, the KV namespace and the queues on the first run and setting the public URL of the Worker, and migrates the remote database. `hollware doctor` checks a project and says what to fix. `hollware migrate --remote` takes no backup of a database that has none of the migrations yet.

- [`43333d3`](https://github.com/hollware/hollware/commit/43333d309843e464c47b20412d2d1d05738c835a) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A deployment serves every site of its config (ADR-027). A personal token, an OAuth grant and an RPC call each act on the one site they name; a person has one passkey and one session for the deployment, with a role per site. The consent page asks which site when the person is in several, the admin switches sites (`GET /v1/admin/me`), and `hollware init --site <key>` on a database with an owner adds the site to that owner. Migration `0006_people_across_sites.sql` drops `site_id` from passkeys, sessions and sign-in challenges.

- [`a7b5f26`](https://github.com/hollware/hollware/commit/a7b5f261d08bf8b58e3dc98ee0a7148de71d394b) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Read tokens and CORS for the read API (ADR-028). A read token (`hw_read_`) reads the published content of one site over `GET /v1/…` and is refused everywhere else; make one with `hollware token create --read` or in the admin. A site lists the origins of its pages in `cors.origins`, and those pages may read it from the browser. Migration `0007_read_tokens.sql` adds the `kind` of a token.

### Patch Changes

- [`6109c83`](https://github.com/hollware/hollware/commit/6109c832f1a789d856f8c5af13674b92aff08606) Thanks [@sergioazoc](https://github.com/sergioazoc)! - `hollware import --publish` with a token without `content:publish` asks for a review of each entry: the server refuses a group from it, and the import then sends each entry on its own.
- Updated dependencies [[`43333d3`](https://github.com/hollware/hollware/commit/43333d309843e464c47b20412d2d1d05738c835a), [`a7b5f26`](https://github.com/hollware/hollware/commit/a7b5f261d08bf8b58e3dc98ee0a7148de71d394b)]:
  - @hollware/core@0.4.0

## 0.3.0

### Minor Changes

- [`88b921f`](https://github.com/hollware/hollware/commit/88b921fac97aca124cadbe171d4d422d4e318e93) Thanks [@sergioazoc](https://github.com/sergioazoc)! - `hollware import --publish` publishes what it imported as one group (in groups of 100), so entries that link to each other are published together; an entry that stops the group is reported and left out, and the rest is published. The CLI also reads wrangler's JSON past a warning printed before it, which made `hollware init` lose its token. `publish` with a group names the entry that has a warning to acknowledge in `failedEntry`.

- [`736214b`](https://github.com/hollware/hollware/commit/736214b5f8656113a5f52f46e96c328da4ab819e) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Passkeys, invitations and sessions for the admin. The server adds migration `0004_identity.sql` and the `/setup` and `/signin` pages; a person's role in a site is their row of the new `members` table, `owner`, `editor` or `author` (every person with a token becomes a member of its site, a `reviewer` of v0.2 an `author`). `hollware init` prints the owner's link to set up a passkey, and `hollware invite --role editor|author` invites a person.

- [`ee1786b`](https://github.com/hollware/hollware/commit/ee1786be92bf76ff3ef7583763eb4400070dd096) Thanks [@sergioazoc](https://github.com/sergioazoc)! - `hollware invite --owner` prints a setup link for the owner of the site, to set up a passkey: on a deployment made before the admin existed, or on a new device.

- [`777ce1d`](https://github.com/hollware/hollware/commit/777ce1dee559ffa13ad576ab2f60d485097f104b) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Reviews. `publish` needs `content:write`: without `content:publish` it runs the same checks and answers `pending_review`, and a person who may publish answers with the new operations `approve_review`, which publishes the revision in their name, or `request_changes`, with a note; `list_reviews` lists them. A new revision of the entry cancels its pending review. The server adds migration `0005_reviews.sql`. `hollware import --publish` reports `pending_review` for an entry that a token without `content:publish` asked to publish. A schedule made through OAuth now publishes as that client.

### Patch Changes

- Updated dependencies [[`bf0d98c`](https://github.com/hollware/hollware/commit/bf0d98cf151ddb7ae4167ffa43e92cdd2a1709ae), [`2580f76`](https://github.com/hollware/hollware/commit/2580f7658f82a534624b7343b1f1d55e121f6b19), [`30479f5`](https://github.com/hollware/hollware/commit/30479f5402b29b934ce5bc06c8f3d2af3cf1bfdf), [`777ce1d`](https://github.com/hollware/hollware/commit/777ce1dee559ffa13ad576ab2f60d485097f104b)]:
  - @hollware/core@0.3.0

## 0.2.0

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
