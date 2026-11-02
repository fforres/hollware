---
'@hollware/core': minor
'@hollware/server': minor
'@hollware/admin': minor
'hollware': minor
'create-hollware': minor
---

Two roles join owner, editor and author: an admin runs the site and its people with every scope of an owner but the new `site:owner`, which names, changes and removes owners, deletes and restores sites, reads backups, purges entries and anonymizes people; a reviewer reads and comments. A site may let reviewers in through `access.autoProvision`.

Invitations are mailed: with a `send_email` binding `EMAIL` of Cloudflare Email Service and `HOLLWARE_EMAIL_FROM`, an invitation that names an address goes to it in the inviter's language, its link is shown to nobody, and the address of whoever accepts it is verified. Without them, or when the mail fails, the admin shows the link as before. An invitation can be renewed with a new link, an expired one stays listed until it is renewed or revoked, and a second invitation of an address or one of a member is refused.

Every account of a person has an address. An invitation names one, in the admin, in `POST /v1/admin/invitations` and in `hollware invite --email`, and the account made from it keeps it, verified when Hollware mailed the link or when the person signs in with it through a provider. `hollware init` and `npm create hollware` ask for `--owner-email`.

A person of this Hollware accepts an invitation to another site with the passkey they have, from the setup page, instead of making a second account. In the admin a reviewer reads entries without an editor, and what a person sees follows their scopes.

Migration `0032_roles_and_invitations` rebuilds `members`, `invitations` and `auth_challenges`. Tokens of an owner made before it carry no `site:owner`: make a new one for `hollware backup` and the site's deletion.
