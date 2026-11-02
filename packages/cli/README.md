# hollware

The command line of [Hollware](https://github.com/hollware/hollware), an open-source headless
CMS for the agent era, native to Cloudflare Workers.

It comes with every project that `npm create hollware` makes, and works on the project of the
current directory through its wrangler. POSIX shells only: it has not been tried on Windows.

## Commands

| Command      | Purpose                                                                          |
| ------------ | -------------------------------------------------------------------------------- |
| `init`       | Create a site, its owner and a first personal token in the project's D1 database |
| `dev`        | Start the local server, in the foreground or with `--detach`, and stop it        |
| `mcp-config` | Print what connects an MCP client: the `claude mcp add` line, or `.mcp.json`     |
| `migrate`    | Apply D1 migrations; `--check` lists the pending ones, `--remote` backs up first |
| `deploy`     | Deploy to Cloudflare, creating what the project needs, and migrate the database  |
| `doctor`     | Check the project, its bindings, its database and its owner, with what to fix    |
| `token`      | Create, list and revoke personal tokens, and read tokens with `--read`           |
| `invite`     | Invite a person to the admin by their address: admin, editor, author or reviewer |
| `agent`      | Add, list and remove the agent members of a site, and revoke their grants        |
| `import`     | Import Markdown over MCP, as drafts; from a Nuxt Content site with `--from`      |
| `export`     | Export entries and their images over MCP, the layout `import` reads              |
| `promote`    | Copy what one Hollware publishes to another, as one review                       |
| `backup`     | List the daily backups of a site, and write one as files                         |
| `analytics`  | Connect the site's own analytics, so agents see what readers read                |

Every command answers `--help`. A command that fails prints one message on stderr, with what to
do, and exits with code 1.

### Moving a site to Hollware

`import --from nuxt-content` reads the content directory of a Nuxt Content site as the files Hollware
imports, and validates them all before it writes anything:

```sh
# With --locale-dirs, content/<locale>/… and the translations of each page
npx hollware import ./content --from nuxt-content --collection docs --locale-dirs --url https://cms.example.com --token-file ./token.txt
```

A page keeps its Markdown byte for byte (Comark reads MDC), with its slug as Nuxt Content routes
it and a `title` from its first heading when it has none.

With `--public-dir ./public`, the images the pages show by path are uploaded too: an absolute
path from that folder, a relative one from the folder of the page, in the Markdown or as a value
of the frontmatter. Each file is uploaded once, however many pages show it, and its reference becomes
`asset:ast_…`. A missing image, or one over 10 MB, stops the import before anything is sent.

## A first run

In a Hollware project (the starter has the D1 binding `DB` in its `wrangler.jsonc`):

```sh
hollware migrate                         # create the tables in the local database
hollware init --site blog --owner-email you@example.com   # the site and its owner; a token, once
hollware token create --label ci --scopes content:read,content:write
hollware token list                      # never shows a hash
hollware token revoke tok_01JAB3XQ8ZK4M6N2P5R7S9T0VW
```

To put it on Cloudflare, log in with `wrangler login` and run `hollware deploy`: the first deploy
creates the D1 database, the KV namespace and the queues, writes their ids and the public URL of
the Worker into `wrangler.jsonc`, and applies the migrations. Then `hollware init --site blog
--owner-email you@example.com --remote` makes the site in it.

### Staging and production

Each environment is an `env` of `wrangler.jsonc`, with its own Worker, D1 database, KV namespace,
buckets and `HOLLWARE_PUBLIC_URL`, and `CLOUDFLARE_ENV` picks it for the build, wrangler and
hollware alike:

```sh
export CLOUDFLARE_ENV=staging
vp build                                  # the build of env.staging
wrangler deploy                           # the first time, creates the D1, KV and R2 it names
hollware migrate --remote                 # only once the D1 exists
hollware init --site blog --owner-email you@example.com --remote --url https://cms-staging.example.com
```

`migrate --remote` cannot run before the first deploy: the D1 database of the environment does not
exist until wrangler creates it. `init --url` gives the link of the owner the URL of that
environment, since hollware reads the `HOLLWARE_PUBLIC_URL` at the top of `wrangler.jsonc`. Then
shape the site as any other, in the admin or with `update_site` over MCP, and copy content between
the two with `hollware promote --from <staging url> --to <production url>`.

Add `--remote` to work on the database in Cloudflare instead (it needs `wrangler login` or a
`CLOUDFLARE_API_TOKEN`). `migrate --remote` first exports the database to
`.wrangler/hollware-backups` and stops if that fails; a new database, with none of the
migrations, has nothing to back up. `--database <name>` picks another D1
database than the binding `DB`. `--site <key>` picks a site when the database has several.

Put the token that `init` printed in a file only you can read, and import a directory of
Markdown, laid out as `<collection>/<locale>/<slug>.md`, into a running Hollware:

```sh
hollware import ./content --url https://cms.example.com --token-file ./token.txt --dry-run
hollware import ./content --url https://cms.example.com --token-file ./token.txt --publish
```

`import` validates every file first and writes nothing if one would be refused. Running it
again changes nothing: every entry answers `unchanged`. With `--publish` it publishes the
entries that have unpublished changes, and it acknowledges no warning: an entry with warnings is
reported, and the command exits with code 1. The token never appears in its output.

`export` is its mirror: it writes the entries of the site of the token, as
`<collection>/<locale>/<slug>.md`, into a directory that must be empty or not exist:

```sh
hollware export ./backup --url https://cms.example.com --token-file ./token.txt
hollware export ./live --url https://cms.example.com --token-file ./token.txt --published
```

Each file is the revision as Hollware keeps it, byte for byte, so importing an export into the
same site changes nothing. By default it writes the latest revision of every entry, drafts
included; `--published` writes only the published entries, as they are published. Entries in
the trash are left out. `--collection` and `--locale` narrow it (repeat them for several),
`--dry-run` lists the files and writes nothing, and a token with `content:read` is enough.

## How it works

`init`, `migrate`, `deploy`, `doctor` and `token` run the project's own `wrangler` (the nearest
`node_modules/.bin/wrangler`) against its D1 database, and read the binding from `wrangler.jsonc`.
`import` and `export` speak MCP to `<url>/mcp` with the token as a bearer token. The structure of the sites
lives in the database: `init` gives a new site its first definition from a preset, and
its owner shapes it in the admin, or an agent over MCP.

## Links

- Repository: <https://github.com/hollware/hollware>
- Issues: <https://github.com/hollware/hollware/issues>
- License: MIT
