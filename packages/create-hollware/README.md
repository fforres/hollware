# create-hollware

Creates a new project for [Hollware](https://hollware.com), an open-source headless CMS for the
agent era, native to Cloudflare Workers.

```sh
npm create hollware my-cms -- --owner-email you@example.com
pnpm create hollware my-cms --owner-email you@example.com --pm pnpm
```

It copies the starter into `my-cms`, pins every Hollware package at its own version, runs
`git init` and the install, applies the migrations to the local database, and makes your site,
its owner and a first personal token. Then it prints the token once, a link to set up your passkey
for the admin, and the `claude mcp add` line that connects Claude Code to it.

| Option                         | What it does                                                                     |
| ------------------------------ | -------------------------------------------------------------------------------- |
| `--name <name>`                | The name of the Worker and of its database (default: the dir)                    |
| `--site <key>`                 | The key of your site, such as my-site (default: my-site)                         |
| `--preset <name>`              | What the site starts with: blog, docs or empty (default: blog)                   |
| `--locales <list>`             | Its locales, comma-separated, the first the default (default: en)                |
| `--ip-addresses <off\|hashed>` | Whether the activity log keeps a keyed hash of each address (default: off)       |
| `--audit-retention-days <n>`   | Days each line of the activity log is kept, 30 to 3650 (default: forever)        |
| `--token-file <path>`          | Write the first token to this file (mode 0600) and print its path, not the token |
| `--json`                       | One JSON object on stdout and nothing else                                       |
| `--pm <npm\|pnpm>`             | The package manager that installs (default: npm)                                 |
| `--yes`                        | Take the defaults; the directory is `my-hollware`                                |
| `--no-install`                 | Only write the files                                                             |
| `--no-git`                     | Do not run `git init`                                                            |

The directory must be new or empty. Node.js 24 or later.

## Links

- Docs: <https://hollware.com>
- Repository: <https://github.com/hollware/hollware>
- Issues: <https://github.com/hollware/hollware/issues>
- License: MIT
