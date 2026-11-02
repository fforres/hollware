# @hollware/server

The Hollware Worker: one handler per operation spec of `packages/core`, and the adapters that
serve them. Boundary rules for this package:

- It owns the D1 migrations in `migrations/` and ships them (`files` in `package.json`).
- A shipped migration is never edited or removed: fix forward with a new migration.
  The guard `shipped-migrations` compares `migrations/` with every `@hollware/server@*` tag.
- `src/db/schema.ts` is the schema. To change it, edit it and run
  `pnpm exec drizzle-kit generate --name <what>` here (`drizzle.config.ts`), then commit the SQL
  and its snapshot in `migrations/meta`. `tests/migrations.test.ts` fails while the schema has a
  change without its migration.
- What drizzle-kit does not model (triggers) and every table rebuild go in a hand-written
  migration, `drizzle-kit generate --custom --name <what>`, without the comment it writes.
- D1 keeps foreign keys on: a migration cannot drop or rebuild a table that rows point at (D1
  answers "internal error"). A column of such a table comes by `ADD COLUMN` without a CHECK, and
  `entries` and `revisions` point at each other with no foreign key.
- `revisions`, `revision_tags` and `publications` are append-only, through the triggers
  of `migrations/0002_append_only.sql`. A migration that rebuilds one of them creates its
  triggers again. A new column of them goes in its `_immutable` trigger or is listed as derived
  in `tests/append-only.workerd.test.ts`, and a new unique key goes in its `_no_replace` trigger.
- Never read `process.env`: configuration and bindings arrive as arguments.
- `src/ports.ts` is what the handlers need (`ContentStore`, `Clock`). Handlers (`src/ops`)
  import it and never `src/db`, so an adapter can hand them any store; their tests run on D1.
  `src/ops/types.ts` pairs one handler with each spec of `@hollware/core`, by type.
- `src/ops` has one module per operation and exports `handlers`. A handler imports the ports,
  `@hollware/core` and its siblings, never `src/db`, `src/mcp` or a `cloudflare:` module
  (`tests/ops/boundary.test.ts`). Adapters parse the input with the spec's schema, check the
  scopes and build the context; every store call takes `context.site.key` and every read
  `context.view` (`tests/ops/isolation.workerd.test.ts`).
- A draft is saved whatever its contracts say. Only a file the pipeline cannot store, a slug or
  translation group another entry holds, and a row over D1's limit are `refused`, with
  `contractsHash: ''`. `update_draft` and `publish` check the version first; `unchanged` writes
  nothing. `publish` runs the pipeline and the contracts again in the publish phase, blocks on
  errors, asks for every warning by contract and path, and records them
  (`tests/ops/publishing.workerd.test.ts`, `tests/ops/flow.workerd.test.ts`).
- `createHollware(config)` in `src/index.ts` is `createHollwareWith(config, handlers)`. The entry
  imports `cloudflare:workers`, so whatever imports it runs in workerd
  (`tests/index.workerd.test.ts`).
- Every method of the store takes the site first, and reads and writes only that site's rows.
- `src/db/` is the D1 store: `createD1Store(db, { clock? })` implements `ContentStore` over a
  `D1Database` or a D1 session, without a cast. A write is one `db.batch`: the revision or
  publication is inserted only while the entry is at `expectedVersion`, its tags only `WHERE
  EXISTS` their revision, and the entry is updated with the same predicate and `RETURNING`; an
  empty `RETURNING` is followed by one read that tells `conflict` from `not_found`
  (`tests/db/append-revision.workerd.test.ts` pins the SQL of the batch).
- Every statement of the store carries `site_id`, the follow-up reads included
  (`tests/db/isolation.workerd.test.ts` runs every method against two seeded sites).
- D1's limits are kept in code: at most 90 bound values per statement (`src/db/chunks.ts`),
  compound `SELECT`s of at most 5 terms (tags go in a `VALUES` list), and rows under
  `MAX_ROW_BYTES`, refused as `too_large` before they are written: Miniflare does not enforce
  D1's 2 MB.
