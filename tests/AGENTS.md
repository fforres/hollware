# Tests

What lives in `tests/`: the guards of what this repository claims about itself, the tests of its CI scripts, and the fixtures every package's tests share. A package's tests sit next to its code.

- `tests/guards/` holds the guards. A guard is a pure function, `check...(input): Violation[]`, that takes the facts of the repository as arguments and holds no exception list.
- `tests/conventions/` has one test per guard about a fact of the repository, and `tests/meta/` one per guard about the docs, the tests and the guards themselves. Each runs its guard on this repository and, in a `describe('self-test: ...')` block, on bad fixtures, asserting the exact violation.
- `tests/support/` holds what guards stand on: the repository's file list, readers of JSONC, Markdown, YAML, syntax trees and Vite+ tasks, and fixture builders.
- `tests/ci/` runs the shell scripts of the CI and release workflows.
- `tests/acceptance/` holds each stage's acceptance suite, named after its criteria. It runs the built playground and site in process (`tests/acceptance/v0.1/support/harness.ts`), and a project under `wrangler dev` (`tests/acceptance/v0.1/support/project.ts`).
- `tests/conformance/` runs the MCP conformance suite against `tests/conformance/worker`: runner, token proxy, probes, baselines and must-pass profile.
- `tests/fixtures/` holds the synthetic content of the tests (`tests/fixtures/README.md`).

Run the guards with `pnpm exec vp test --project repo`. Prove one can fail with `node scripts/break-line.ts`; failing for another reason proves nothing. After `vp run -r build`, `node scripts/check-bins.ts` runs each built bin with `--version`.

## Guards

What each guard binds, one line per file of `tests/conventions/` and `tests/meta/`.

