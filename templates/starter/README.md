# My Hollware

A [Hollware](https://hollware.com) project: a headless CMS on Cloudflare Workers that your agents
write to over MCP. Your sites, their collections and their rules live in the database: shape them
in the admin, or let an agent do it, and every write is checked against them. No deploy.

## What is inside

| Path                        | What it is                                                                         |
| --------------------------- | ---------------------------------------------------------------------------------- |
| `src/worker.ts`             | The Worker: `createHollware()` builds it                                           |
| `wrangler.jsonc`            | The Worker, its D1 database, KV namespace, queues, image bucket and public URL     |
| `vite.config.ts`            | Vite with the Cloudflare plugin, and the admin at `/admin/`                        |
| `vitest.config.ts`, `test/` | Tests that run inside workerd                                                      |
| `worker-configuration.d.ts` | The types of the bindings, from `wrangler types`. Refresh it when wrangler changes |
| `AGENTS.md`                 | What an agent that works on this project needs to know                             |

## Run it locally

```sh
pnpm dev     # http://localhost:5199: MCP at /mcp, the admin at /admin/
```

`npm create hollware` already applied the migrations to the local database and made your site,
its owner and a first token. To do it again on a new local database:

```sh
pnpm exec hollware migrate --local
pnpm exec hollware init --site my-site --owner-email you@example.com --local   # --preset, --locales
```

`init` prints a personal token once, and a link to set up your passkey for the admin. Give the
token to your agent:

```sh
claude mcp add --transport http hollware http://localhost:5199/mcp --header "Authorization: Bearer <token>"
```

## Deploy it

```sh
pnpm exec wrangler login
pnpm run deploy                              # creates the database, KV, queues and bucket, and migrates
pnpm exec hollware init --site my-site --owner-email you@example.com --remote
```

The first deploy writes the public URL of the Worker into `wrangler.jsonc`: commit it. `pnpm run doctor` checks the project and says what to fix.

## Read it from a site

A Worker on the same account reads what you publish over a service binding, with no network and
no token. Any other site reads it over HTTP with a read token: `hollware token create --read`.

## Commands

| Command            | What it does                                         |
| ------------------ | ---------------------------------------------------- |
| `pnpm dev`         | Serve the Worker locally                             |
| `pnpm build`       | Build the Worker into `dist/`                        |
| `pnpm test`        | Run the tests in workerd                             |
| `pnpm run deploy`  | Deploy to Cloudflare and migrate the remote database |
| `pnpm run doctor`  | Check the project, its database and its owner        |
| `pnpm types`       | Regenerate `worker-configuration.d.ts`               |
| `pnpm types:check` | Fail when `worker-configuration.d.ts` is out of date |

## Upgrade Hollware

Move `hollware`, `@hollware/core`, `@hollware/server` and `@hollware/admin` to one new version
together, compare the project with one made by `create-hollware` of that version, test, and deploy:
https://hollware.com/docs/upgrade/
