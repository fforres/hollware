# Hollware

A headless CMS for the agent era, native to Cloudflare.

> [!NOTE]
> **1.0.** `npm create hollware` installs it. Agents write and publish over MCP with contracts on every write, people review in an admin with passkeys, sites read over a service binding or HTTP, images live in R2, and one deployment serves several sites. The API follows semver ([Versions and stability](https://hollware.com/docs/versions/)). The docs are at [hollware.com](https://hollware.com).

## Get started

```sh
npm create hollware my-cms -- --owner-email you@example.com
```

It makes a project, its local database, your site and a token, and prints the command that connects Claude Code to it. The [quickstart](https://hollware.com/docs/quickstart/) goes from there to a deployed Hollware.

Hollware is designed for teams that already have a frontend and want their AI agents to write the content. Agents write Markdown over [MCP](https://modelcontextprotocol.io), contracts check every write, and sites read what was published from Hollware, which runs in your own Cloudflare account.

## Principles

Hollware's thesis is stated as five principles. They describe what Hollware is committed to be, not what exists today. If a future decision contradicts one, the decision changes or the principle is rewritten here, never silently.

1. **Headless, always.** Hollware does not render sites and has no themes. It delivers content to any frontend: Nuxt, Astro, Next or the app of a product.
2. **The agent is the primary editor.** MCP is the first-class interface: whatever the admin does to content and to the structure of a site, an agent can do over MCP. The admin exists to review and approve. Who may sign in, and what a token may do, stays with people: invitations, roles and tokens are made in the admin or the CLI, never over MCP.
3. **Contracts at write time.** Quality rules run when content is written. The error goes back to the agent within milliseconds, with an instruction on how to fix it, instead of failing a CI pipeline ten minutes later.
4. **Markdown is the source of truth.** It is what agents write and read best, and it produces readable diffs. [Comark](https://comark.dev) compiles it into a derived document that can be regenerated at any time.
5. **Cloudflare-native.** Every piece is a Cloudflare primitive, and it all deploys to your own account. What it costs follows what your sites use, at Cloudflare's prices.

## How it works

- **Agents write over MCP.** An agent creates or updates an entry as Markdown with frontmatter, through the Model Context Protocol.
- **Contracts validate on write.** Every write is checked against the collection's contracts: the frontmatter schema, the components allowed in the body and rules across entries. Violations come back to the agent with an instruction on how to fix them. They block publishing, not saving a draft.
- **D1 is the single source of truth.** Entries and their append-only revisions live in [D1](https://developers.cloudflare.com/d1/), Cloudflare's SQL database. An edit made on top of a stale version is rejected as a conflict instead of overwriting newer work.
- **Sites read what was published.** A site on Cloudflare reads over [Workers RPC](https://developers.cloudflare.com/workers/runtime-apis/rpc/) through a service binding: typed, without crossing the public internet, and with no token to manage. Sites elsewhere read over HTTP with a read token, or with `@hollware/nuxt`.

## Out of scope

Some things are deliberately not part of Hollware:

- Rendering sites or shipping themes.
- A visual page builder.
- A plugin marketplace.
- Running outside Cloudflare, not before v1.
- Importing from WordPress, not before v1.

## Roadmap

Hollware was built one stage at a time, each ending with an exit criterion that was verified. 1.0 is the last of them.

| Stage | Name         | Goal                                                                                                                    |
| ----- | ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| F0    | Foundations  | A public repository that explains the thesis, with a minimal end-to-end skeleton of the stack before the first feature. |
| v0.1  | Core         | An agent writes and publishes over MCP, contracts are checked on every write, and an example site reads over RPC.       |
| v0.2  | Publishing   | Publishing is a durable, observable process: on the demo, a post is live in under a minute, with no CI.                 |
| v0.3  | Admin        | A full post can be reviewed, approved and published from the admin, without a coding agent or git.                      |
| v0.4  | Distribution | Anyone can install Hollware from the documentation, and a second site, the docs, runs on the same deployment.           |
| v0.5  | Intelligence | Agents use the existing content and its metrics to write better.                                                        |
| v1.0  | Stable       | A frozen, semver-stable API and three sites in production.                                                              |

## Packages

Eleven packages, released together at one version, in the order they arrived.

| Package                                       | What it is                                                                                  | Since |
| --------------------------------------------- | ------------------------------------------------------------------------------------------- | ----- |
| [`@hollware/core`](packages/core)             | Contracts, operation specs, schemas and the Markdown pipeline. No Cloudflare dependencies.  | v0.1  |
| [`@hollware/server`](packages/server)         | The Worker: operation handlers, MCP, RPC, HTTP, auth and the D1 migrations.                 | v0.1  |
| [`hollware`](packages/cli)                    | The CLI: init, dev, deploy, doctor, migrate, tokens, import and export.                     | v0.1  |
| [`@hollware/client`](packages/client)         | The same typed interface over a service binding or over HTTP.                               | v0.2  |
| [`@hollware/admin`](packages/admin)           | The review and approval UI, prebuilt and served by the Worker.                              | v0.3  |
| [`create-hollware`](packages/create-hollware) | `npm create hollware`: scaffolds a new project.                                             | v0.4  |
| [`@hollware/nuxt`](packages/nuxt)             | Reads Hollware from a Nuxt site, over a service binding or HTTP.                            | v0.4  |
| [`@hollware/astro`](packages/astro)           | Reads Hollware from an Astro site, as content loaders, over a service binding or HTTP.      | v0.10 |
| [`@hollware/react`](packages/react)           | Reads Hollware from any React app: server helpers, previews, a component for an entry.      | v0.10 |
| [`@hollware/vue`](packages/vue)               | Reads Hollware from a Vue 3 app that is not Nuxt: a component, server helpers, composables. | v0.10 |
| [`@hollware/agents`](packages/agents)         | A reviewer, a translator and a weekly auditor on a Worker; none publishes.                  | v0.6  |

## Contributing

Contributions are welcome. [`CONTRIBUTING.md`](CONTRIBUTING.md) explains how to set up the repository and what a good pull request looks like, and everyone taking part is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md). Coding agents start from [`AGENTS.md`](AGENTS.md).

Report security vulnerabilities privately, never in a public issue. [`SECURITY.md`](SECURITY.md) explains how.

## The name

_Hollow_ is a CMS with no head and no servers to run, and _hollowware_ is tableware, like teapots and pitchers, made to hold and serve. The name is also a nod to World of Warcraft's Hallow's End and its Headless Horseman.

## License

Hollware is released under the [MIT License](LICENSE).
