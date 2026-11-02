# @hollware/agents

## 1.5.0

### Patch Changes

- Updated dependencies [[`9725c1d`](https://github.com/hollware/hollware/commit/9725c1ddb7f4fcb12c8aa1d9a85ebf2a22a2c3b6)]:
  - @hollware/core@1.5.0

## 1.4.0

### Patch Changes

- Updated dependencies []:
  - @hollware/core@1.4.0

## 1.3.0

### Patch Changes

- Updated dependencies [[`ac0553d`](https://github.com/hollware/hollware/commit/ac0553d353d78ecba792d2bbf3731c87a69b52d0)]:
  - @hollware/core@1.3.0

## 1.2.0

### Patch Changes

- Updated dependencies []:
  - @hollware/core@1.2.0

## 1.1.0

### Minor Changes

- [#85](https://github.com/hollware/hollware/pull/85) [`5934bf8`](https://github.com/hollware/hollware/commit/5934bf84b1202d8b558c185e71e41312dabcc400) Thanks [@sergioazoc](https://github.com/sergioazoc)! - `createHollwareAgents()` returns `handle(event, grant, env)`: on `review.requested` delivered over a binding, the reviewer reads that review with the event's grant and comments on each entry it proposes; `grantHollware`, `reviewById` and the types `AgentGrant`, `HollwareEvent` and `HollwareAgentRpc` are exported, `get_review` joins the allowlist, and `HOLLWARE_AGENT_TOKEN` is optional (the cron roles skip without it).

### Patch Changes

- Updated dependencies [[`b4d307a`](https://github.com/hollware/hollware/commit/b4d307ace92e54fe19be97b3ce40e8184fe3ccbf), [`5934bf8`](https://github.com/hollware/hollware/commit/5934bf84b1202d8b558c185e71e41312dabcc400), [`5934bf8`](https://github.com/hollware/hollware/commit/5934bf84b1202d8b558c185e71e41312dabcc400), [`5934bf8`](https://github.com/hollware/hollware/commit/5934bf84b1202d8b558c185e71e41312dabcc400), [`5934bf8`](https://github.com/hollware/hollware/commit/5934bf84b1202d8b558c185e71e41312dabcc400), [`5934bf8`](https://github.com/hollware/hollware/commit/5934bf84b1202d8b558c185e71e41312dabcc400), [`5934bf8`](https://github.com/hollware/hollware/commit/5934bf84b1202d8b558c185e71e41312dabcc400)]:
  - @hollware/core@1.1.0

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

### Patch Changes

- [#24](https://github.com/hollware/hollware/pull/24) [`73110f5`](https://github.com/hollware/hollware/commit/73110f5317dd9da454ad45a84baccedd1403767a) Thanks [@sergioazoc](https://github.com/sergioazoc)! - An upload that opens on an XML declaration and many comments no longer stalls the check of its format, and a URL or a path with thousands of trailing slashes no longer takes seconds to trim: both are read in linear time.

- [#24](https://github.com/hollware/hollware/pull/24) [`73110f5`](https://github.com/hollware/hollware/commit/73110f5317dd9da454ad45a84baccedd1403767a) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The packages carry no comments but the TSDoc of their public API, and the help of the CLI and the descriptions of the MCP tools no longer cite decision records the repository does not have. The starter's `AGENTS.md` now says what each setting of its `wrangler.jsonc` is for.
- Updated dependencies [[`84d96fd`](https://github.com/hollware/hollware/commit/84d96fdbfe0527c5aae28b52d2d5045c8ec69354), [`0647944`](https://github.com/hollware/hollware/commit/06479447b92e584277b0be96162888039e198adb), [`901959b`](https://github.com/hollware/hollware/commit/901959bff6b8de29b8db6206a47c5b2e03efef55), [`8d6edca`](https://github.com/hollware/hollware/commit/8d6edcadbf06f1c4b85c5fe9739fb09a2a1c1f85), [`f31b9fb`](https://github.com/hollware/hollware/commit/f31b9fbbd99f08ab8d094742813f62dc32834d44), [`b29fe9d`](https://github.com/hollware/hollware/commit/b29fe9d074c7b83b77014c59c41a4037d044bed4), [`83f582a`](https://github.com/hollware/hollware/commit/83f582ab6e2483fe94ba7d3953b3b968835443c7), [`4fd2a54`](https://github.com/hollware/hollware/commit/4fd2a54a0426ee128403febc89d45e127c7fa5ac), [`77b98b8`](https://github.com/hollware/hollware/commit/77b98b8e91e34b6b11c70adb16ed5fe35efda837), [`1530a5f`](https://github.com/hollware/hollware/commit/1530a5f2a49cc6e47682e123e35a8d45cef4553b), [`0235865`](https://github.com/hollware/hollware/commit/0235865719899057dc58f7888208c16f1e990eda), [`0075a00`](https://github.com/hollware/hollware/commit/0075a0089e21f378c2295b4f26f5626e866bad67), [`fe98663`](https://github.com/hollware/hollware/commit/fe98663f342ff4f69ea6e579c9dc28670ded00d7), [`44149e0`](https://github.com/hollware/hollware/commit/44149e0d5a2921754521b7be0797306cf2d5cd55), [`18aac23`](https://github.com/hollware/hollware/commit/18aac23e3ef8309fb802437d5166094cb4a7eb03), [`4d9b15e`](https://github.com/hollware/hollware/commit/4d9b15ea2d854cbec6f4390d14317b705d56cc45), [`88965e8`](https://github.com/hollware/hollware/commit/88965e8b3431656e939056cc8cfb7ec0b4206072), [`f16f745`](https://github.com/hollware/hollware/commit/f16f7452e24037ab564f4442839c26b463019d58), [`29e7ecc`](https://github.com/hollware/hollware/commit/29e7ecc893fcb5f145e53b99a7f158b518e423f3), [`73110f5`](https://github.com/hollware/hollware/commit/73110f5317dd9da454ad45a84baccedd1403767a), [`0150c9f`](https://github.com/hollware/hollware/commit/0150c9f4d1be3be699d6987946acd3bc5041e619), [`73110f5`](https://github.com/hollware/hollware/commit/73110f5317dd9da454ad45a84baccedd1403767a), [`b47f74a`](https://github.com/hollware/hollware/commit/b47f74aefaf518df6cc95b8cf9f33388b488cd22), [`42df9fb`](https://github.com/hollware/hollware/commit/42df9fb82477bec5b80385bd1b853f68d89092db), [`3b98d87`](https://github.com/hollware/hollware/commit/3b98d8701f82646554a9355e7523addb2ed5b09c), [`9e93f74`](https://github.com/hollware/hollware/commit/9e93f740a5d3c5fd68d16ea43b2ec79853ab1ee6), [`1310c51`](https://github.com/hollware/hollware/commit/1310c515a6ee07656aac57f3d5cd0fa0e824dd83), [`cebe6bb`](https://github.com/hollware/hollware/commit/cebe6bb99e776214d595f6223744b3fa670dd8ea), [`d0f43a4`](https://github.com/hollware/hollware/commit/d0f43a433a29618c763a8fde6662f777b4bb00e2), [`5e4bee1`](https://github.com/hollware/hollware/commit/5e4bee1adf9d2e119b90ca4ae3c5e07d8055c260), [`7f6ca95`](https://github.com/hollware/hollware/commit/7f6ca9528c258518065dedb22b3703910ec5e985), [`1ab4a4c`](https://github.com/hollware/hollware/commit/1ab4a4c26b492dedc77b1e1289ab883b4a0124d3), [`e6c6fb7`](https://github.com/hollware/hollware/commit/e6c6fb74ce757f74d215564a5174133e2879b1d3), [`4c03dd3`](https://github.com/hollware/hollware/commit/4c03dd3f8fb3a366f095b3f8b84c4704819b714f), [`102ea18`](https://github.com/hollware/hollware/commit/102ea18cbc076fbc47f1128b0f71e98e4dd071d8), [`ca4225d`](https://github.com/hollware/hollware/commit/ca4225d3d0a04eb59323c89156ed167ec1b4b905), [`bce8006`](https://github.com/hollware/hollware/commit/bce80069a466f41ee929f33bd11c302b92e9e3a2), [`2a302dc`](https://github.com/hollware/hollware/commit/2a302dcbe1fb41c10757352312b21861aa60f6d5), [`2244160`](https://github.com/hollware/hollware/commit/2244160693dc307127bced011214b59080832dba), [`865c6c7`](https://github.com/hollware/hollware/commit/865c6c75ebd68f3c30993a0f9f346c9188f7843f), [`51fc47c`](https://github.com/hollware/hollware/commit/51fc47c170d39ce69350c800d287309ba3ebb92e)]:
  - @hollware/core@1.0.0

## 1.0.0-rc.11

### Patch Changes

- Updated dependencies []:
  - @hollware/core@1.0.0-rc.11

## 1.0.0-rc.10

### Patch Changes

- Updated dependencies []:
  - @hollware/core@1.0.0-rc.10

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

- [#24](https://github.com/hollware/hollware/pull/24) [`73110f5`](https://github.com/hollware/hollware/commit/73110f5317dd9da454ad45a84baccedd1403767a) Thanks [@sergioazoc](https://github.com/sergioazoc)! - An upload that opens on an XML declaration and many comments no longer stalls the check of its format, and a URL or a path with thousands of trailing slashes no longer takes seconds to trim: both are read in linear time.

- [#24](https://github.com/hollware/hollware/pull/24) [`73110f5`](https://github.com/hollware/hollware/commit/73110f5317dd9da454ad45a84baccedd1403767a) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The packages carry no comments but the TSDoc of their public API, and the help of the CLI and the descriptions of the MCP tools no longer cite decision records the repository does not have. The starter's `AGENTS.md` now says what each setting of its `wrangler.jsonc` is for.
- Updated dependencies [[`901959b`](https://github.com/hollware/hollware/commit/901959bff6b8de29b8db6206a47c5b2e03efef55), [`b29fe9d`](https://github.com/hollware/hollware/commit/b29fe9d074c7b83b77014c59c41a4037d044bed4), [`4fd2a54`](https://github.com/hollware/hollware/commit/4fd2a54a0426ee128403febc89d45e127c7fa5ac), [`77b98b8`](https://github.com/hollware/hollware/commit/77b98b8e91e34b6b11c70adb16ed5fe35efda837), [`fe98663`](https://github.com/hollware/hollware/commit/fe98663f342ff4f69ea6e579c9dc28670ded00d7), [`44149e0`](https://github.com/hollware/hollware/commit/44149e0d5a2921754521b7be0797306cf2d5cd55), [`18aac23`](https://github.com/hollware/hollware/commit/18aac23e3ef8309fb802437d5166094cb4a7eb03), [`4d9b15e`](https://github.com/hollware/hollware/commit/4d9b15ea2d854cbec6f4390d14317b705d56cc45), [`73110f5`](https://github.com/hollware/hollware/commit/73110f5317dd9da454ad45a84baccedd1403767a), [`73110f5`](https://github.com/hollware/hollware/commit/73110f5317dd9da454ad45a84baccedd1403767a), [`42df9fb`](https://github.com/hollware/hollware/commit/42df9fb82477bec5b80385bd1b853f68d89092db), [`3b98d87`](https://github.com/hollware/hollware/commit/3b98d8701f82646554a9355e7523addb2ed5b09c), [`7f6ca95`](https://github.com/hollware/hollware/commit/7f6ca9528c258518065dedb22b3703910ec5e985), [`e6c6fb7`](https://github.com/hollware/hollware/commit/e6c6fb74ce757f74d215564a5174133e2879b1d3), [`2a302dc`](https://github.com/hollware/hollware/commit/2a302dcbe1fb41c10757352312b21861aa60f6d5), [`2244160`](https://github.com/hollware/hollware/commit/2244160693dc307127bced011214b59080832dba)]:
  - @hollware/core@1.0.0-rc.9

## 1.0.0-rc.8

### Patch Changes

- Updated dependencies []:
  - @hollware/core@1.0.0-rc.8

## 1.0.0-rc.7

### Patch Changes

- Updated dependencies [[`0647944`](https://github.com/hollware/hollware/commit/06479447b92e584277b0be96162888039e198adb)]:
  - @hollware/core@1.0.0-rc.7

## 1.0.0-rc.6

### Patch Changes

- Updated dependencies []:
  - @hollware/core@1.0.0-rc.6

## 1.0.0-rc.5

### Patch Changes

- Updated dependencies [[`88965e8`](https://github.com/hollware/hollware/commit/88965e8b3431656e939056cc8cfb7ec0b4206072)]:
  - @hollware/core@1.0.0-rc.5

## 1.0.0-rc.4

### Patch Changes

- Updated dependencies [[`9e93f74`](https://github.com/hollware/hollware/commit/9e93f740a5d3c5fd68d16ea43b2ec79853ab1ee6)]:
  - @hollware/core@1.0.0-rc.4

## 1.0.0-rc.3

### Patch Changes

- Updated dependencies [[`8d6edca`](https://github.com/hollware/hollware/commit/8d6edcadbf06f1c4b85c5fe9739fb09a2a1c1f85), [`f31b9fb`](https://github.com/hollware/hollware/commit/f31b9fbbd99f08ab8d094742813f62dc32834d44), [`83f582a`](https://github.com/hollware/hollware/commit/83f582ab6e2483fe94ba7d3953b3b968835443c7), [`1530a5f`](https://github.com/hollware/hollware/commit/1530a5f2a49cc6e47682e123e35a8d45cef4553b), [`0235865`](https://github.com/hollware/hollware/commit/0235865719899057dc58f7888208c16f1e990eda), [`0075a00`](https://github.com/hollware/hollware/commit/0075a0089e21f378c2295b4f26f5626e866bad67), [`29e7ecc`](https://github.com/hollware/hollware/commit/29e7ecc893fcb5f145e53b99a7f158b518e423f3), [`0150c9f`](https://github.com/hollware/hollware/commit/0150c9f4d1be3be699d6987946acd3bc5041e619), [`1310c51`](https://github.com/hollware/hollware/commit/1310c515a6ee07656aac57f3d5cd0fa0e824dd83), [`cebe6bb`](https://github.com/hollware/hollware/commit/cebe6bb99e776214d595f6223744b3fa670dd8ea), [`d0f43a4`](https://github.com/hollware/hollware/commit/d0f43a433a29618c763a8fde6662f777b4bb00e2), [`5e4bee1`](https://github.com/hollware/hollware/commit/5e4bee1adf9d2e119b90ca4ae3c5e07d8055c260), [`1ab4a4c`](https://github.com/hollware/hollware/commit/1ab4a4c26b492dedc77b1e1289ab883b4a0124d3), [`4c03dd3`](https://github.com/hollware/hollware/commit/4c03dd3f8fb3a366f095b3f8b84c4704819b714f), [`102ea18`](https://github.com/hollware/hollware/commit/102ea18cbc076fbc47f1128b0f71e98e4dd071d8), [`ca4225d`](https://github.com/hollware/hollware/commit/ca4225d3d0a04eb59323c89156ed167ec1b4b905), [`bce8006`](https://github.com/hollware/hollware/commit/bce80069a466f41ee929f33bd11c302b92e9e3a2), [`865c6c7`](https://github.com/hollware/hollware/commit/865c6c75ebd68f3c30993a0f9f346c9188f7843f)]:
  - @hollware/core@1.0.0-rc.3

## 1.0.0-rc.2

### Patch Changes

- Updated dependencies [[`f16f745`](https://github.com/hollware/hollware/commit/f16f7452e24037ab564f4442839c26b463019d58), [`51fc47c`](https://github.com/hollware/hollware/commit/51fc47c170d39ce69350c800d287309ba3ebb92e)]:
  - @hollware/core@1.0.0-rc.2

## 1.0.0-rc.1

### Patch Changes

- Updated dependencies [[`84d96fd`](https://github.com/hollware/hollware/commit/84d96fdbfe0527c5aae28b52d2d5045c8ec69354)]:
  - @hollware/core@1.0.0-rc.1

## 1.0.0-rc.0

### Patch Changes

- Updated dependencies [[`b47f74a`](https://github.com/hollware/hollware/commit/b47f74aefaf518df6cc95b8cf9f33388b488cd22)]:
  - @hollware/core@1.0.0-rc.0

## 0.11.0

### Patch Changes

- Updated dependencies [[`069c95f`](https://github.com/hollware/hollware/commit/069c95f1e940ea4f9ac013cac3a69d5ad5d7732d), [`304e18d`](https://github.com/hollware/hollware/commit/304e18d68482c88db6987e2453bcfa0b75467595), [`ead05f6`](https://github.com/hollware/hollware/commit/ead05f60b7240ede34e78a9f2694a238ac8932a6), [`5e24d98`](https://github.com/hollware/hollware/commit/5e24d987c38466a315bcb3b94c3dfa23de90e71f)]:
  - @hollware/core@0.11.0

## 0.10.0

### Patch Changes

- Updated dependencies [[`eb4df6d`](https://github.com/hollware/hollware/commit/eb4df6dd3a8eafc7b04266478a2f0950adea0bbc), [`6a8e7b5`](https://github.com/hollware/hollware/commit/6a8e7b57f894722d808f1708b353884ad2f0a6d7), [`ad56b86`](https://github.com/hollware/hollware/commit/ad56b8656041396926ab9b1de602cf15519a5f38), [`75341bf`](https://github.com/hollware/hollware/commit/75341bf1134084e2ac8b316a661ee46fe863b1ca)]:
  - @hollware/core@0.10.0

## 0.9.1

### Patch Changes

- Updated dependencies []:
  - @hollware/core@0.9.1

## 0.9.0

### Patch Changes

- Updated dependencies []:
  - @hollware/core@0.9.0

## 0.8.0

### Patch Changes

- Updated dependencies [[`501174a`](https://github.com/hollware/hollware/commit/501174a4b9cd7e0a5191fa587c09e39f71ff3bd7), [`eaa743d`](https://github.com/hollware/hollware/commit/eaa743d4f6a6cb7ec5977f73379e6f414f43403f), [`f2f2c3d`](https://github.com/hollware/hollware/commit/f2f2c3d6ac6123d26bc1bc0d2b668b61d42afd9d), [`d1ea96e`](https://github.com/hollware/hollware/commit/d1ea96e61df8a7b58e0a9b5e76b85abdddc78a7a), [`3f3cb16`](https://github.com/hollware/hollware/commit/3f3cb16b9779defecc14c95b6607989a3dd22367), [`286149b`](https://github.com/hollware/hollware/commit/286149b7106adb84b5ee02b0433dc780b50be6e3)]:
  - @hollware/core@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies [[`e43c814`](https://github.com/hollware/hollware/commit/e43c81420272ed1a0835ec681df11ac4cc259539)]:
  - @hollware/core@0.7.0

## 0.6.0

### Minor Changes

- [`03df44d`](https://github.com/hollware/hollware/commit/03df44d3ff8a24a3b285645f137cd973ff9e1b9c) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The agents fit the Workers free plan: Hollware's cron wakes them every ten minutes over an `AGENTS` service binding to their `run` entrypoint, so they need no cron trigger of their own (five per account), and each run is one agent in turn, within the fifty calls a free run may make (the translator reads each locale in one listing, the reviewer takes eight reviews a run, the auditor checks a dozen entries a run and writes its report from them once a week). Their requests carry the Host of Hollware's public URL, which a service binding does not set. `hollware migrate --remote` takes a Time Travel bookmark of a database D1 cannot export, as any database with the full-text index of 0.5 is, instead of stopping.

- [`30339e0`](https://github.com/hollware/hollware/commit/30339e000c290ddbceab88161be35ef071ccbe0e) Thanks [@sergioazoc](https://github.com/sergioazoc)! - `@hollware/agents` (ADR-032): a reviewer that comments once on each pending review, a translator that drafts the missing translation of a published entry, fixes what the contracts refuse and asks for its review, and a weekly auditor that reports old but much-read entries and published entries the contracts refuse now, as a draft and optionally to a webhook such as Slack's. They run on a Worker of their own made by `createHollwareAgents`, reach Hollware over MCP with a personal token, and never publish: their client refuses every tool that publishes or decides. The new tool `request_review` asks for a review after the same checks as `publish` and never publishes, whatever the caller's scopes.

### Patch Changes

- Updated dependencies [[`30339e0`](https://github.com/hollware/hollware/commit/30339e000c290ddbceab88161be35ef071ccbe0e), [`059ecdf`](https://github.com/hollware/hollware/commit/059ecdffdd9d4394918dd594cf855898bf34b6d1)]:
  - @hollware/core@0.6.0
