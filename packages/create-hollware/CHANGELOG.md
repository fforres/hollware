# create-hollware

## 1.5.0

### Minor Changes

- [#98](https://github.com/hollware/hollware/pull/98) [`9725c1d`](https://github.com/hollware/hollware/commit/9725c1ddb7f4fcb12c8aa1d9a85ebf2a22a2c3b6) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Two roles join owner, editor and author: an admin runs the site and its people with every scope of an owner but the new `site:owner`, which names, changes and removes owners, deletes and restores sites, reads backups, purges entries and anonymizes people; a reviewer reads and comments. A site may let reviewers in through `access.autoProvision`.

  Invitations are mailed: with a `send_email` binding `EMAIL` of Cloudflare Email Service and `HOLLWARE_EMAIL_FROM`, an invitation that names an address goes to it in the inviter's language, its link is shown to nobody, and the address of whoever accepts it is verified. Without them, or when the mail fails, the admin shows the link as before. An invitation can be renewed with a new link, an expired one stays listed until it is renewed or revoked, and a second invitation of an address or one of a member is refused.

  Every account of a person has an address. An invitation names one, in the admin, in `POST /v1/admin/invitations` and in `hollware invite --email`, and the account made from it keeps it, verified when Hollware mailed the link or when the person signs in with it through a provider. `hollware init` and `npm create hollware` ask for `--owner-email`.

  A person of this Hollware accepts an invitation to another site with the passkey they have, from the setup page, instead of making a second account. In the admin a reviewer reads entries without an editor, and what a person sees follows their scopes.

  Migration `0032_roles_and_invitations` rebuilds `members`, `invitations` and `auth_challenges`. Tokens of an owner made before it carry no `site:owner`: make a new one for `hollware backup` and the site's deletion.

## 1.4.0

No changes in this release.

## 1.3.0

No changes in this release.

## 1.2.0

No changes in this release.

## 1.1.0

### Minor Changes

- [#85](https://github.com/hollware/hollware/pull/85) [`5934bf8`](https://github.com/hollware/hollware/commit/5934bf84b1202d8b558c185e71e41312dabcc400) Thanks [@sergioazoc](https://github.com/sergioazoc)! - People sign in through Google, Microsoft, GitHub, any OpenID Connect provider or Cloudflare Access, with passkeys optional. `auth: { providers: [...], passkeys }` in the config lists the providers, each client secret by the name of its Worker secret; a Microsoft tenant must be one directory (`common`, `organizations` and `consumers` are refused). An account signs in by its provider and subject; its verified email links it to the person who has it, accepts an invitation sent to that address, or makes the person a member of a site whose new `access.autoProvision` lets in that address or its domain. An unverified email links nothing. The account page lists the accounts of providers and adds passkeys, and the last passkey goes when an account of a provider signs the person in. An invitation takes an address (`email` of `POST /v1/admin/invitations`, `hollware invite --email`), `hollware init --owner-email` gives the owner theirs, `hollware doctor` says which secret of a provider the local project lacks, and `npm create hollware` takes `--auth <kind>` with its credentials.

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

- [`f16f745`](https://github.com/hollware/hollware/commit/f16f7452e24037ab564f4442839c26b463019d58) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Images. `upload_asset` takes a JPEG, PNG, WebP, AVIF, GIF or SVG, judged by its bytes, and converts it once by the site's new `media` setting (WebP at 85 by default, PNG lossless, GIF with its frames, nothing wider than 2400 px; or AVIF, or the file as it came). An SVG is kept as it is, and refused when anything in it can run. R2 keeps the image and its original; content shows it as `img: asset:ast_…` or `![alt](asset:ast_…)`, which reads of the published site and HTML turn into the URL where the Worker serves it, cached for a year. `list_assets` and `get_asset` read them; the admin has an Images page; `hollware export --assets <dir> --assets-url <path>` writes the images for a site that serves them itself, and without it keeps the originals in `_assets/`, which `hollware import` uploads again under the same ids. A new project binds an R2 bucket (`MEDIA`), which the first deploy creates, and the Images binding (`IMAGES`); `hollware doctor` says when either is missing. Migration 0017 adds the `assets` table.

### Patch Changes

- [#81](https://github.com/hollware/hollware/pull/81) [`648c299`](https://github.com/hollware/hollware/commit/648c2990429ddcbc6ec14f2cc33fc149711e9274) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Hollware 1.0: `npm create hollware` installs it, with no tag, and the README of `create-hollware` says so.

- [#66](https://github.com/hollware/hollware/pull/66) [`b29fe9d`](https://github.com/hollware/hollware/commit/b29fe9d074c7b83b77014c59c41a4037d044bed4) Thanks [@sergioazoc](https://github.com/sergioazoc)! - `hollware backup get` writes a backup as an export would: the entries and site.json, `redirects.json` with the 301s of the entries that moved, and the images of the site in `_assets`, which `hollware import` uploads again. An image whose original the deployment no longer has is named and left out. A new project binds the R2 bucket `BACKUPS`, `<name>-backups`, so its backups live apart from its images, and `hollware doctor` says whether a project has one.

- [#63](https://github.com/hollware/hollware/pull/63) [`44149e0`](https://github.com/hollware/hollware/commit/44149e0d5a2921754521b7be0797306cf2d5cd55) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A new project consumes the dead-letter queue of its events, `<name>-events-dlq`, so Hollware keeps the events it gave up on for the admin to send again. `hollware doctor` says when the consumer of the events has no dead-letter queue, or when nothing consumes it. A project made before adds `{ "queue": "<name>-events-dlq" }` to `queues.consumers` in its wrangler.jsonc.

- [#78](https://github.com/hollware/hollware/pull/78) [`c238a55`](https://github.com/hollware/hollware/commit/c238a5583cdc8eaa63733586951208b824f158cc) Thanks [@sergioazoc](https://github.com/sergioazoc)! - `hollware deploy` creates the dead-letter queue of the events when it does not exist yet: wrangler creates the other queues, the database, the KV namespace and the buckets of a new project by itself, but stopped the first deploy at a dead-letter queue it does not make. `npm create hollware .` no longer says `cd .`, and the README of `create-hollware` lists every option of `--help`.

- [`20f1fe3`](https://github.com/hollware/hollware/commit/20f1fe3d065d6b8484f1264ea23c41dcf061005b) Thanks [@sergioazoc](https://github.com/sergioazoc)! - `hollware deploy` of a project deployed before applies the new migrations to the remote database first, while its Worker still serves, and then deploys the new Worker, which so never serves a database without its tables. The starter's README and AGENTS.md say how to upgrade: one version for every package, a project of the new release to compare with, then deploy.

- [`d6ef107`](https://github.com/hollware/hollware/commit/d6ef10750cbd045b20225eb289b3b76859cba61a) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A project keeps working at localhost after `hollware deploy`: the starter's `vite.config.ts` sets `HOLLWARE_PUBLIC_URL` to `http://localhost:5199` in development (`vp dev`), whatever public URL the deploy wrote into `wrangler.jsonc`, and `hollware dev` waits for the server there. `hollware deploy` writes `worker-configuration.d.ts` again whenever it rewrites `wrangler.jsonc`, so `wrangler types --check` keeps passing.

- [#47](https://github.com/hollware/hollware/pull/47) [`c7403f4`](https://github.com/hollware/hollware/commit/c7403f413993cab6f899d8b993b02d978d7d873a) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The README installs the release candidate, `npm create hollware@rc`: without the tag, npm still gets the last stable release, 0.11.0.

- [`d8e7306`](https://github.com/hollware/hollware/commit/d8e730611739d6fb335702ae01f4f4e38cdedaba) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A new project's local server has a `HOLLWARE_SECRET` of its own, for development only, so preview links and the secrets of webhooks work before the first deploy; a `.dev.vars` with `HOLLWARE_SECRET` takes its place.

- [#24](https://github.com/hollware/hollware/pull/24) [`73110f5`](https://github.com/hollware/hollware/commit/73110f5317dd9da454ad45a84baccedd1403767a) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The packages carry no comments but the TSDoc of their public API, and the help of the CLI and the descriptions of the MCP tools no longer cite decision records the repository does not have. The starter's `AGENTS.md` now says what each setting of its `wrangler.jsonc` is for.

- [`84d96fd`](https://github.com/hollware/hollware/commit/84d96fdbfe0527c5aae28b52d2d5045c8ec69354) Thanks [@sergioazoc](https://github.com/sergioazoc)! - What a rehearsal of moving a real site into Hollware turned up. A database that lacks the migrations of its release answers a 503 `not_migrated` that names the command to run, instead of a bare 500. `hollware import` shows an unchanged entry with the verdict of this run, not the one kept since it was written, which a change of the site's definition can have made stale. `npm create hollware` prints how to connect an agent once (init's block, which names `HOLLWARE_TOKEN`, never the token), and starts the project with `hollware dev`.

- [`f1c5806`](https://github.com/hollware/hollware/commit/f1c5806937109e52a1cd2b9d468bc3b583179a95) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A project's own test of its database no longer breaks when Hollware adds a migration: it checks that every migration of `@hollware/server` is applied and that the tables of content are there, instead of listing every table of one release.

- [#43](https://github.com/hollware/hollware/pull/43) [`4070b0c`](https://github.com/hollware/hollware/commit/4070b0ccaeffa77a53e155edc9f198bee21307b7) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A project made with npm, the default, gets the commands of npm in its AGENTS.md and README (`npm test`, `npx hollware doctor`, `npm install -E`), so an agent that follows them no longer runs pnpm in a project that npm installed.

- [`0f69adb`](https://github.com/hollware/hollware/commit/0f69adbd8f17cf0dc66175a60b98afc6dd4d9bdd) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A new project passes its own `vp check`: the starter formats and lints as Hollware writes it (no semicolons, single quotes, generated files left alone), has a `check` script, and `npm create hollware` formats the project after the install, so a longer name than the starter's never leaves a line too wide. Its `AGENTS.md` says how to update Hollware: every package to one exact version, then `hollware deploy`.

- [#58](https://github.com/hollware/hollware/pull/58) [`2a302dc`](https://github.com/hollware/hollware/commit/2a302dcbe1fb41c10757352312b21861aa60f6d5) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The AGENTS.md of a new project says why it keeps `global_fetch_strictly_public`: `upload_asset` downloads the URL an agent gives over the public internet only, as the OAuth server does with the metadata documents of clients.

- [`f38af74`](https://github.com/hollware/hollware/commit/f38af744088d5985b6cf5c849d56bb0183bae15f) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A project's tests pass after `hollware deploy`: the starter's `vitest.config.ts` gives the Worker under test `HOLLWARE_PUBLIC_URL=http://localhost:5199`, whatever public URL the deploy wrote into `wrangler.jsonc`. They used to answer 403 in CI, where no `.dev.vars` sets it back to localhost.

- [`0783887`](https://github.com/hollware/hollware/commit/0783887e0ca06684143ddd0de531a137ba6f0950) Thanks [@sergioazoc](https://github.com/sergioazoc)! - New projects pin Vite+ 1.3.0, Vitest 5.0.5, wrangler 4.151.1 and @cloudflare/vitest-plugin 1.4.4.

## 1.0.0-rc.11

### Patch Changes

- [#78](https://github.com/hollware/hollware/pull/78) [`c238a55`](https://github.com/hollware/hollware/commit/c238a5583cdc8eaa63733586951208b824f158cc) Thanks [@sergioazoc](https://github.com/sergioazoc)! - `hollware deploy` creates the dead-letter queue of the events when it does not exist yet: wrangler creates the other queues, the database, the KV namespace and the buckets of a new project by itself, but stopped the first deploy at a dead-letter queue it does not make. `npm create hollware .` no longer says `cd .`, and the README of `create-hollware` lists every option of `--help`.

## 1.0.0-rc.10

No changes in this release.

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

### Patch Changes

- [#66](https://github.com/hollware/hollware/pull/66) [`b29fe9d`](https://github.com/hollware/hollware/commit/b29fe9d074c7b83b77014c59c41a4037d044bed4) Thanks [@sergioazoc](https://github.com/sergioazoc)! - `hollware backup get` writes a backup as an export would: the entries and site.json, `redirects.json` with the 301s of the entries that moved, and the images of the site in `_assets`, which `hollware import` uploads again. An image whose original the deployment no longer has is named and left out. A new project binds the R2 bucket `BACKUPS`, `<name>-backups`, so its backups live apart from its images, and `hollware doctor` says whether a project has one.

- [#63](https://github.com/hollware/hollware/pull/63) [`44149e0`](https://github.com/hollware/hollware/commit/44149e0d5a2921754521b7be0797306cf2d5cd55) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A new project consumes the dead-letter queue of its events, `<name>-events-dlq`, so Hollware keeps the events it gave up on for the admin to send again. `hollware doctor` says when the consumer of the events has no dead-letter queue, or when nothing consumes it. A project made before adds `{ "queue": "<name>-events-dlq" }` to `queues.consumers` in its wrangler.jsonc.

- [#47](https://github.com/hollware/hollware/pull/47) [`c7403f4`](https://github.com/hollware/hollware/commit/c7403f413993cab6f899d8b993b02d978d7d873a) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The README installs the release candidate, `npm create hollware@rc`: without the tag, npm still gets the last stable release, 0.11.0.

- [#24](https://github.com/hollware/hollware/pull/24) [`73110f5`](https://github.com/hollware/hollware/commit/73110f5317dd9da454ad45a84baccedd1403767a) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The packages carry no comments but the TSDoc of their public API, and the help of the CLI and the descriptions of the MCP tools no longer cite decision records the repository does not have. The starter's `AGENTS.md` now says what each setting of its `wrangler.jsonc` is for.

- [#43](https://github.com/hollware/hollware/pull/43) [`4070b0c`](https://github.com/hollware/hollware/commit/4070b0ccaeffa77a53e155edc9f198bee21307b7) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A project made with npm, the default, gets the commands of npm in its AGENTS.md and README (`npm test`, `npx hollware doctor`, `npm install -E`), so an agent that follows them no longer runs pnpm in a project that npm installed.

- [#58](https://github.com/hollware/hollware/pull/58) [`2a302dc`](https://github.com/hollware/hollware/commit/2a302dcbe1fb41c10757352312b21861aa60f6d5) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The AGENTS.md of a new project says why it keeps `global_fetch_strictly_public`: `upload_asset` downloads the URL an agent gives over the public internet only, as the OAuth server does with the metadata documents of clients.

## 1.0.0-rc.8

No changes in this release.

## 1.0.0-rc.7

No changes in this release.

## 1.0.0-rc.6

No changes in this release.

## 1.0.0-rc.5

No changes in this release.

## 1.0.0-rc.4

No changes in this release.

## 1.0.0-rc.3

### Patch Changes

- [`20f1fe3`](https://github.com/hollware/hollware/commit/20f1fe3d065d6b8484f1264ea23c41dcf061005b) Thanks [@sergioazoc](https://github.com/sergioazoc)! - `hollware deploy` of a project deployed before applies the new migrations to the remote database first, while its Worker still serves, and then deploys the new Worker, which so never serves a database without its tables. The starter's README and AGENTS.md say how to upgrade: one version for every package, a project of the new release to compare with, then deploy.

- [`d8e7306`](https://github.com/hollware/hollware/commit/d8e730611739d6fb335702ae01f4f4e38cdedaba) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A new project's local server has a `HOLLWARE_SECRET` of its own, for development only, so preview links and the secrets of webhooks work before the first deploy; a `.dev.vars` with `HOLLWARE_SECRET` takes its place.

- [`f1c5806`](https://github.com/hollware/hollware/commit/f1c5806937109e52a1cd2b9d468bc3b583179a95) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A project's own test of its database no longer breaks when Hollware adds a migration: it checks that every migration of `@hollware/server` is applied and that the tables of content are there, instead of listing every table of one release.

- [`0783887`](https://github.com/hollware/hollware/commit/0783887e0ca06684143ddd0de531a137ba6f0950) Thanks [@sergioazoc](https://github.com/sergioazoc)! - New projects pin Vite+ 1.3.0, Vitest 5.0.5, wrangler 4.151.1 and @cloudflare/vitest-plugin 1.4.4.

## 1.0.0-rc.2

### Minor Changes

- [`f16f745`](https://github.com/hollware/hollware/commit/f16f7452e24037ab564f4442839c26b463019d58) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Images (ADR-038). `upload_asset` takes a JPEG, PNG, WebP, AVIF, GIF or SVG, judged by its bytes, and converts it once by the site's new `media` setting (WebP at 85 by default, PNG lossless, GIF with its frames, nothing wider than 2400 px; or AVIF, or the file as it came). An SVG is kept as it is, and refused when anything in it can run. R2 keeps the image and its original; content shows it as `img: asset:ast_…` or `![alt](asset:ast_…)`, which reads of the published site and HTML turn into the URL where the Worker serves it, cached for a year. `list_assets` and `get_asset` read them; the admin has an Images page; `hollware export --assets <dir> --assets-url <path>` writes the images for a site that serves them itself, and without it keeps the originals in `_assets/`, which `hollware import` uploads again under the same ids. A new project binds an R2 bucket (`MEDIA`), which the first deploy creates, and the Images binding (`IMAGES`); `hollware doctor` says when either is missing. Migration 0017 adds the `assets` table.

### Patch Changes

- [`d6ef107`](https://github.com/hollware/hollware/commit/d6ef10750cbd045b20225eb289b3b76859cba61a) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A project keeps working at localhost after `hollware deploy`: the starter's `vite.config.ts` sets `HOLLWARE_PUBLIC_URL` to `http://localhost:5199` in development (`vp dev`), whatever public URL the deploy wrote into `wrangler.jsonc`, and `hollware dev` waits for the server there. `hollware deploy` writes `worker-configuration.d.ts` again whenever it rewrites `wrangler.jsonc`, so `wrangler types --check` keeps passing.

- [`0f69adb`](https://github.com/hollware/hollware/commit/0f69adbd8f17cf0dc66175a60b98afc6dd4d9bdd) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A new project passes its own `vp check`: the starter formats and lints as Hollware writes it (no semicolons, single quotes, generated files left alone), has a `check` script, and `npm create hollware` formats the project after the install, so a longer name than the starter's never leaves a line too wide. Its `AGENTS.md` says how to update Hollware: every package to one exact version, then `hollware deploy`.

- [`f38af74`](https://github.com/hollware/hollware/commit/f38af744088d5985b6cf5c849d56bb0183bae15f) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A project's tests pass after `hollware deploy`: the starter's `vitest.config.ts` gives the Worker under test `HOLLWARE_PUBLIC_URL=http://localhost:5199`, whatever public URL the deploy wrote into `wrangler.jsonc`. They used to answer 403 in CI, where no `.dev.vars` sets it back to localhost.

## 1.0.0-rc.1

### Minor Changes

- [`84d96fd`](https://github.com/hollware/hollware/commit/84d96fdbfe0527c5aae28b52d2d5045c8ec69354) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Setting Hollware up from an agent: `hollware init` and `hollware token create` take `--token-file <path>` (mode 0600, refused when the file exists unless `--force`) and print its path instead of the token, and `create-hollware` passes it through. `--json` on `create-hollware`, `init`, `token create`, `invite` and `doctor` prints one JSON object and nothing else. `hollware dev` starts the project's local server, waits for `/health` and stays in the foreground until SIGINT or SIGTERM (`--detach` and `--stop` run it in the background), and `hollware mcp-config` prints the `claude mcp add` line or the JSON block of Claude Code, Cursor and VS Code, which name `HOLLWARE_TOKEN` and never the token. The output of `init` and `create-hollware` says the passkey link is for the admin and an agent starts with the token alone. `GET /v1` answers 200 with the URLs of the OpenAPI document and of `/v1/site`, with no token. `update_site` and `set_collection` answer `conflict` on a stale version with a `message` and a `fix` that say to call `get_structure` again.

### Patch Changes

- [`84d96fd`](https://github.com/hollware/hollware/commit/84d96fdbfe0527c5aae28b52d2d5045c8ec69354) Thanks [@sergioazoc](https://github.com/sergioazoc)! - What a rehearsal of moving a real site into Hollware turned up. A database that lacks the migrations of its release answers a 503 `not_migrated` that names the command to run, instead of a bare 500. `hollware import` shows an unchanged entry with the verdict of this run, not the one kept since it was written, which a change of the site's definition can have made stale. `npm create hollware` prints how to connect an agent once (init's block, which names `HOLLWARE_TOKEN`, never the token), and starts the project with `hollware dev`.

## 1.0.0-rc.0

No changes in this release.

## 0.11.0

### Minor Changes

- [`069c95f`](https://github.com/hollware/hollware/commit/069c95f1e940ea4f9ac013cac3a69d5ad5d7732d) Thanks [@sergioazoc](https://github.com/sergioazoc)! - An activity log of who did what (ADR-037). Every operation that is not a read, every change of tokens, people and invitations in the admin, sign-in and sign-out, an invitation accepted, an app allowed or revoked, and each scheduled publication write a line: who did it as Hollware verified it (a person, a token, an app, or the deployment), what the client declared apart, the action, its target and its outcome, refusals of a scope included. The log is append-only in D1 (migration `0016_audit_log`). Owners read it on the admin's Activity page and download it as CSV.

  The owner decides what it keeps, in the site's `audit`: `ipAddresses` is `off` by default (`hashed` keeps an HMAC of each address keyed by the site, never the address), and `retentionDays` is `null` by default (forever), or 30 to 3650 days. `hollware init` and `npm create hollware` take `--ip-addresses` and `--audit-retention-days`.

- [`1b3f3a2`](https://github.com/hollware/hollware/commit/1b3f3a27d6f42852fae1761ca34a9269e19f0609) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The routes anyone may call without a token (sign-in and passkeys, OAuth's token and registration endpoints, the beacon) are rate limited per address when the Worker has a Workers Rate Limiting binding, `HOLLWARE_RATE_LIMIT`, which new projects get (60 requests a minute): past it they answer 429 with Retry-After. And the cron trigger drops the expired sessions and the sign-in challenges nobody took, which anyone could make pile up a row a request.

## 0.10.0

### Patch Changes

- [`f21e6f8`](https://github.com/hollware/hollware/commit/f21e6f8e4245d0a2ead778d120e4d2e6c63213d2) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The admin loads less than half the JavaScript it did on its first page (Nuxt UI 4.12 loads the code of a component only on the pages that use it, and its menus, palette and toasts when they open), and its site and person buttons, and the links to translations, are named by what they show. New projects get wrangler 4.151.0 and zod 4.6.7.

## 0.9.1

No changes in this release.

## 0.9.0

No changes in this release.

## 0.8.0

### Minor Changes

- [`eaa743d`](https://github.com/hollware/hollware/commit/eaa743d4f6a6cb7ec5977f73379e6f414f43403f) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A new project has no `hollware.config.ts` (ADR-033): the starter's Worker is `createHollware()`, and `hollware init` gives the site its first definition from a preset, `--preset blog|docs|empty` (blog by default) in `--locales` (en by default), which `create-hollware` takes too and hands to it. A project that still has a config keeps it: `init` writes no definition there, and the Worker moves the config into the database on its first request. The presets live in `@hollware/core` (`sitePreset`, `collectionPreset`), shared by the CLI and the admin. The fixes Hollware gives point at the admin and the operations instead of a config file.

## 0.7.0

No changes in this release.

## 0.6.0

No changes in this release.

## 0.5.0

No changes in this release.

## 0.4.0

### Minor Changes

- [`2b76bb0`](https://github.com/hollware/hollware/commit/2b76bb01979986c7f9ec8bb2b2080bad7c252fcd) Thanks [@sergioazoc](https://github.com/sergioazoc)! - `npm create hollware <dir>` makes a project: the starter, every Hollware package at its own version, `git init`, the install, the local migrations, and the site with its owner and a first token, then the `claude mcp add` line for it. `hollware deploy` deploys to Cloudflare, creating the D1 database, the KV namespace and the queues on the first run and setting the public URL of the Worker, and migrates the remote database. `hollware doctor` checks a project and says what to fix. `hollware migrate --remote` takes no backup of a database that has none of the migrations yet.

### Patch Changes

- [`92ccc02`](https://github.com/hollware/hollware/commit/92ccc02ce181db4f291f543a109cd2bd3bf0d7d1) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A project installs with npm, whose peer check refused Vite+'s core in place of `vite` (the starter now overrides every `vite` with its own), and with pnpm, which refused the build scripts of esbuild and workerd (a pnpm project gets a `pnpm-workspace.yaml` that allows them). A step that fails shows the last 30 lines of what it printed.

## 0.3.0

No changes in this release.

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
