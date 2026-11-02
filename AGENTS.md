# AGENTS.md

Hollware is an open-source headless CMS for the agent era, native to Cloudflare
Workers. Agents write Markdown through MCP, contracts validate every write, D1 is
the single source of truth, and sites read published content over Workers RPC.
Its look is the theme that the site and the admin share
(`apps/web/app/assets/css/main.css`); how it speaks is in `apps/web/AGENTS.md`.

This file orients. Rules live in tests, lint rules or types: if a test could hold
a claim, the claim belongs in a test.

## Commands

| Command                       | What it does                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------ |
| `pnpm install`                | Install dependencies (pnpm version comes from `packageManager`)                                  |
| `vp check`                    | Format, lint and type-check the whole repo                                                       |
| `vp test`                     | Run every test project; `vp test --project <name>` runs one                                      |
| `vp run -r build`             | Build every package                                                                              |
| `vp run bench`                | Benchmark the Markdown pipeline: fails when a write takes over 3 ms of CPU at p95                |
| `vp run check:budgets`        | Fails when the built Worker is over a ceiling of `budgets.json`; logs its startup                |
| `vp run check:push`           | The CI check job: check, test, bench, build, budgets, publint, types                             |
| `vp run check:local`          | Pre-push hook: CI but e2e:install and e2e:upgrade, on a clean tree; a passed tree pushes at once |
| `vp run test:conformance`     | MCP conformance: the suite against `wrangler dev`, for both revisions                            |
| `vp run test:acceptance`      | The acceptance suite of the stage, against the built playground and example site                 |
| `vp run e2e:admin`            | Admin in Chromium, virtual passkey and axe (`playwright install chromium` once)                  |
| `vp run e2e:install`          | `create-hollware` from this checkout, then MCP, publish and a read token                         |
| `vp run e2e:upgrade`          | A project of 0.3.0 (`-- --from <version>`) from npm, moved here and migrated                     |
| `vp run e2e:integrations`     | The Nuxt, Astro and React Router examples over the built playground, previews too                |
| `vp run eval:search`          | Search quality against a deployment with semantic search (`-- --hollware <url>`)                 |
| `node scripts/api.ts --write` | Writes the public API, `api/`; `api-check.ts --against <ref>`: breaks                            |

The mutation probe, `node scripts/break-line.ts --file <f> --find <s> --replace <s> -- <cmd>`,
prints `CAUGHT`, `NOT CAUGHT` or `ERROR`.

Always run the project-local `vp` (`pnpm exec` or package scripts). A
global `vp` of another version breaks the Cloudflare plugin. Supervised servers are
started with their local binary, never with `pnpm dev`: pnpm 12 runs scripts in a
new process group, so the child outlives its supervisor.

## Workers in this repo