- `tests/conventions/manifests.test.ts`: the packages share one manifest shape and version; `exports` and `bin` point at the source and `publishConfig` at `dist`; apps and templates are private; `tsconfig.base.json` sets `erasableSyntaxOnly`.
- `tests/conventions/pre-push.test.ts`: the hook pre-push runs `check:local`, which runs the tasks of `ci.yml` but `CI_ONLY`; `scripts/commit-subjects.test.ts`: there, commit subjects are Conventional Commits.
- `tests/conventions/build-order.test.ts`: `check:push` runs `vp check` and `vp test` before anything builds, so CI proves no package needs another built.
- `tests/conventions/licenses.test.ts`: every package `LICENSE` is a byte copy of the root MIT one and its copyright line.
- `tests/conventions/no-claude-md.test.ts`: no `CLAUDE.md`, tracked or not.
- `tests/conventions/core-purity.test.ts`: `packages/core` has no Cloudflare or Node import, global or dependency; `src` type-checks against the web platform only; each test runs in Node and workerd.
- `tests/conventions/server-types.test.ts`: `packages/server/src` type-checks with the generated Workers runtime types only, so a Node global is a type error.
- `tests/conventions/schema.test.ts`: every D1 table has an `id` primary key and timestamps; a table outside `TABLES_WITHOUT_SITE` has `site_id`, its foreign key to `sites` and `UNIQUE(id, site_id)`, and its foreign keys to site tables carry `site_id`.
- `tests/conventions/shipped-migrations.test.ts`: no migration of a `@hollware/server@*` release tag is edited or removed, and the tags are there to compare.
- `tests/conventions/declared-imports.test.ts`: every bare import is declared by its package; `virtual:` only per `VIRTUAL_IMPORTS`.
- `tests/conventions/brand.test.ts`: the site and the admin share one dark look (one theme block, the same Nuxt UI colors, radius and width, no slot changed) with text at 4.5:1 contrast; the sign-in pages its ground and accent; every logo and icon one mark.
- `tests/conventions/starter-template.test.ts`: create-hollware's template is made by `scripts/sync-starter.ts` from `templates/starter` on build or pack, never committed: its files, the catalog's exact versions, `HOLLWARE_VERSION`, a standalone tsconfig.
- `tests/conventions/install-tag.test.ts`: READMEs, hollware.com and the starter install with the tag of the pre mode of changesets, none after.
- `tests/conventions/catalog-deps.test.ts`: every dependency is `catalog:` or `workspace:*`, except a caret-range peer that is also a catalog dev dependency.
- `tests/conventions/single-copies.test.ts`: each of `SINGLE_COPY_PACKAGES` resolves to one version.
- `tests/conventions/changesets.test.ts`: `fixed` is one group, the published packages; public access.
- `tests/conventions/pnpm-policy.test.ts`: release age, trust policy, reasoned builds, excludes, ignored advisories, exact catalog.
- `tests/conventions/wrangler-dates.test.ts`: no `compatibility_date` newer than the bundled workerd.
- `tests/conventions/wrangler-flags.test.ts`: every `wrangler.jsonc` lists `no_nodejs_compat` and `no_nodejs_compat_v2`, no positive Node.js flag, and outside `templates/` `send_metrics: false`; a Hollware Worker (D1 `DB`) lists `global_fetch_strictly_public` and, per environment with bindings, binds `OAUTH_KV`, a cron and a queue consumer with `dead_letter_queue` `<queue>-dlq`, consumed too, but `WORKERS_WITHOUT_EVENTS`.
- `tests/conventions/worker-projects.test.ts`: every Wrangler config sits in a workspace package that defines `build` and a `types:check` that names a config inside it.
- `tests/conventions/dev-port.test.ts`: the playground and the starter serve `vp dev` on a fixed port with `strictPort`, which their `HOLLWARE_PUBLIC_URL` names.
- `tests/conventions/conformance-baselines.test.ts`: each revision's baseline names single checks with a class and reason, none of the must-pass profile, at its recorded size; the profile keeps its claims.
- `tests/conventions/workflow-pinning.test.ts`: every action is a commit SHA with its `# vX.Y.Z`.
- `tests/conventions/workflow-permissions.test.ts`: `permissions: {}`, `id-token: write` only in `publish` and Scorecard, other writes per `WRITE_SCOPES`, no kept credentials, Scorecard rules.
- `tests/conventions/workflow-forbidden.test.ts`: no npm token, `pnpm`, `yarn` or `changeset publish`, `npm stage`, `git push`, `npx` or `dlx`; `npm publish` only with `--provenance` in the `release.yml` `publish` job; zizmor ignores allowlisted.
- `tests/conventions/release-workflow.test.ts`: `release.yml` runs on `main` (versions) and `release` (promotes, packs, publishes, finalizes), jobs gated to this repo and branch, chained by `needs`; `publish` isolated; one run per ref, never cancelled; its scripts get only their env, full history; `finalize_only` finalizes only `RELEASE_SHA`/`release_sha`; the Version Packages title; `finalize` outlasts its wait; `ci.yml` runs on `release` without the changeset gate, `fetch-depth: 0`.
- `tests/conventions/deploy-workflow.test.ts`: `deploy.yml` deploys staging from `main`, production from `release` or either by hand, gated by `DEPLOY_ENABLED`, in `environment: deploy`.
- `tests/conventions/setup-vp-version.test.ts`: `setup-vp` pins the catalog `vite-plus`; Node comes from `.node-version`.
- `tests/conventions/reserved-collections.test.ts`: the `/v1/` segments of routes are the reserved collection names.
- `tests/conventions/admin-parity.test.ts`: the admin calls every MCP operation, or says why not.
- `tests/conventions/voice.test.ts`: no word Hollware never says; no price in public copy.
- `tests/conventions/issue-forms.test.ts`: the issue forms are valid for GitHub and ask what `CONTRIBUTING.md` says.
- `tests/conventions/advisory-url.test.ts`: one private vulnerability reporting address in the docs.
- `tests/conventions/principles.test.ts`: the README principles are the feature request dropdown options; no MCP tool manages people or tokens.
- `tests/conventions/code-of-conduct.test.ts`: no template placeholder, the issues as contact.
- `tests/conventions/personal-email.test.ts`: no personal email address in any file.
- `tests/conventions/invisible-characters.test.ts`: no text file but `INVISIBLE_CHARACTER_FILES` holds an invisible or bidirectional character.
- `tests/conventions/drizzle-api.test.ts`: `packages/server/src` uses neither `db.query` nor drizzle's `relations`.
- `tests/conventions/legacy-role.test.ts`: no package source reads `users.role`; the role of a person in a site is in `members`.
- `tests/conventions/admin-isolation.test.ts`: no code outside `packages/admin` imports `@hollware/admin`, but a project's `vite.config.ts` may import its root (`adminAssets()`).
- `tests/conventions/admin-messages.test.ts`: admin and site templates read every text from messages.
- `tests/conventions/public-api.test.ts`: `api/` is the code's public API; `scripts/api-check.test.ts`: a break needs a major or a line of `.changeset/accepted-breaks.json`, an rc none.
- `tests/conventions/comments.test.ts`: no comment but a bin's shebang, a top `/// <reference>`, a reasoned `@ts-expect-error` or `oxlint-disable-next-line`, theme markers, action pins, pnpm reasons, `ZIZMOR_IGNORES`, migration breakpoints, shipped migrations, TSDoc of public exports.
- `tests/conventions/doc-refs.test.ts`: no file cites a removed document (ADR, design, brand book) or an unknown threat id, but `DOC_REF_FILES` and shipped migrations.
- `tests/conventions/threats.test.ts`: each threat of `tests/security/threats.ts` cites existing tests or why it is accepted.
- `tests/conventions/workerd-tests.test.ts`: `*.workerd.test.ts` is the name of tests importing `vitest` or `cloudflare:*`; no `fsModuleCache: true`.
- `tests/meta/agents-paths.test.ts`: backticked paths in `AGENTS.md` and `README.md` files exist.
- `tests/meta/agents-commands.test.ts`: the `vp run`, `pnpm --filter` and `node` commands `AGENTS.md` cites exist.
- `tests/meta/markdown-links.test.ts`: relative links and anchors in every Markdown file lead somewhere.
- `tests/meta/package-lists.test.ts`: Layout, README table and changeset README list the real packages.
- `tests/meta/agents-size.test.ts`: every `AGENTS.md` stays within 12,000 characters.
- `tests/meta/test-projects.test.ts`: every test file is in a project of `vp test`, or in a directory with its own runner, a task of the root `vite.config.ts` that CI runs.
- `tests/meta/disabled-tests.test.ts`: no test is skipped, postponed, focused or conditioned, with no exception.
- `tests/meta/contributing.test.ts`: `CONTRIBUTING.md` agrees on Node.js, pnpm and the commands table.
- `tests/meta/exceptions.test.ts`: exception lists keep their recorded size; none lives outside `tests/guards/exceptions.ts`.
- `tests/meta/patches.test.ts`: a dependency patch starts with `PATCHED (reason)` and a test mentions it.
- `tests/meta/guards-registry.test.ts`: every guard file is cited here once, with what it binds, and the root `AGENTS.md` points here without repeating a line.
- `tests/meta/self-tests.test.ts`: every exported `check...` of a guard is called, directly or through a helper, in a `self-test` block that asserts with `expect(`.
- `tests/meta/scanners.test.ts`: the JSONC, Markdown, source, comment, syntax-tree, Vite+ task and workspace readers.
- `tests/ci/changeset-check.test.ts`: the changeset gate checks pull requests, pushes and manual runs, skipping only a branch creation and the Version Packages pull request of github-actions[bot] and its merge; it fails on a push whose previous tip is no ancestor.
- `tests/ci/promotion-check.test.ts`: the promotion gate refuses a commit not on `main`, a push that is no fast-forward or has no previous tip (but a manual run), and a pending changeset.
- `tests/ci/verify-and-publish.test.ts`: the `publish` job's shell verifies the plan and every tarball first, skips versions npm has, uses `--provenance`, refuses an answer for another version.
- `tests/ci/finalize-release.test.ts`: `finalize-release.sh` waits for every version live on npm with provenance, then tags and releases only the public packages the release commit bumped, with the right Latest, prerelease flags and notes; leaves what exists alone; fails on a later bump under an unknown title.
