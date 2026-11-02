import type { Threat } from '../guards/threats.ts'

export const RETIRED_THREATS: readonly string[] = ['T-06', 'T-07', 'T-08', 'T-09']

export const THREATS: readonly Threat[] = [
  {
    id: 'T-01',
    area: 'Gateway',
    threat:
      "DNS rebinding: a page on an attacker's name that resolves to the Worker calls `/mcp` or `/v1` with a person's local or forwarded credentials",
    mitigation:
      '`Host` must equal the host of `HOLLWARE_PUBLIC_URL` (port included, case-insensitive); `X-Forwarded-Host` and `Forwarded` ignored; checked before any route and any D1 query',
    guards: [
      {
        file: 'packages/server/tests/auth/guard.test.ts',
        test: 'answers 403 to %s, without repeating it',
      },
      {
        file: 'packages/server/tests/http/guard.workerd.test.ts',
        test: 'answers $name before ${route}',
      },
      {
        file: 'packages/server/tests/http/guard.workerd.test.ts',
        test: 'does not look at the token of a request for another host',
      },
      {
        file: 'apps/playground/test/harness/gateway.test.ts',
        test: 'refuses a request for another Host with 403, even with a valid token',
      },
    ],
  },
  {
    id: 'T-02',
    area: 'Gateway',
    threat:
      'Cross-site request from a browser (CSRF on `POST /authorize`, `/auth/*`, `/v1/ops/*`, `/mcp`)',
    mitigation:
      'A present `Origin` other than the public origin is 403, `null` and empty included; only `GET`/`HEAD`/`OPTIONS` of the read API accept other origins',
    guards: [
      {
        file: 'packages/server/tests/auth/guard.test.ts',
        test: 'answers 403 to %s, without repeating it',
      },
      { file: 'packages/server/tests/auth/guard.test.ts', test: 'checkHostAndOrigin: the Origin' },
      {
        file: 'apps/playground/test/harness/gateway.test.ts',
        test: 'refuses a request with another Origin with 403, even with a valid token',
      },
    ],
  },
  {
    id: 'T-03',
    area: 'Gateway',
    threat: 'The guard skipped when `HOLLWARE_PUBLIC_URL` is missing or malformed (fail open)',
    mitigation: '500 `misconfigured` for every route, `/health` included',
    guards: [
      {
        file: 'packages/server/tests/http/guard.workerd.test.ts',
        test: 'answers $name before ${route}',
      },
      {
        file: 'apps/playground/test/harness/gateway.test.ts',
        test: 'answers 500 to every request, /health included, and says what to set',
      },
    ],
  },
  {
    id: 'T-04',
    area: 'Gateway',
    threat:
      "CORS: a page of an unlisted origin, or of another site's origin, reads the read API with a token",
    mitigation:
      "The guard lets listed origins through only for reads of `/v1/*` outside `/v1/admin/`; the read checks the origin against the token's site and answers 403 readable only by Hollware's origin",
    guards: [
      {
        file: 'packages/server/tests/http/read-tokens.workerd.test.ts',
        test: 'refuses an origin no site lists, and one the site of the token does not list',
      },
      {
        file: 'packages/server/tests/http/read-tokens.workerd.test.ts',
        test: 'lets a listed origin reach nothing but the read API',
      },
    ],
  },
  {
    id: 'T-05',
    area: 'Gateway',
    threat: "A preflight is answered for the origins of every site, not the token's",
    accepted:
      "The preflight carries no token; the read that follows checks the origin against the token's site",
  },
  {
    id: 'T-10',
    area: 'Gateway',
    threat:
      'Request floods: no rate of requests is limited on any route (`/auth/*`, `/authorize`, `/oauth/token`, 401s), on a Free plan of 100,000 requests and 10 ms of CPU a day',
    mitigation:
      'Fixed: with a Workers Rate Limiting binding (`HOLLWARE_RATE_LIMIT`, in the starter and the demo: 60 a minute), the routes without a token (`/auth/*`, `/oauth/token`, `/oauth/register`) answer 429 past the limit, per address and route; routes behind a token are not limited',
    guards: [
      {
        file: 'packages/server/tests/http/rate-limit.workerd.test.ts',
        test: 'answers 429 past the limit, per address and route',
      },
      {
        file: 'packages/server/tests/http/rate-limit.workerd.test.ts',
        test: 'limits nothing without a binding, and never a route behind a token or a read',
      },
    ],
  },
  {
    id: 'T-11',
    area: 'Gateway',
    threat:
      'Unauthenticated D1 writes: every `POST /auth/signin/options` inserts an `auth_challenges` row that is never purged unless taken, and expired sessions are never dropped',
    mitigation:
      'Fixed: the cron trigger drops the expired sessions and the challenges nobody took, once a run (`dropExpired`), and the rate limit of T-10 caps how fast anyone can make them',
    guards: [
      {
        file: 'packages/server/tests/http/cron-cleanup.workerd.test.ts',
        test: 'drops the challenges, sessions and agent grants that expired, the revoked grants, and keeps the others',
      },
    ],
  },
  {
    id: 'T-12',
    area: 'Gateway',
    threat: 'An error answer leaks a stack, a query or a D1 message',
    mitigation: 'JSON 500 with the request id; the cause goes to the log',
    guards: [
      {
        file: 'packages/server/tests/http/routes.workerd.test.ts',
        test: 'sends nothing of the cause, and logs it under the same id',
      },
      {
        file: 'packages/server/tests/rpc/methods.workerd.test.ts',
        test: 'is internal for the caller, who gets the id of the call and none of the cause, which goes to the log',
      },
    ],
  },
  {
    id: 'T-13',
    area: 'Gateway',
    threat: 'A 401 tells an unknown token from an expired or revoked one',
    mitigation: 'One answer for every refusal; the reason goes to the log only',
    guards: [
      {
        file: 'packages/server/tests/http/auth.workerd.test.ts',
        test: 'is refused with 401 when it is %s, and says nothing of why',
      },
    ],
  },
  {
    id: 'T-14',
    area: 'Gateway',
    threat: 'A token in the query string ends in logs, referrers and history',
    mitigation: 'Only `Authorization: Bearer` is read',
    guards: [
      {
        file: 'packages/server/tests/auth/bearer.test.ts',
        test: 'never reads a token from the URL',
      },
    ],
  },
  {
    id: 'T-15',
    area: 'Tokens',
    threat: 'Guessing a token',
    mitigation: '52 characters of 5 uniform bits from `crypto.getRandomValues` (260 bits)',
    guards: [
      {
        file: 'packages/core/tests/tokens.test.ts',
        test: 'turns each random byte into one character, from its low 5 bits',
      },
      {
        file: 'packages/core/tests/tokens.test.ts',
        test: 'refuses randomness of any other length',
      },
    ],
  },
  {
    id: 'T-16',
    area: 'Tokens',
    threat: 'A database leak gives working tokens',
    mitigation: 'Only the SHA-256 is stored; the secret is answered once',
    guards: [
      {
        file: 'packages/core/tests/tokens.test.ts',
        test: 'hashes the whole token with SHA-256, in lowercase hex',
      },
      {
        file: 'packages/server/tests/http/admin-api.workerd.test.ts',
        test: 'make a token with the scopes its maker has, once in clear, and revoke it',
      },
    ],
  },
  {
    id: 'T-17',
    area: 'Tokens',
    threat: 'An expired token still works',
    mitigation: 'Expired at the instant of expiry; an unreadable expiry is expired',
    guards: [
      {
        file: 'packages/server/tests/auth/token.workerd.test.ts',
        test: 'reads an expiry of %s (%s) as %s',
      },
    ],
  },
  {
    id: 'T-18',
    area: 'Tokens',
    threat: 'A revoked token still works, or works for a while on a replica',
    mitigation: 'Any `revoked_at` refuses; lookup on the primary binding',
    guards: [
      {
        file: 'packages/server/tests/auth/token.workerd.test.ts',
        test: 'refuses a token revoked with %s, and never records it as used',
      },
      {
        file: 'packages/server/tests/http/auth.workerd.test.ts',
        test: 'looks the token up on the primary database, in the tokens of this site',
      },
    ],
  },
  {
    id: 'T-19',
    area: 'Tokens',
    threat: "A token keeps scopes its user's role lost",
    mitigation: 'Token or grant scopes intersected with the role read at every request',
    guards: [
      {
        file: 'packages/server/tests/auth/token.workerd.test.ts',
        test: 'reads the role at every request: demoting the owner takes the scopes away at once',
      },
      {
        file: 'packages/server/tests/oauth/flow.workerd.test.ts',
        test: 'does what the role allows at each request: a demoted owner loses publish at once',
      },
    ],
  },
  {
    id: 'T-20',
    area: 'Tokens',
    threat: 'A removed member keeps access',
    mitigation: 'The membership row is the key of every token and grant',
    guards: [
      {
        file: 'packages/server/tests/http/admin-api.workerd.test.ts',
        test: 'give a member another role, and remove one, whose token stops working at once',
      },
      {
        file: 'packages/server/tests/oauth/flow.workerd.test.ts',
        test: 'is refused at once when the person is no longer a member of the site',
      },
    ],
  },
  {
    id: 'T-21',
    area: 'Tokens',
    threat: 'A token of one site acts on another site',
    mitigation: 'A token or grant names one site and acts on it alone',
    guards: [
      {
        file: 'packages/server/tests/auth/token.workerd.test.ts',
        test: 'treats a token of another site as unknown, exactly like a token nobody made',
      },
      {
        file: 'packages/server/tests/oauth/flow.workerd.test.ts',
        test: 'is refused by the deployment of another site, though it shares the KV and the URL',
      },
      {
        file: 'packages/server/tests/http/compose.workerd.test.ts',
        test: 'serves every site of a config with two sites: a token acts on its own site, and only on it',
      },
    ],
  },
  {
    id: 'T-22',
    area: 'Tokens',
    threat: 'A read token writes, reads drafts or reaches the admin',
    mitigation:
      'Prefix and row kind must agree; a read principal keeps `content:read` only and is refused outside `GET /v1`',
    guards: [
      {
        file: 'packages/server/tests/http/read-tokens.workerd.test.ts',
        test: 'reads over the read API, and is refused by MCP, the operations and the admin',
      },
      {
        file: 'packages/server/tests/auth/token.workerd.test.ts',
        test: 'accepts a read token as a read principal that may only read, whatever its row holds',
      },
      {
        file: 'packages/server/tests/auth/token.workerd.test.ts',
        test: 'refuses a token whose prefix is not the kind of its row, as unknown',
      },
    ],
  },
  {
    id: 'T-23',
    area: 'Tokens',
    threat: 'A read token shipped to browsers is public',
    accepted: 'It reads only what the site publishes; it can be revoked',
  },
  {
    id: 'T-24',
    area: 'Tokens',
    threat:
      '`/v1/admin/*` reached by a personal token, by another OAuth client, or without `schema:admin`',
    mitigation:
      "The admin's routes take an OAuth token of the admin's own client only, checked after the audience and the scopes",
    guards: [
      {
        file: 'packages/server/tests/oauth/flow.workerd.test.ts',
        test: 'refuse a token of another client, even for /v1 with schema:admin, the admin alone may use',
      },
    ],
  },
  {
    id: 'T-25',
    area: 'Tokens',
    threat: 'A person mints a token with more than they have',
    mitigation: "Asked scopes intersected with the person's; a read token stores `content:read`",
    guards: [
      {
        file: 'packages/server/tests/http/admin-api.workerd.test.ts',
        test: 'make a token with the scopes its maker has, once in clear, and revoke it',
      },
      {
        file: 'packages/server/tests/http/admin-api.workerd.test.ts',
        test: 'make a read token that reads and nothing else, whatever scopes it asks for',
      },
    ],
  },
  {
    id: 'T-26',
    area: 'Tokens',
    threat: 'A token copied into the config of an agent lives for ever',
    mitigation:
      'A personal token expires after 90 days unless the person asks for one that never expires, in the CLI and the admin; revocation ends it at once',
    guards: [
      {
        file: 'packages/server/tests/http/admin-api.workerd.test.ts',
        test: 'make a personal token that expires after 90 days when no days are given, one that never does when asked, a read token that never expires, and one with its days',
      },
      {
        file: 'packages/cli/tests/token.test.ts',
        test: 'asks for the site and the owner, inserts the token and prints it once',
      },
    ],
  },
  {
    id: 'T-27',
    area: 'Tokens',
    threat: 'A site loses its last owner',
    mitigation: 'The statement that demotes or removes counts the other owners',
    guards: [
      {
        file: 'packages/server/tests/http/admin-api.workerd.test.ts',
        test: 'keep the last owner of the site: neither demoted nor removed until another owner exists',
      },
    ],
  },
  {
    id: 'T-28',
    area: 'Tokens',
    threat: 'An invitation makes an owner',
    mitigation:
      'Admin, editor, author or reviewer only; an owner is made from a member, by an owner',
    guards: [
      {
        file: 'packages/server/tests/http/admin-api.workerd.test.ts',
        test: 'invite an editor or an author with a link to /setup, and never an owner',
      },
      {
        file: 'packages/server/tests/http/invitations.workerd.test.ts',
        test: 'let an admin invite up to an admin, and never an owner',
      },
    ],
  },
  {
    id: 'T-29',
    area: 'OAuth (workers-oauth-provider 1.2.3)',
    threat: 'SSRF through a Client ID Metadata Document URL',
    mitigation:
      '`global_fetch_strictly_public` in every Hollware Worker; the library refuses CIMD without it, caps the document at 5 KiB and 10 s',
    guards: [
      {
        file: 'tests/conventions/wrangler-flags.test.ts',
        test: 'every Worker opts out of Node.js compatibility, and Hollware sends no wrangler telemetry',
      },
      {
        file: 'tests/conventions/wrangler-flags.test.ts',
        test: 'holds a Worker of Hollware to the OAuth server: the flag, and OAUTH_KV in every environment',
      },
    ],
  },
  {
    id: 'T-30',
    area: 'OAuth (workers-oauth-provider 1.2.3)',
    threat:
      'An unauthenticated `GET /authorize?client_id=https://…` makes the Worker fetch any public URL (it parses the request before it looks for a session)',
    accepted: 'Public addresses only, Cache API, size and time caps of the library',
  },
  {
    id: 'T-31',
    area: 'OAuth (workers-oauth-provider 1.2.3)',
    threat: 'A redirect URI that is not exactly the registered one',
    mitigation: 'The library compares exactly',
    guards: [
      {
        file: 'packages/server/tests/oauth/hardening.workerd.test.ts',
        test: 'a redirect URI other than the one registered, and sends nothing to it',
      },
    ],
  },
  {
    id: 'T-32',
    area: 'OAuth (workers-oauth-provider 1.2.3)',
    threat: 'PKCE `plain`, or no PKCE',
    mitigation: 'The library advertises and accepts S256 only, and requires PKCE of public clients',
    guards: [
      {
        file: 'packages/server/tests/oauth/hardening.workerd.test.ts',
        test: 'PKCE plain, and no PKCE at all',
      },
    ],
  },
  {
    id: 'T-33',
    area: 'OAuth (workers-oauth-provider 1.2.3)',
    threat: 'A token for one resource used on the other (RFC 8707)',
    mitigation: 'Audience checked per resource',
    guards: [
      {
        file: 'packages/server/tests/oauth/flow.workerd.test.ts',
        test: 'is refused at /v1: it was issued for /mcp',
      },
    ],
  },
  {
    id: 'T-34',
    area: 'OAuth (workers-oauth-provider 1.2.3)',
    threat: 'A stolen refresh token is replayed',
    mitigation:
      'Rotation on use; the library takes the previous refresh token again (for a lost answer) and would take it forever. Fixed around it (`server/src/oauth/refresh-reuse.ts`): a spent refresh token that comes back more than 60 seconds after the rotation that spent it revokes the grant, with every token of it, and is a line of the activity log',
    guards: [
      {
        file: 'packages/server/tests/oauth/flow.workerd.test.ts',
        test: 'takes a spent refresh token again within a minute, for an answer that was lost',
      },
      {
        file: 'packages/server/tests/oauth/flow.workerd.test.ts',
        test: 'revokes the grant when a spent refresh token comes back after the grace',
      },
      {
        file: 'packages/server/tests/oauth/flow.workerd.test.ts',
        test: 'revokes it too when the spent token comes with the media type in capitals',
      },
    ],
  },
  {
    id: 'T-35',
    area: 'OAuth (workers-oauth-provider 1.2.3)',
    threat:
      'Refreshes exhaust the 1,000 KV writes a day of the Free plan, which stops OAuth for everyone',
    accepted: 'Lifetimes sized to the budget',
  },
  {
    id: 'T-36',
    area: 'OAuth (workers-oauth-provider 1.2.3)',
    threat: 'Dynamic client registration open by default',
    mitigation: 'Off unless `auth.dynamicClientRegistration`',
    guards: [
      {
        file: 'packages/server/tests/oauth/flow.workerd.test.ts',
        test: 'names its endpoints and takes metadata documents, and has no registration by default',
      },
      {
        file: 'apps/playground/test/harness/gateway.test.ts',
        test: 'publishes its metadata, takes metadata documents of clients, and lets none register',
      },
    ],
  },
  {
    id: 'T-37',
    area: 'OAuth (workers-oauth-provider 1.2.3)',
    threat: 'CSRF on the consent `POST /authorize`',
    mitigation:
      "The consent form is bound to the browser that opened it (a `__Host-` cookie); a form from another session grants that session's person their own access only",
    guards: [
      {
        file: 'packages/server/tests/oauth/hardening.workerd.test.ts',
        test: 'a consent posted without the cookie that binds it, and grants another person only their own',
      },
    ],
  },
  {
    id: 'T-38',
    area: 'OAuth (workers-oauth-provider 1.2.3)',
    threat: 'Clickjacking of consent, sign-in, setup or the admin',
    mitigation: "`frame-ancestors 'none'`",
    guards: [
      {
        file: 'packages/server/tests/oauth/flow.workerd.test.ts',
        test: 'offers only the scopes the role allows of those asked, on a page nothing frames',
      },
      {
        file: 'packages/server/tests/http/admin.workerd.test.ts',
        test: 'serves its page, at every path of the app, with a policy that frames nothing',
      },
      {
        file: 'apps/playground/test/harness/identity.test.ts',
        test: 'serves the setup page under a policy that frames nothing and runs only its own script',
      },
    ],
  },
  {
    id: 'T-39',
    area: 'OAuth (workers-oauth-provider 1.2.3)',
    threat: "A forged consent form grants more scopes, or another person's site",
    mitigation: "Scopes cut to the chosen site's role; a site the person is not a member of is 403",
    guards: [
      {
        file: 'packages/server/tests/oauth/flow.workerd.test.ts',
        test: 'asks which site when the person is in two, and grants the one they choose, if theirs',
      },
    ],
  },
  {
    id: 'T-40',
    area: 'OAuth (workers-oauth-provider 1.2.3)',
    threat: 'XSS on the consent page through a client name or redirect host',
    mitigation: 'Every client string escaped',
    guards: [
      {
        file: 'packages/server/tests/oauth/hardening.workerd.test.ts',
        test: 'a client name as markup on the consent page',
      },
    ],
  },
  {
    id: 'T-41',
    area: 'OAuth (workers-oauth-provider 1.2.3)',
    threat: 'The session cookie is read by scripts, sent cross-site, or sent beyond `/authorize`',
    mitigation: '`HttpOnly; Secure; SameSite=Lax; Path=/authorize; Max-Age=43200`',
    guards: [
      {
        file: 'apps/playground/test/harness/identity.test.ts',
        test: 'registers a passkey through an invitation, once, and signs in with it',
      },
    ],
  },
  {
    id: 'T-42',
    area: 'OAuth (workers-oauth-provider 1.2.3)',
    threat: '`/mcp` or `/v1` accepts the session cookie',
    mitigation: "Bearer only, and the cookie's path keeps browsers from sending it",
    guards: [
      {
        file: 'packages/server/tests/oauth/hardening.workerd.test.ts',
        test: 'a session cookie in place of a token, at /mcp and at /v1',
      },
    ],
  },
  {
    id: 'T-43',
    area: 'OAuth (workers-oauth-provider 1.2.3)',
    threat:
      "Open redirect after sign-in: `/signin?return_to=/%5Cevil.example` (or `/%09/evil.example`) passes the `startsWith('/') && !startsWith('//')` check, and the browser reads `/\\evil.example` as `//evil.example`",
    mitigation:
      "Fixed: `sameOriginTarget` reads `return_to` as a URL against the page's own origin, as the browser will, and goes there only when the origins match, with the path, query and fragment it resolves to; the page runs that very function",
    guards: [
      {
        file: 'packages/server/tests/identity/return-to.test.ts',
        test: 'sends %j to the admin, not to another host',
      },
      {
        file: 'packages/server/tests/identity/return-to.test.ts',
        test: 'is the function the page runs',
      },
      {
        file: 'tests/e2e/admin.e2e.ts',
        test: 'signing in goes back to a page of this Hollware, and never to another host',
      },
    ],
  },
  {
    id: 'T-44',
    area: 'OAuth (workers-oauth-provider 1.2.3)',
    threat:
      'A stolen or shared session lasts its 12 hours: there is no sign-out, no list of sessions and no revocation',
    mitigation:
      'Sign-out ends this browser\'s session row and clears its cookie (Origin guard, `SameSite=Lax`); "Sign out everywhere" deletes every session row of the person and revokes the admin\'s grants, so every browser signs in with a passkey again. No list of single sessions; removing a passkey or a member does not end sessions',
    guards: [
      {
        file: 'packages/server/tests/http/account.workerd.test.ts',
        test: "ends every session of the person, and the admin's grants, and no one else's",
      },
      {
        file: 'packages/server/tests/http/account.workerd.test.ts',
        test: 'signs one browser out: its session and cookie end, the other browser stays in',
      },
      {
        file: 'packages/admin/tests/auth.test.ts',
        test: 'signs out: revokes the refresh token, ends the session of the cookie, lands on sign-in',
      },
      {
        file: 'tests/e2e/admin.e2e.ts',
        test: 'the owner sees their passkey and the admin in Tu cuenta, then signs out',
      },
    ],
  },
  {
    id: 'T-45',
    area: 'OAuth (workers-oauth-provider 1.2.3)',
    threat:
      'A person cannot see or revoke the OAuth clients they connected (a grant lives 30 days, refreshed)',
    mitigation:
      "The account page lists the person's grants (`listUserGrants`: client name, scopes, site, when) and revokes one of them (`revokeGrant`), only among the person's own and never the admin's, which ends by signing out",
    guards: [
      {
        file: 'packages/server/tests/http/account.workerd.test.ts',
        test: 'lists each grant with its client, scopes and site, and marks the admin',
      },
      {
        file: 'packages/server/tests/http/account.workerd.test.ts',
        test: "revokes one, whose tokens stop at once, and refuses the admin's",
      },
      {
        file: 'packages/server/tests/http/account.workerd.test.ts',
        test: "refuses another person's grant, which keeps working",
      },
      {
        file: 'tests/e2e/admin.e2e.ts',
        test: 'the owner sees their passkey and the admin in Tu cuenta, then signs out',
      },
    ],
  },
  {
    id: 'T-46',
    area: 'OAuth (workers-oauth-provider 1.2.3)',
    threat: "Another page starts the admin's flow, which has no consent page, to get a code",
    mitigation:
      "The admin's only redirect URI is `/admin/callback` on Hollware's origin; the admin checks `state` and keeps the verifier",
    guards: [
      {
        file: 'packages/server/tests/oauth/flow.workerd.test.ts',
        test: 'lets the admin, its own client, in without a consent page, within the role',
      },
      {
        file: 'packages/admin/tests/auth.test.ts',
        test: 'refuses a callback whose state is not the one it sent, and uses a sign-in once',
      },
    ],
  },
  {
    id: 'T-47',
    area: 'Passkeys (SimpleWebAuthn 14.0.3)',
    threat: 'A WebAuthn challenge is replayed',
    mitigation: 'Single use, by purpose',
    guards: [
      {
        file: 'packages/server/tests/identity/ceremonies.workerd.test.ts',
        test: 'opens a session with a registered passkey, and refuses its challenge a second time',
      },
    ],
  },
  {
    id: 'T-48',
    area: 'Passkeys (SimpleWebAuthn 14.0.3)',
    threat: 'An old challenge is used',
    mitigation: 'Expiry checked',
    guards: [
      {
        file: 'packages/server/tests/identity/ceremonies.workerd.test.ts',
        test: 'refuses a challenge older than five minutes, and takes one of just under',
      },
    ],
  },
  {
    id: 'T-49',
    area: 'Passkeys (SimpleWebAuthn 14.0.3)',
    threat: 'A setup link or an invitation is used twice, raced, or after it expires',
    mitigation: 'Atomic, single use, expiring',
    guards: [
      {
        file: 'packages/server/tests/identity/ceremonies.workerd.test.ts',
        test: 'adds a passkey to the owner of a setup link, once',
      },
      {
        file: 'packages/server/tests/identity/ceremonies.workerd.test.ts',
        test: 'lets one person in through an invitation, even when two registrations start from it',
      },
      {
        file: 'packages/server/tests/identity/ceremonies.workerd.test.ts',
        test: 'refuses an invitation that expired, and a passkey made for another origin',
      },
    ],
  },
  {
    id: 'T-50',
    area: 'Passkeys (SimpleWebAuthn 14.0.3)',
    threat: 'An assertion made for another origin or RP ID, or a passkey of no one',
    mitigation: 'Expected origin and RP ID from `HOLLWARE_PUBLIC_URL`',
    guards: [
      {
        file: 'packages/server/tests/identity/ceremonies.workerd.test.ts',
        test: 'refuses a passkey of no one, and an assertion for another origin',
      },
    ],
  },
  {
    id: 'T-51',
    area: 'Passkeys (SimpleWebAuthn 14.0.3)',
    threat: 'A forged signature',
    mitigation: 'Library verification',
    guards: [
      {
        file: 'packages/server/tests/identity/ceremonies.workerd.test.ts',
        test: 'refuses an assertion whose signature does not verify',
      },
    ],
  },
  {
    id: 'T-52',
    area: 'Passkeys (SimpleWebAuthn 14.0.3)',
    threat: 'A cloned authenticator (counter goes back)',
    mitigation:
      'The stored counter is passed to the library, which refuses one that did not grow; its error is a refusal, not a 500',
    guards: [
      {
        file: 'packages/server/tests/identity/ceremonies.workerd.test.ts',
        test: 'refuses a counter that went back, as a cloned authenticator gives',
      },
    ],
  },
  {
    id: 'T-53',
    area: 'Passkeys (SimpleWebAuthn 14.0.3)',
    threat: 'A sign-in without user verification',
    mitigation:
      '`requireUserVerification: true` in both ceremonies, said in the code and not left to the library default',
    guards: [
      {
        file: 'packages/server/tests/identity/ceremonies.workerd.test.ts',
        test: 'refuses a sign-in in which the device was touched but not unlocked',
      },
    ],
  },
  {
    id: 'T-54',
    area: 'Passkeys (SimpleWebAuthn 14.0.3)',
    threat: 'A lost or stolen passkey cannot be revoked; a person cannot list theirs',
    mitigation:
      "The account page lists the person's passkeys (label and dates, never the key or credential id) and removes one; the last one is refused (409) in the statement that deletes, which counts the person's passkeys",
    guards: [
      {
        file: 'packages/server/tests/http/account.workerd.test.ts',
        test: 'lists them by label and dates, never their key or credential id',
      },
      {
        file: 'packages/server/tests/http/account.workerd.test.ts',
        test: 'removes one, and refuses the last one, which stays',
      },
      {
        file: 'packages/server/tests/http/account.workerd.test.ts',
        test: "refuses another person's passkey, though the person has two of their own",
      },
      {
        file: 'tests/e2e/admin.e2e.ts',
        test: 'the owner sees their passkey and the admin in Tu cuenta, then signs out',
      },
    ],
  },
  {
    id: 'T-55',
    area: 'Passkeys (SimpleWebAuthn 14.0.3)',
    threat: 'The invitation secret in `/setup?invitation=` lands in request logs',
    mitigation:
      'Fixed: the secret is in the fragment (`/setup#invitation=…`), which a browser never sends, so no request log holds it; the page reads it from there (and from the query of a link made before 0.11); not echoed; single use, 7 days by default',
    guards: [
      {
        file: 'packages/server/tests/identity/invitation-link.test.ts',
        test: 'is the function the setup page runs, and the page never holds an invitation',
      },
      {
        file: 'packages/server/tests/http/admin-api.workerd.test.ts',
        test: 'invite an editor or an author with a link to /setup, and never an owner',
      },
      {
        file: 'packages/cli/tests/invite.test.ts',
        test: 'inserts the invitation and prints its link once',
      },
      {
        file: 'packages/cli/tests/invite.test.ts',
        test: 'makes a setup link for the owner of the site with --owner',
      },
    ],
  },
  {
    id: 'T-56',
    area: 'Content',
    threat: 'Raw HTML or a script in Markdown reaches readers',
    mitigation: 'Raw HTML is a marker and an error; errors block publishing',
    guards: [
      { file: 'packages/core/tests/contracts/content-safety.test.ts', test: 'report %s' },
      { file: 'packages/core/tests/markdown/hostile.test.ts', test: '$name' },
      {
        file: 'tests/acceptance/v0.1/content-safety.test.ts',
        test: 'saves the hostile draft with one error and a fix for each problem, and blocks its publish',
      },
      {
        file: 'tests/acceptance/v0.1/content-safety.test.ts',
        test: 'publishes HTML that a post quotes as text, never as markup',
      },
    ],
  },
  {
    id: 'T-57',
    area: 'Content',
    threat: '`javascript:`, `data:`, `vbscript:` or an entity-hidden scheme in a link or image',
    mitigation: 'Allowlist: http, https, mailto (links), relative',
    guards: [
      { file: 'packages/core/tests/markdown/policy.test.ts', test: '%j as a %s is safe: %s' },
    ],
  },
  {
    id: 'T-58',
    area: 'Content',
    threat: 'Event handlers, `style` or `class` on native tags',
    mitigation: 'Attribute allowlist per tag',
    guards: [
      { file: 'packages/core/tests/markdown/policy.test.ts', test: 'lets <%s %s=%j> through: %s' },
      {
        file: 'packages/core/tests/markdown/render.test.ts',
        test: 'prints no tag and no attribute of the fixtures that is not on the list of what is safe',
      },
    ],
  },
  {
    id: 'T-59',
    area: 'Content',
    threat: 'A stored document that no Markdown wrote (a crafted node) renders unsafe HTML',
    mitigation:
      'The renderer applies the same allowlist, and reads a URL bound to the data of the document (`:href="frontmatter.url"`) itself, under the rules of a URL written out, so none reaches the page on Comark\'s word (which lets `data:image/svg+xml` through)',
    guards: [
      { file: 'packages/core/tests/markdown/render.test.ts', test: 'prints %s as safe HTML' },
      {
        file: 'packages/core/tests/markdown/render.test.ts',
        test: 'reads a link bound to the frontmatter under the rules of a link: %s',
      },
    ],
  },
  {
    id: 'T-60',
    area: 'Content',
    threat: "XSS or redress in the admin's preview of a draft (`v-html` of the server's HTML)",
    accepted:
      'The preview is the safe render in an `<iframe sandbox="">` with no referrer (`packages/admin/app/lib/preview.ts`): it runs no script, reaches nothing of the admin, and its styles stay inside its frame; the admin prints no HTML of its own (`v-html`); a draft\'s images load from their hosts when previewed, with no referrer and no cookie; the sandbox holds everything else',
  },
  {
    id: 'T-61',
    area: 'Content',
    threat: 'Component props carry unknown keys or unsafe values',
    mitigation: 'Strict schemas per component',
    guards: [{ file: 'packages/core/tests/contracts/components.test.ts', test: 'reports %s' }],
  },
  {
    id: 'T-62',
    area: 'Content',
    threat: 'Hostile Markdown burns CPU or the stack (unclosed marks, deep nesting)',
    mitigation: 'Linear parse, depth limit; `vp run bench` holds 3 ms at p95',
    guards: [
      {
        file: 'packages/core/tests/markdown/hostile.test.ts',
        test: 'leaves 5,000 unclosed emphasis marks as the text they are',
      },
      {
        file: 'packages/core/tests/markdown/render.test.ts',
        test: 'stops at 100 levels, so a document cannot make it recurse until the stack is gone',
      },
    ],
  },
  {
    id: 'T-63',
    area: 'Content',
    threat: 'Oversized files or rows',
    mitigation: 'Size checked before parsing; rows over 1.9 MB refused',
    guards: [
      {
        file: 'packages/core/tests/markdown/limits.test.ts',
        test: 'checks the size before it parses, so a file over the limit never reaches Comark',
      },
      {
        file: 'packages/server/tests/db/row-size.workerd.test.ts',
        test: 'writes a row of exactly the limit, and refuses one with one byte more',
      },
    ],
  },
  {
    id: 'T-64',
    area: 'Content',
    threat: 'A site renders the Markdown with its own pipeline and skips the safety',
    accepted: 'Documented: such a site sanitizes itself',
  },
  {
    id: 'T-65',
    area: 'Content',
    threat: 'The example site prints what authors write as markup',
    mitigation: 'Escaping and a page CSP',
    guards: [
      {
        file: 'apps/playground/test/harness/site.test.ts',
        test: 'is escaped in the listing, in the page and in its title',
      },
      {
        file: 'apps/playground/test/harness/site.test.ts',
        test: 'answers as an HTML page that may load nothing but itself',
      },
    ],
  },
  {
    id: 'T-66',
    area: 'Webhooks and outbound fetches',
    threat: 'A forged webhook',
    mitigation: 'HMAC-SHA256 of `<timestamp>.<body>`, constant-time compare',
    guards: [
      {
        file: 'packages/core/tests/webhooks.test.ts',
        test: 'sign the timestamp and the body with the secret',
      },
      { file: 'packages/core/tests/webhooks.test.ts', test: 'refuse %s' },
      {
        file: 'packages/core/tests/webhooks.test.ts',
        test: 'refuse a signature for another timestamp',
      },
    ],
  },
  {
    id: 'T-67',
    area: 'Webhooks and outbound fetches',
    threat: 'A captured webhook replayed within the 5-minute tolerance',
    mitigation:
      '`verifyWebhook` takes `isNew(eventId)`, reads the id from the signed body (never the unsigned header) and refuses an event it was given before; the docs tell receivers to keep ids longer than the tolerance',
    guards: [
      {
        file: 'packages/core/tests/webhooks.test.ts',
        test: 'take an event once, and refuse it sent again within the tolerance',
      },
      {
        file: 'packages/core/tests/webhooks.test.ts',
        test: 'read the id from the signed body, so another id in the header changes nothing',
      },
    ],
  },
  {
    id: 'T-68',
    area: 'Webhooks and outbound fetches',
    threat: 'A webhook over plain http, or at a private address',
    mitigation: 'https only; the flag keeps fetches on the public internet',
    guards: [
      { file: 'packages/core/tests/config/events.test.ts', test: 'reports %s at its path' },
      {
        file: 'tests/conventions/wrangler-flags.test.ts',
        test: 'holds a Worker of Hollware to the OAuth server: the flag, and OAUTH_KV in every environment',
      },
    ],
  },
  {
    id: 'T-69',
    area: 'Webhooks and outbound fetches',
    threat:
      "**An owner (or an agent with `schema:admin`) exfiltrates any Worker secret.** A webhook's `secret` and IndexNow's `key` name a Worker variable by name, checked only against `^[A-Z][A-Z0-9_]*$`, so `indexNow: { key: \"HOLLWARE_SECRET\" }` sends its value in clear to `api.indexnow.org`, for a host the owner sets with `url`, and IndexNow then fetches `https://<that host>/<key>.txt`. `HOLLWARE_SECRET` opens every site's sealed webhook secrets",
    mitigation:
      'Fixed: the definition holds the IndexNow key itself, which is public (`INDEXNOW_KEY`), so no Worker value is read for IndexNow; a webhook may not name a secret of Hollware or Cloudflare (`HOLLWARE_*`, `CLOUDFLARE_*`, `CF_*`); a stored definition of the old form is served with IndexNow off (`withoutStaleIndexNow`)',
    guards: [
      {
        file: 'packages/server/tests/structure/operations.workerd.test.ts',
        test: 'refuses a definition whose IndexNow or webhook would send a secret of the Worker out',
      },
      {
        file: 'packages/server/tests/structure/registry.workerd.test.ts',
        test: 'serves a site whose stored IndexNow names a secret, with IndexNow off, and logs it',
      },
      { file: 'packages/core/tests/config/events.test.ts', test: 'reports %s at its path' },
    ],
  },
  {
    id: 'T-70',
    area: 'Webhooks and outbound fetches',
    threat:
      'Webhook URLs, which are often bearer secrets (deploy hooks), are readable by any `content:read` principal, authors included, through `get_structure`',
    mitigation:
      'Fixed: `get_structure` shows the URL of a webhook whole to a token with schema:admin, and its origin only to anyone else',
    guards: [
      {
        file: 'packages/server/tests/structure/operations.workerd.test.ts',
        test: 'shows an owner the whole URL, and anyone else its origin only',
      },
    ],
  },
  {
    id: 'T-71',
    area: 'Webhooks and outbound fetches',
    threat: 'Sealed secrets read from D1, or moved between rows',
    mitigation:
      'Fixed: sealed values are `v2.`, with the site and the name as associated data; `v1.` values still open',
    guards: [
      {
        file: 'packages/server/tests/structure/seal.test.ts',
        test: 'opens only where it was sealed: another site or name does not open it',
      },
    ],
  },
  {
    id: 'T-72',
    area: 'Webhooks and outbound fetches',
    threat: 'A webhook secret made for a webhook that has its own, or shown twice',
    mitigation: 'Only for a webhook without a Worker secret; answered once',
    guards: [
      {
        file: 'packages/server/tests/structure/operations.workerd.test.ts',
        test: 'makes a sealed secret for a webhook that names none, and for no other',
      },
    ],
  },
  {
    id: 'T-73',
    area: 'Webhooks and outbound fetches',
    threat:
      "Injection into a provider's query: the GraphQL of Cloudflare, the HogQL of PostHog, the JSON of Plausible and GA4",
    mitigation:
      "Hosts are checked as plain host names before any query is built, days and limits as integers in range; Cloudflare and the JSON APIs take them as variables and fields, PostHog's HogQL only after the checks",
    guards: [
      {
        file: 'packages/server/tests/analytics/providers.test.ts',
        test: 'builds its HogQL from checked values only',
      },
      {
        file: 'packages/server/tests/analytics/normalize.test.ts',
        test: 'refuses a name that is not a plain host, so none can break a query',
      },
    ],
  },
  {
    id: 'T-109',
    area: 'Webhooks and outbound fetches',
    threat:
      "The read-only credential of a site's analytics leaks: in an answer, the activity log, a cache key, a backup, or an error that repeats it",
    mitigation:
      "Sealed under `HOLLWARE_SECRET` in `site_analytics`; `get_analytics` and `connect_analytics` never answer it; the audit allowlist has no `credential` field; the cache key names the provider, the site and the connection's last change; backups read no `site_analytics`; a provider's message has the credential taken out",
    guards: [
      {
        file: 'packages/server/tests/analytics/sources.workerd.test.ts',
        test: 'asks the provider first, then keeps the credential sealed and answers it nowhere',
      },
      {
        file: 'packages/server/tests/analytics/sources.workerd.test.ts',
        test: 'answers the counts through content_stats, kept ten minutes until the connection changes',
      },
      {
        file: 'packages/server/tests/analytics/providers.test.ts',
        test: 'never repeats the credential, and keeps to 300 characters',
      },
    ],
  },
  {
    id: 'T-110',
    area: 'Webhooks and outbound fetches',
    threat: "A sealed analytics credential copied to another site's row opens there",
    mitigation:
      'The seal is bound to the site and the name (T-71): a copied value does not open, and content_stats answers unavailable with the way to connect again',
    guards: [
      {
        file: 'packages/server/tests/analytics/sources.workerd.test.ts',
        test: 'does not open a credential copied to another site',
      },
    ],
  },
  {
    id: 'T-111',
    area: 'Webhooks and outbound fetches',
    threat:
      'The owner points the credential at a host of their choosing (a self-hosted PostHog or Plausible) to reach private addresses',
    accepted:
      "`host` must be an `https://` origin; the Worker's fetch reaches public addresses only (T-29); only an owner (`schema:admin`) sets it, and the credential is theirs",
  },
  {
    id: 'T-112',
    area: 'Webhooks and outbound fetches',
    threat:
      'A connection is kept that the provider never accepted, or a slow provider holds the operation',
    mitigation:
      '`connect_analytics` asks the provider for the last 7 days and saves only when it answered; every request has a 25 s timeout, inside the 30 s of an open-world operation, and a failure is `unreachable`',
    guards: [
      {
        file: 'packages/server/tests/analytics/sources.workerd.test.ts',
        test: 'saves nothing when the provider turns the credential down',
      },
      {
        file: 'packages/server/tests/analytics/providers.test.ts',
        test: 'is unreachable after 25 s, before the open-world operation times out',
      },
    ],
  },
  {
    id: 'T-74',
    area: 'The agents of `@hollware/agents`',
    threat:
      'An entry tells the reviewer or the translator to publish, approve or call another tool',
    mitigation: 'Allowlist of twelve tools, refused before any request, whatever the token holds',
    guards: [
      {
        file: 'packages/agents/tests/hollware.test.ts',
        test: 'lets the reading and writing tools through, and refuses those that publish or decide',
      },
    ],
  },
  {
    id: 'T-75',
    area: 'The agents of `@hollware/agents`',
    threat: '`request_review` publishes for a caller who may publish',
    mitigation: 'It never publishes',
    guards: [
      {
        file: 'packages/server/tests/ops/review-comments.workerd.test.ts',
        test: 'asks for a review and publishes nothing, even for a caller who may publish',
      },
    ],
  },
  {
    id: 'T-76',
    area: 'The agents of `@hollware/agents`',
    threat: 'Injected text reaches readers through a translation or a comment',
    accepted:
      'A translation is a pending review that a person approves; the translator acknowledges the remaining warnings itself, so the person sees them acknowledged',
  },
  {
    id: 'T-77',
    area: 'The agents of `@hollware/agents`',
    threat:
      'Any MCP client named `hollware-agents` comments on a review, and the reviewer then skips it',
    accepted: "None: the client name is the client's own claim",
  },
  {
    id: 'T-78',
    area: 'The agents of `@hollware/agents`',
    threat: 'A run spends the model budget',
    mitigation: 'Daily cap (100 calls by default)',
    guards: [
      {
        file: 'packages/agents/tests/model.test.ts',
        test: 'refuses the call over the limit, and allows again the next day',
      },
    ],
  },
  {
    id: 'T-79',
    area: 'Structure operations',
    threat: 'A non-owner changes the structure',
    mitigation:
      'Only the owner and admin roles allow `schema:admin`; the scope check runs before the handler',
    guards: [
      {
        file: 'packages/core/tests/operations.test.ts',
        test: 'have the effects, scopes and outcomes of the operations table',
      },
      {
        file: 'packages/server/tests/auth/roles.test.ts',
        test: 'gives the owner every scope, an admin all but site:owner, an editor the content, an author all but publishing and a reviewer reading and comments',
      },
      {
        file: 'packages/server/tests/mcp/scopes.test.ts',
        test: 'refuse %s to a principal without %s with 403 and the challenge (${era})',
      },
      {
        file: 'tests/acceptance/v0.8/structure.test.ts',
        test: 'refuses a token without schema:admin, and changes nothing',
      },
    ],
  },
  {
    id: 'T-80',
    area: 'Structure operations',
    threat: "One site reads or writes another's rows",
    mitigation: '`site_id` on every table, composite keys, every query by site',
    guards: [
      {
        file: 'tests/conventions/schema.test.ts',
        test: 'every table of the schema follows the shape and the site rules',
      },
      {
        file: 'packages/server/tests/ops/isolation.workerd.test.ts',
        test: 'writes and publishes its own entries under keys that the other site has too, and leaves the other site as it was',
      },
      {
        file: 'tests/acceptance/v0.1/isolation.test.ts',
        test: 'leaves every entry of the other site as it was',
      },
      {
        file: 'packages/server/tests/db/isolation.workerd.test.ts',
        test: 'never shows a revision of another site, even to an entry that points at one',
      },
    ],
  },
  {
    id: 'T-81',
    area: 'Structure operations',
    threat: 'A site in the trash keeps serving, or someone else restores it',
    mitigation:
      'The registry leaves trashed sites out, so their tokens are unknown; only an owner restores',
    guards: [
      {
        file: 'packages/server/tests/structure/registry.workerd.test.ts',
        test: 'serves the sites of D1 with a definition, and leaves out one without or in the trash',
      },
      {
        file: 'packages/server/tests/structure/operations.workerd.test.ts',
        test: 'trashes a site its owner confirms, and restores it; to anyone else it is not there',
      },
      {
        file: 'packages/server/tests/ops/trash.workerd.test.ts',
        test: 'is out of reach: a stranger can neither trash nor restore an entry, and nothing changes',
      },
    ],
  },
  {
    id: 'T-82',
    area: 'Structure operations',
    threat: 'Any holder of `schema:admin` on one site creates sites without limit',
    accepted: 'The maker becomes the owner; no cap',
  },
  {
    id: 'T-83',
    area: 'Structure operations',
    threat: 'The audit of structure changes is rewritten',
    mitigation:
      'Fixed: migration 0015 makes site_changes append-only (no delete, no update, no replace by id)',
    guards: [
      {
        file: 'packages/server/tests/append-only.workerd.test.ts',
        test: 'keep site_changes as it was written: no line is changed, deleted or replaced',
      },
    ],
  },
  {
    id: 'T-84',
    area: 'Supply chain and release',
    threat: 'A moved tag runs other code in CI',
    mitigation: 'Every action pinned to a commit SHA with its version',
    guards: [
      {
        file: 'tests/conventions/workflow-pinning.test.ts',
        test: 'every action of every workflow is pinned to a commit with its version',
      },
    ],
  },
  {
    id: 'T-85',
    area: 'Supply chain and release',
    threat: 'A freshly published malicious version is installed',
    mitigation:
      '`minimumReleaseAge: 1440`, `trustPolicy: no-downgrade`, exact catalog, reasoned build allowlist',
    guards: [
      {
        file: 'tests/conventions/pnpm-policy.test.ts',
        test: 'pnpm-workspace.yaml and the root package.json keep the supply-chain policy',
      },
    ],
  },
  {
    id: 'T-86',
    area: 'Supply chain and release',
    threat:
      'A package published without provenance, with a token, or from a tarball changed after the plan',
    mitigation:
      'OIDC trusted publishing, `--provenance`, tarballs verified, finalize waits for the attestations',
    guards: [
      {
        file: 'tests/conventions/workflow-forbidden.test.ts',
        test: 'no workflow or script uses a token, a direct publish or an unpinned runner',
      },
      {
        file: 'tests/ci/verify-and-publish.test.ts',
        test: 'a tarball changed after the plan was written is refused before npm is asked anything',
      },
      {
        file: 'tests/ci/finalize-release.test.ts',
        test: 'gets a tag at the release commit and then a release for each public package it bumped, and for no other',
      },
    ],
  },
  {
    id: 'T-87',
    area: 'Supply chain and release',
    threat: 'A commit that is not on `main` is published',
    mitigation: 'Promotion check from the promoted commit',
    guards: [
      {
        file: 'tests/ci/promotion-check.test.ts',
        test: 'a commit that is not on main is refused, on a side branch or past origin/main',
      },
    ],
  },
  {
    id: 'T-88',
    area: 'Supply chain and release',
    threat:
      "A push to `release` publishes with no second approval; any session with the maintainer's GitHub credentials can push it",
    accepted: 'The push is the one human gate',
  },
  {
    id: 'T-89',
    area: 'Supply chain and release',
    threat: 'A job holds more permissions or keeps the checkout credentials',
    mitigation:
      '`permissions: {}`, `id-token: write` only in `publish` and Scorecard, `persist-credentials: false`',
    guards: [
      {
        file: 'tests/conventions/workflow-permissions.test.ts',
        test: 'every workflow starts from no permissions and grants id-token and credentials sparingly',
      },
    ],
  },
  {
    id: 'T-90',
    area: 'Supply chain and release',
    threat:
      'The Cloudflare API token is in the environment of every build step of `deploy.yml` (`vp build`, `nuxt build` inherit `process.env`), so any build-time dependency can read it',
    mitigation:
      'Fixed: `scripts/deploy.ts` gives the Cloudflare token only to the steps that migrate or deploy (`envOf`); the builds, which run the code of their dependencies, never have it',
    guards: [
      {
        file: 'scripts/deploy.test.ts',
        test: 'reaches the steps that migrate or deploy, and no step that builds',
      },
    ],
  },
  {
    id: 'T-113',
    area: 'Content',
    threat:
      'An agent makes the Worker fetch a URL of its choosing with `upload_asset`, or one that turns into plain http or never ends',
    mitigation:
      "https only, each redirect followed by hand and refused when it leads to http or past five, an answer without a Content-Length read with a cap of 10 MB, one that declares it streamed to R2 through a `FixedLengthStream` that refuses a body shorter or longer than it, never past the site's media `maxBytes`, and `global_fetch_strictly_public` in every Worker",
    guards: [
      {
        file: 'packages/server/tests/ops/assets.workerd.test.ts',
        test: 'refuses http, a redirect to http or past five, an answer that is not ok, one that ends short of its Content-Length or has none past 10 MB, a fetch that fails, and data with url',
      },
      {
        file: 'tests/conventions/wrangler-flags.test.ts',
        test: 'holds a Worker of Hollware to the OAuth server: the flag, and OAUTH_KV in every environment',
      },
    ],
  },
  {
    id: 'T-114',
    area: 'Content',
    threat:
      'Someone deletes entries for ever: their revisions, publications and reviews, which append-only otherwise keeps',
    mitigation:
      'Only an owner, in the admin, and only an entry of the trash, which only a draft reaches; each purge leaves a record that is never changed or deleted and a line in the activity log, and without that record the triggers still refuse every delete',
    guards: [
      {
        file: 'packages/server/tests/http/admin-api.workerd.test.ts',
        test: 'delete an entry of the trash for ever, for an owner, and refuse one out of the trash',
      },
      {
        file: 'packages/server/tests/db/purge.workerd.test.ts',
        test: 'deletes an entry of the trash with all it left, records who did, and touches no other',
      },
      {
        file: 'packages/server/tests/append-only.workerd.test.ts',
        test: 'keep the record of a purge: it is neither changed nor deleted',
      },
    ],
  },
  {
    id: 'T-115',
    area: 'Content',
    threat:
      'Someone rewrites who did what in a site, or erases a person who is still a member, through the anonymization that takes the name of a former member out of the rows append-only keeps',
    mitigation:
      'Only an owner, in the admin, and only a person removed from the site and no member of it; the triggers let a row change only while that anonymization is open, only to name the former person in place of that one, and nothing else of the row; the line in the activity log names no one',
    guards: [
      {
        file: 'packages/server/tests/http/account.workerd.test.ts',
        test: 'is anonymized by an owner once removed, listed until then, and the apps they had end',
      },
      {
        file: 'packages/server/tests/identity/anonymize.workerd.test.ts',
        test: 'names the former person wherever the site named them, keeps what they did, and forgets them once no site keeps them',
      },
      {
        file: 'packages/server/tests/append-only.workerd.test.ts',
        test: 'let an anonymization that is open name the former person where a line named the one it anonymizes, and change nothing else',
      },
    ],
  },
  {
    id: 'T-116',
    area: 'Tokens',
    threat:
      'A Worker of the account with a service binding to `HollwareOps` writes to a site, or speaks MCP to it, as no one, skipping the Host guard of the gateway',
    mitigation:
      'Every call of `ops` and every request of its `fetch` is checked as a personal token (`hw_pat_`) on the primary D1, so a revoked token stops at once; the site, the scopes and the actor of the activity log come from the token, never from the input',
    guards: [
      {
        file: 'packages/server/tests/rpc/ops-entrypoint.workerd.test.ts',
        test: 'refuses a token revoked since its last call, on the next one',
      },
      {
        file: 'packages/server/tests/rpc/ops-entrypoint.workerd.test.ts',
        test: 'runs on the site of the token, and refuses an input that names another',
      },
      {
        file: 'packages/server/tests/rpc/ops-entrypoint.workerd.test.ts',
        test: 'writes the line of a write to the activity log as the token, through the binding',
      },
      {
        file: 'packages/server/tests/rpc/ops-entrypoint.workerd.test.ts',
        test: 'serves MCP as the bearer token, whatever the Host, and answers 401 without one',
      },
    ],
  },
  {
    id: 'T-117',
    area: 'Tokens',
    threat:
      'A read token (`hw_read_`), public once a browser has it, runs a write through the `HollwareOps` binding',
    mitigation:
      '`HollwareOps` takes only the shape of a personal token before it looks one up, and refuses a read token as `unauthorized`; the scopes of the operation are checked against the token before its handler runs',
    guards: [
      {
        file: 'packages/server/tests/rpc/ops-entrypoint.workerd.test.ts',
        test: 'refuses a read token, and no token at all, before any operation runs',
      },
      {
        file: 'packages/server/tests/rpc/ops-entrypoint.workerd.test.ts',
        test: 'runs an operation as an author token, which writes a draft and is refused what needs content:publish',
      },
    ],
  },
  {
    id: 'T-118',
    area: 'Sign-in',
    threat:
      'An ID token forged with another key, under the key id of the provider, signs someone in',
    mitigation:
      'Every ID token and Access assertion is verified with WebCrypto against the JWKS of its issuer (RS256 or ES256 only); a key id the cached set lacks is fetched once, and a token whose signature fails is refused before any person is looked up',
    guards: [
      {
        file: 'packages/server/tests/identity/federation.workerd.test.ts',
        test: 'an ID token signed by another key under the kid of Google',
      },
    ],
  },
  {
    id: 'T-119',
    area: 'Sign-in',
    threat: 'An ID token issued to another client, or by another issuer, signs a person in here',
    mitigation:
      'The audience must be the client id of the provider (the audience tag for Access) and the issuer the one of its discovery document (Google: `https://accounts.google.com`; Access: the team domain)',
    guards: [
      {
        file: 'packages/server/tests/identity/federation.workerd.test.ts',
        test: 'an ID token for another client',
      },
      {
        file: 'packages/server/tests/identity/federation.workerd.test.ts',
        test: 'an ID token of another issuer',
      },
      {
        file: 'packages/server/tests/identity/federation.workerd.test.ts',
        test: 'an assertion of Access for another application',
      },
    ],
  },
  {
    id: 'T-120',
    area: 'Sign-in',
    threat: 'An expired ID token, or one of another sign-in, is replayed',
    mitigation:
      '`exp` and `nbf` are checked with 60 seconds of skew, and the nonce of the token must be the one the challenge of this sign-in keeps',
    guards: [
      {
        file: 'packages/server/tests/identity/federation.workerd.test.ts',
        test: 'an ID token that expired more than a minute ago',
      },
      {
        file: 'packages/server/tests/identity/federation.workerd.test.ts',
        test: 'an ID token of another sign-in, by its nonce',
      },
    ],
  },
  {
    id: 'T-121',
    area: 'Sign-in',
    threat: 'The answer of a provider is replayed, or its state is missing',
    mitigation:
      'The state is the id of a challenge taken with `DELETE … RETURNING`, once and within 5 minutes; an answer with no state, or a used one, signs nobody in and exchanges no code',
    guards: [
      {
        file: 'packages/server/tests/identity/federation.workerd.test.ts',
        test: 'a state used once already',
      },
      {
        file: 'packages/server/tests/identity/federation.workerd.test.ts',
        test: 'an answer with no state, and one whose state began in another browser',
      },
    ],
  },
  {
    id: 'T-122',
    area: 'Sign-in',
    threat:
      'Login CSRF: an attacker sends a victim the callback of a sign-in the attacker began, and the victim is signed in as the attacker',
    mitigation:
      'The start of a sign-in sets a cookie bound to the challenge (`HttpOnly`, `Secure`, `SameSite=Lax`, path `/auth/federate`); the callback refuses a state whose cookie is not in the browser',
    guards: [
      {
        file: 'packages/server/tests/identity/federation.workerd.test.ts',
        test: 'an answer with no state, and one whose state began in another browser',
      },
    ],
  },
  {
    id: 'T-123',
    area: 'Sign-in',
    threat:
      'An account with an unverified email takes over the person who owns that email, or gets in by its domain',
    mitigation:
      'Only a verified email links an account to a person, redeems an invitation or matches the access of a site (Google and OIDC: `email_verified` true; GitHub: the primary verified address; Microsoft: one directory, never `common`; Access: verified by Access); otherwise the person is only found by provider and subject',
    guards: [
      {
        file: 'packages/server/tests/identity/federation.workerd.test.ts',
        test: 'an unverified email: never linked to its owner, never provisioned',
      },
      {
        file: 'packages/server/tests/identity/federation.workerd.test.ts',
        test: 'an OIDC account whose email the provider does not say it verified',
      },
      {
        file: 'packages/server/tests/identity/federation.workerd.test.ts',
        test: 'the shared tenant of Microsoft, at startup',
      },
    ],
  },
  {
    id: 'T-124',
    area: 'Sign-in',
    threat: 'Anyone with an account of a provider becomes a member of a site',
    mitigation:
      'A person who is not known and has no invitation becomes a member only of a site whose `access.autoProvision` lists their exact address or its domain (never a subdomain), and only as a reviewer, an author or an editor; otherwise the answer is a 403 page',
    guards: [
      {
        file: 'packages/server/tests/identity/federation.workerd.test.ts',
        test: 'a verified email of a domain no site lets in',
      },
      {
        file: 'packages/core/tests/config/access.test.ts',
        test: 'admits an address by itself or by its domain, never a subdomain or a lookalike',
      },
    ],
  },
  {
    id: 'T-125',
    area: 'Sign-in',
    threat:
      'A forged `Cf-Access-Jwt-Assertion` header signs someone in on a deployment that does not use Cloudflare Access',
    mitigation:
      'The header is read only when a `cloudflare-access` provider is configured, and then verified against the certificates of its team domain and its audience',
    guards: [
      {
        file: 'packages/server/tests/identity/federation.workerd.test.ts',
        test: 'the header of Cloudflare Access when no Access provider is configured',
      },
    ],
  },
  {
    id: 'T-126',
    area: 'Sign-in',
    threat: 'The `return_to` of a sign-in through a provider sends the person to another origin',
    mitigation:
      'After the sign-in the target goes through `sameOriginTarget`: another origin, scheme or a `javascript:` URL goes to `/admin/`',
    guards: [
      {
        file: 'packages/server/tests/identity/federation.workerd.test.ts',
        test: 'a return_to of another origin, which goes to the admin instead',
      },
    ],
  },
  {
    id: 'T-127',
    area: 'Accounts',
    threat: 'Someone adds a passkey to the account of another person with a challenge of theirs',
    mitigation:
      "A passkey is added over `/v1/admin/account/passkeys/*` only by the admin client, and the enrollment challenge names the person who asked for it: another person's challenge is refused",
    guards: [
      {
        file: 'packages/server/tests/http/account.workerd.test.ts',
        test: 'refuses a challenge of another person, and adding passkeys when they are off',
      },
    ],
  },
  {
    id: 'T-128',
    area: 'Agents',
    threat:
      "An agent's grant is replayed after its hour, or after the review it was minted for is decided, to keep reading or commenting",
    mitigation:
      'A grant (`hw_agt_`) lasts an hour, names its review, and is checked on the primary at every request: expired, revoked, or its review no longer pending is refused; a review-bound grant reads and comments on that review only; the cron deletes expired and revoked grants',
    guards: [
      {
        file: 'packages/server/tests/http/cron-cleanup.workerd.test.ts',
        test: 'drops the challenges, sessions and agent grants that expired, the revoked grants, and keeps the others',
      },
      {
        file: 'packages/server/tests/agents/delivery.workerd.test.ts',
        test: 'refuses the grant an hour later, and once its review is decided',
      },
      {
        file: 'packages/server/tests/agents/delivery.workerd.test.ts',
        test: 'gets the event signed, with a grant that comments on that review and on no other',
      },
    ],
  },
  {
    id: 'T-129',
    area: 'Agents',
    threat:
      "A site definition gives an agent more than an author's scopes, or names a person as an agent, to publish or approve through its grants",
    mitigation:
      "A subscription's scopes must be within an author's (`AGENT_SCOPE_CEILING`), update_site names only agent members, an agent member stays an author whatever role an owner gives it, and a grant's scopes are intersected with the member's role at every request",
    guards: [
      { file: 'packages/core/tests/config/agents-problems.test.ts', test: 'reports $name' },
      {
        file: 'packages/server/tests/http/admin-api.workerd.test.ts',
        test: 'keep an agent member an author, whatever role an owner gives it',
      },
      {
        file: 'packages/server/tests/structure/operations.workerd.test.ts',
        test: 'names an agent only as an agent member of the site, never as a person',
      },
      {
        file: 'packages/server/tests/agents/scopes.workerd.test.ts',
        test: 'keeps no more than an author has, whatever scopes a grant row holds',
      },
      {
        file: 'packages/server/tests/agents/scopes.workerd.test.ts',
        test: 'lets an agent grant of the default scopes read and comment, and never write, publish or approve',
      },
    ],
  },
  {
    id: 'T-130',
    area: 'Agents',
    threat:
      "A forged or replayed request reaches an agent's webhook as a delivery of Hollware, or a failed delivery leaves a live grant behind",
    mitigation:
      'Deliveries are signed as webhooks are (`verifyAgentEvent`: signature, body and a 5-minute window); a delivery that fails revokes its grant, and each retry mints another; a binding delivery goes only to a service binding the site names',
    guards: [
      {
        file: 'packages/core/tests/agents.test.ts',
        test: 'refuses a request signed with another secret, a body changed after signing, and one too old',
      },
      {
        file: 'packages/server/tests/agents/delivery.workerd.test.ts',
        test: 'is called with the event and a live grant; a failure revokes it and the retry mints another',
      },
      {
        file: 'packages/server/tests/agents/delivery.workerd.test.ts',
        test: 'takes no delivery of a member that is no agent, and mints no grant for it',
      },
    ],
  },
  {
    id: 'T-131',
    area: 'Reviews',
    threat:
      'A review is approved before the agents the site requires have read it, and nobody can tell',
    mitigation:
      'With `review.requireAgents`, approve_review answers `agents_pending` until each required agent commented; only an owner overrides it, and the activity log keeps `override`',
    guards: [
      {
        file: 'packages/server/tests/agents/delivery.workerd.test.ts',
        test: 'answers agents_pending until the required agent comments, unless an owner overrides',
      },
      {
        file: 'packages/server/tests/audit/operations.test.ts',
        test: 'keeps that an owner approved a review without the agents it waited for',
      },
    ],
  },
  {
    id: 'T-132',
    area: 'Agents',
    threat:
      "An owner, or someone with an owner's session, gives an agent member a personal token with more than an author's scopes, or one of a person passed off as an agent",
    mitigation:
      "Only an owner makes a token for a member, over the CLI and `/v1/admin` and never over MCP; `member` must be an agent member of the site; content:publish and schema:admin are refused with their fix, and the token's scopes are cut to an author's (`AGENT_SCOPE_CEILING`)",
    guards: [
      {
        file: 'packages/server/tests/http/agents-admin.workerd.test.ts',
        test: "gives an agent member a token of an author's scopes at most, of the expiry asked, that writes as the agent and asks for review instead of publishing",
      },
      {
        file: 'packages/cli/tests/token.test.ts',
        test: "makes the token of an agent member with --member, which it checks, of an author's scopes at most",
      },
      {
        file: 'packages/cli/tests/token.test.ts',
        test: 'refuses --member for a user that is no agent member of the site, and writes nothing',
      },
    ],
  },
  {
    id: 'T-133',
    area: 'Agents',
    threat:
      "An agent's lasting personal token publishes, approves, unpublishes or changes the site, or outlives the agent",
    mitigation:
      "The token's scopes are intersected with the member's role at every request, and an agent member stays an author, so its publish asks for a review; removing the agent revokes its tokens with its grants, in the admin and the CLI",
    guards: [
      {
        file: 'packages/server/tests/agents/scopes.workerd.test.ts',
        test: "never lets an agent's personal token approve, unpublish or change the site, whatever scopes its row holds",
      },
      {
        file: 'packages/server/tests/http/agents-admin.workerd.test.ts',
        test: 'makes an agent member, lists it apart from people, refuses its name twice and removes it with its grants and tokens',
      },
      {
        file: 'packages/cli/tests/agent.test.ts',
        test: 'revokes the live grants and tokens and deletes the membership of an agent only',
      },
    ],
  },
  {
    id: 'T-134',
    area: 'People',
    threat:
      'An admin takes the site from its owners: names an owner, demotes or removes one, deletes the site or its entries for ever, or reads its backups',
    mitigation:
      "An admin has every scope of an owner but `site:owner`: naming, changing or removing an owner, purging an entry, anonymizing a person, the site's deletion and restoration and its backups ask for it",
    guards: [
      {
        file: 'packages/server/tests/http/invitations.workerd.test.ts',
        test: 'let an admin change and remove anyone but an owner, and name no owner',
      },
      {
        file: 'packages/server/tests/http/invitations.workerd.test.ts',
        test: 'keep the deletion of entries and the anonymizing of people for an owner',
      },
      {
        file: 'packages/server/tests/backup/backup.workerd.test.ts',
        test: 'serves a backup to an owner of the site, and to no one else, from BACKUPS before MEDIA',
      },
      {
        file: 'packages/core/tests/operations.test.ts',
        test: 'have the effects, scopes and outcomes of the operations table',
      },
    ],
  },
  {
    id: 'T-135',
    area: 'People',
    threat:
      'An invitation lands on the wrong account: a second account for a person of this Hollware, a link accepted by another person, or an address taken from someone who has it',
    mitigation:
      'Every invitation of a new person names an address, and the account it makes keeps it; a person accepts with the passkey they have (`accept`), and a link for a named person takes only theirs; an address becomes verified only when Hollware mailed the link and showed it to nobody, or when its provider says so, and an address that has an account sends its person to their passkey',
    guards: [
      {
        file: 'packages/server/tests/identity/ceremonies.workerd.test.ts',
        test: 'makes a person of this Hollware a member of another site with the passkey they have, once',
      },
      {
        file: 'packages/server/tests/identity/ceremonies.workerd.test.ts',
        test: 'refuses a revoked invitation, a challenge of a sign-in, and a link made for someone else',
      },
      {
        file: 'packages/server/tests/identity/ceremonies.workerd.test.ts',
        test: 'gives the new person its address, verified only when Hollware mailed the link',
      },
      {
        file: 'packages/server/tests/identity/ceremonies.workerd.test.ts',
        test: 'refuses an invitation of a new person that names no address',
      },
      {
        file: 'packages/server/tests/identity/ceremonies.workerd.test.ts',
        test: 'sends a person who has that address already to the passkey they have',
      },
      {
        file: 'packages/server/tests/http/invitations.workerd.test.ts',
        test: 'mail an invitation that names an address, and show its link to nobody',
      },
    ],
  },
]