- The playground is a Hollware project (`apps/playground/src/index.ts` is `createHollware(config)`),
  and `examples/worker-site` is the site that reads it over a service binding. The playground has
  two test projects: `playground:workerd` (inside workerd, through `@cloudflare/vitest-plugin`) and
  `playground:harness` (Node, wrangler's `createTestHarness` over the built Workers). Run both with
  `pnpm --filter @hollware/playground run test`.
- The tests of `packages/core` run in Node and again inside workerd (`core:workerd`), and
  its `src` type-checks against the web platform only.
- Tests that import from `vitest` or `cloudflare:test` are named `*.workerd.test.ts`.
- `vp dev` starts through a launcher: stopping it leaves the dev server and
  workerd running; stop the process that listens on the port.
- `compatibility_date` must not be newer than the workerd that wrangler bundles.
- Workers turn Node.js compatibility on by default from the 2026-08-04 compatibility date.
  Every `wrangler.jsonc` here opts out with `no_nodejs_compat` and `no_nodejs_compat_v2`,
  and Hollware's own set `send_metrics: false`.
- The test runner of `@cloudflare/vitest-plugin` keeps Node.js compatibility on whatever
  the flags say, so a workerd test never proves that code runs without Node.js; the
  playground's harness test does, on the built Workers.
- Harness tests reach Hollware at `http://localhost` and give the Worker that URL as
  its `HOLLWARE_PUBLIC_URL`: the harness hands a Worker every URL as `http`, and the OAuth
  server takes `http` only on a loopback host. Build the harness with `createPlaygroundHarness()`
  from `apps/playground/test/harness/workers.ts`. Hollware is its primary Worker, so
  `server.fetch('http://localhost/...')` carries the Host its guard compares; a request sent
  straight to a Worker (`server.getWorker(name).fetch`) carries the harness's own Host, so only the
  site is reached that way (`siteFetch`). Content is created as an agent creates it, through
  `agentWith(...)` and MCP; the personal token that lets it in (`seedOwnerToken(...)`, in
  `apps/playground/test/harness/support.ts`) is the one thing a test writes to D1 itself.
- Cloudflare's `Service<...>` turns an RPC answer that holds `unknown` (frontmatter, a document)
  into `never`: read a binding through `HollwareRpc` of `@hollware/server` (see
  `examples/worker-site/src/env.ts`).
- The `Probe` entrypoint of the playground (`apps/playground/src/probe.ts`) and of the example
  (`examples/worker-site/src/probe.ts`), each bound to itself as `PROBE`, is how a Node.js test asks
  a built Worker for its Node.js globals. It is no route, so the gateway's guard has no exception.
- `budgets.json` holds the ceilings of the built playground Worker, minified and gzipped (main
  module 250 KiB, all modules 462 KiB; the CPU of a write is `vp run bench`'s); raising one says why in its `reason`.
  `scripts/check-budgets.ts` fails above a ceiling, keeps Comark and `@comark/html` in lazy chunks
  (read from the source maps of the build), and logs startup and the cost of a write.
- The conformance Worker (`tests/conformance/worker`) runs under `wrangler dev`, never `vp dev`:
  Vite's host check would answer first and hide a missing DNS-rebinding guard. The run resets
  its local D1, seeds it with the CLI, and CI runs it in a job of its own.
- Test content is synthetic and shared: load it with `tests/fixtures/content.ts`, in Node
  or workerd (`tests/fixtures/README.md`). Rows of a second site, to test that one site
  cannot reach another, come from `packages/server/tests/support/sites.ts`.

## Layout

- `packages/core` — contracts, operation specs, schemas, Markdown pipeline. No Cloudflare imports.
- `packages/server` — the Worker: operation handlers, MCP, RPC, HTTP, auth, D1 migrations.
- `packages/client` — the same interface over a service binding or HTTP.
- `packages/admin` — the review and approval UI, prebuilt.
- `packages/cli` — the `hollware` CLI.
- `packages/create-hollware` — `npm create hollware`.
- `packages/nuxt` — `@hollware/nuxt`: reads Hollware from a Nuxt site.
- `packages/astro` — `@hollware/astro`: Astro content loaders for Hollware.
- `packages/react` — `@hollware/react`: Hollware for React apps.
- `packages/vue` — `@hollware/vue`: Hollware for Vue apps.
- `packages/agents` — `@hollware/agents`: a reviewer, a translator and an auditor that never publish.
- `apps/playground` — a local Hollware instance for development.
- `apps/web` — hollware.com: the landing page and the docs, read from Hollware.
- `templates/starter` — the thin project users get.
- `examples/worker-site` — a blog on a Worker that reads Hollware over a service binding.
- `examples/nuxt-blog` — a Nuxt blog on a Worker that reads Hollware through `@hollware/nuxt`.
- `examples/astro-blog` — an Astro blog on a Worker, through `@hollware/astro`.
- `examples/react-router-blog` — a React Router blog.
- `examples/agents-worker` — the Worker of `@hollware/agents` for the playground's blog.
- `tests/conformance/worker` — the Hollware Worker that the MCP conformance suite runs against.

## Conventions

- Everything in the repository is written in English.
- Conventional Commits. A change that touches a published package carries a
  changeset (`pnpm exec changeset`).
- There is no `CLAUDE.md` and there must never be one: agents read this file.
- Dependencies come from the pnpm catalog in `pnpm-workspace.yaml`: exact versions,
  published at least 24 hours before they are pinned. Never lower
  `minimumReleaseAge`; an urgent fix gets an exact `minimumReleaseAgeExclude` entry
  with a reason and an expiry date.
- Every bare import is declared in the importing package's `package.json`.
- Inside the workspace a package resolves to its source: `exports` and `bin` point at
  the source, and only `publishConfig` points at the build. Nothing needs a
  build to type-check or test; `vp pack` writes those fields from each package's
  `vite.config.ts`, so change them there.
- Packages never read `process.env`; configuration arrives as arguments.
- A promise is always awaited or explicitly handled: Workers cancel the rest.
- No comments and no free prose: the code says what it does and why. A product decision goes,
  in one line, in the AGENTS.md of its boundary, and only when an agent needs it.

## Decisions

- Cloudflare only: native primitives, no provider abstraction. One deployment per account; its
  sites are isolated by `site_id`, not by tenant infrastructure.
- A site's structure is data in D1, changed over MCP with no deploy.
- Semver covers `api/` and only it: `/v1/admin`, the text of messages and descriptions, logs,
  the playground, the examples and hollware.com are outside it.

## Test bar

- For every test, name the production line that must change for it to fail. If
  you can't, the test is tautological: strengthen it or delete it.
- Expected values are literals or worked examples, never recomputed the way the
  code computes them.
- An assertion that only checks `toBeDefined()` or `toBeTruthy()` is not a test.
- Mock only what you don't own. Your own modules and the database stay real (D1
  runs in Miniflare).
- Two tests killed by the same mutation are one test.
- There is no coverage threshold. Mutations are the measure: break the line with
  `scripts/break-line.ts` and expect `CAUGHT`, which means the command passes as it is and
  fails with the line broken. Then read which test failed. `NOT CAUGHT` means nothing guards
  the line. `ERROR` is no verdict: the command already fails, timed out or was interrupted.
  Fix that and rerun.

## Verification surface

Every invariant this repository claims about itself is bound to a mechanism that
fails when the claim stops being true. When a change adds a source of truth, an
invariant or a convention, bind it to a test, a lint rule or a type in the same
change, and record it: a guard gets its line in the registry of `tests/AGENTS.md`. Never weaken
or delete a guard to make a change pass.

## Guards

What each guard binds, and how to write one, is in `tests/AGENTS.md`. A new guard adds its line there.

## Updating dependencies

1. Check what is outdated with `pnpm outdated -r`.
2. Pick versions published more than 24 hours ago and update the catalog.
3. Run `pnpm install`, then `vp run check:push`.
4. Read the changelogs of anything 0.x or pre-release before committing, and
   record notable changes in the commit message.
5. hono stays a 5.0 candidate (fallback 4.13.13); `@modelcontextprotocol/conformance`
   an alpha, as only 0.2 has the 2026-07-28 requirements.