- Listings read summaries (the revision's id, frontmatter and tags) from an index of `entries`
  and sort nothing: the published view names the literal `'published'`, and the cursor is the
  row value `(sort key, id) < (?, ?)` (`tests/db/list-plans.workerd.test.ts` reads
  `EXPLAIN QUERY PLAN`).
- `tests/support/sites.ts` seeds a whole site with SQL, with the same natural keys every
  time; the tests that check one site cannot reach another seed two.
- `src/mcp/annotations.ts` maps each effect to its MCP hints, and `src/limits.ts` holds the output
  cap, the timeouts (10 s, and 30 s for the open-world tools of the same file) and the store's
  limits under D1's.
- `src/auth` is what the gateway runs before the MCP endpoint, in this order:
  `checkHostAndOrigin` (fails closed: no valid `HOLLWARE_PUBLIC_URL` is a 500; another Host or
  Origin, port and scheme included, is a 403; `X-Forwarded-Host` counts for nothing),
  `readBearerToken`, then `checkPersonalToken` on the `D1Database` binding, never a replica
  session, so a revoked token stops at once. Hand its `touch` to `ctx.waitUntil`. A refused token
  gets one answer whether it was unknown, expired or revoked: log the reason, never send it.
  `ROLE_SCOPES` has a role per `members_role`; only `site:owner` parts an owner from an admin.
- `src/oauth` is the OAuth server, built once per public URL: an
  `OAuthAuthorizationServer` and an `OAuthResourceServer` each for `/mcp` and `/v1`. The resource
  server validates a token by its shape: `hw_pat_…` goes to `checkPersonalToken`, anything else to
  the authorization server, and either way the scopes are intersected with the user's role at that
  request. `/authorize` is ours (`authorize.ts`): the session cookie, then a consent page that
  offers only what the role allows. The admin is a registered public client, not a metadata
  document, which needs an `https` URL the Worker fetches from itself. A validator never throws
  to the library, which would answer a bare 503: it hands the error to the gateway, which throws
  it into the error handler.
- Reviews (v0.3): `publish` from a principal without `content:publish` runs the same checks and
  asks for a review (`src/db/reviews.ts`). Its entries are `review_items`, active while it is
  pending, one active per entry. A new revision of one cancels the review whole, in its batch.
  `approve_review` publishes one entry through `publish`, several in one batch.
- Agents: `src/events/agents.ts` delivers a site's `agents` their events with an hour's grant
  (`hw_agt_`, `src/auth/grant.ts`); an owner may also give an agent member a lasting personal
  token, an author's scopes at most.
- Drafts store and answer what `formatMarkdown` gives; `unchanged` compares that canonical form
  (`tests/ops/drafts.workerd.test.ts`).
- The trash of entries: `delete_entry` sets `entries.deleted_at` on a draft, and every read of the
  store (the contracts' lookups included) leaves a trashed entry out but `listEntries` with
  `trashed`; it keeps its slug and translation, so `create_draft` answers `in_trash`
  (`tests/ops/trash.workerd.test.ts`).
- `src/identity` is the sign-in: passkeys, providers (`federation.ts`, `jwt.ts`), invitations and
  sessions: `/setup`, `/signin`, the ceremonies, `/auth/federate/:provider` and its GET callback, and
  `POST /authorize/signout`, below the one path the session cookie is sent to. Only a verified email
  links, invites or provisions (`tests/identity/federation.workerd.test.ts`). A person manages their
  passkeys, grants and sessions over `/v1/admin/account`; the last passkey goes only with an identity
  left. `routes.ts` imports the ceremonies and the federation with `import()`, out of startup.
- `src/compose.ts`: `createHollwareWith(config, handlers, { clock? })` builds the Worker once,
  when the user's module loads: it resolves the config (a broken one throws its `ConfigError`
  there), builds the MCP endpoint, the gateway and the `Hollware` class. Every log line is one
  JSON line through `console.log`.
- `src/http` is the gateway, a Hono 5 app: a request id, then `checkHostAndOrigin` before every
  route, then `GET /health`, `/mcp` and `/v1` behind their resource servers (401 with the
  protected resource metadata before the endpoint, `touch` to `ctx.waitUntil`, a store on the
  primary), the authorization server's routes, the identity pages and a JSON 404. Whatever a route throws is a JSON 500 with the request id in its
  fix; a D1 failure is never a 401. Hono 5's `onError` and `notFound` are middleware `(c, next)`;
  the Hono 4 form answers a plain-text 500, so everything version-specific stays in
  `src/http/errors.ts`. A route's error reaches `onError` before any middleware around it, so a
  route catches what it answers itself (`src/http/read-api.ts`).
- `src/rpc` is what other Workers of the account call over a service binding: `src/rpc/AGENTS.md`.
- `src/mcp` is the MCP adapter: `createMcpEndpoint` returns `{ fetch(request, call) }`, which
  the gateway mounts at `/mcp` once per isolate, passing `{ principal, requestId, context }`.
  It sets the view (`head`) and the client itself, asks for each tool's scopes before its
  handler, answers errors as `{ code, message, fix }` without structured content (clients check
  structured content against the output schema even with `isError`), and asks 2026 clients that
  declared form elicitation to acknowledge the warnings of `publish` (MRTR). Do not read or
  rewrite the body or the `Mcp-*` headers before it.
- `src` type-checks with the Workers runtime types that `wrangler types` generates for
  `wrangler.jsonc` (the test configuration, without Node.js), and nothing else.
- Tests that need workerd (D1, `cloudflare:*`) are `*.workerd.test.ts` and run in
  `server:workerd`, on a local D1 with `migrations/` applied; the rest run in Node.

## Decisions

- Effects of a change (events, webhooks) go through the outbox, written in the batch of the
  change; never in `waitUntil`, which a Worker may cancel.
- The operation registry is the only schema: no `@hono/zod-openapi`. No Better Auth (four times
  the bundle, and `nodejs_compat`) and no Agents SDK (its own copy of the MCP SDK).
- An IP address is kept only as an HMAC under the site's key: a plain hash of one is reversible.
- An SVG is refused, never rewritten. Hollware never instruments a site's frontend: it reads the
  analytics the site already has. Semantic search is optional: without its bindings, full text.
- `HOLLWARE_EMBEDDING_MODEL` can change: the cron re-embeds what another model embedded. A model
  of other dimensions needs a Vectorize index of its own.

## Accepted on purpose

Do not "fix" these: each is a decision of the maintainer.

- A preflight answers for the origins of every site; the read that follows checks the token's.
- A read token is public once a browser has it: it reads only what the site publishes.
- A personal token may never expire, when its maker asks for that; given no days, it lasts 90.
- `GET /authorize` with a URL `client_id` fetches that URL: public addresses only, cached, capped.
- OAuth lifetimes are sized to the 1,000 KV writes a day of the Free plan.
- A draft's preview loads its images from their hosts (sandboxed, no referrer, no cookie).
- A site that renders Markdown with its own pipeline sanitizes it itself.
- An owner may point an analytics credential at a host of their choosing (`https://`, public).
- A translation or a comment of an agent reaches readers only through a person's approval, and
  any MCP client named `hollware-agents` is trusted as the agents.
- A holder of `schema:admin` creates sites without a cap.
- A push to `release` publishes with no second approval.
- Any Worker of the account with the service binding may read any site it names.
- A refusal before the site is known is logged in Workers Logs, not in the activity log.
