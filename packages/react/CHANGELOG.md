# @hollware/react

## 1.5.0

### Patch Changes

- Updated dependencies [[`9725c1d`](https://github.com/hollware/hollware/commit/9725c1ddb7f4fcb12c8aa1d9a85ebf2a22a2c3b6)]:
  - @hollware/core@1.5.0
  - @hollware/client@1.5.0

## 1.4.0

### Patch Changes

- Updated dependencies []:
  - @hollware/client@1.4.0
  - @hollware/core@1.4.0

## 1.3.0

### Patch Changes

- Updated dependencies [[`ac0553d`](https://github.com/hollware/hollware/commit/ac0553d353d78ecba792d2bbf3731c87a69b52d0)]:
  - @hollware/core@1.3.0
  - @hollware/client@1.3.0

## 1.2.0

### Patch Changes

- Updated dependencies [[`0cfa409`](https://github.com/hollware/hollware/commit/0cfa409f4f2c3f21326f281241e7d7889f018e89)]:
  - @hollware/client@1.2.0
  - @hollware/core@1.2.0

## 1.1.0

### Minor Changes

- [#85](https://github.com/hollware/hollware/pull/85) [`5934bf8`](https://github.com/hollware/hollware/commit/5934bf84b1202d8b558c185e71e41312dabcc400) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A collection may declare `navigation: { groupBy, groups, orderBy }`: a string or enum field that groups its entries, the groups in order (an enum's own order when none are given), and a number field that orders each group before the title. `getNavigation(site, collection, { locale })` answers the published entries of a locale arranged that way, with their title, description, path and order, over RPC, `GET /v1/:collection/navigation` and the client (`HollwareReader.getNavigation`, `createHollware().getNavigation`). A collection without one is a single group by title; more than 1,000 published entries in the locale are refused. The `docs` preset groups by `section` and orders by `order`. `@hollware/nuxt` adds `useHollwareNavigation` and `/_hollware/navigation/:collection`, `@hollware/vue` `useHollwareNavigation`, and `@hollware/astro` `hollwareNavigation`.

### Patch Changes

- Updated dependencies [[`b4d307a`](https://github.com/hollware/hollware/commit/b4d307ace92e54fe19be97b3ce40e8184fe3ccbf), [`5934bf8`](https://github.com/hollware/hollware/commit/5934bf84b1202d8b558c185e71e41312dabcc400), [`5934bf8`](https://github.com/hollware/hollware/commit/5934bf84b1202d8b558c185e71e41312dabcc400), [`5934bf8`](https://github.com/hollware/hollware/commit/5934bf84b1202d8b558c185e71e41312dabcc400), [`5934bf8`](https://github.com/hollware/hollware/commit/5934bf84b1202d8b558c185e71e41312dabcc400), [`5934bf8`](https://github.com/hollware/hollware/commit/5934bf84b1202d8b558c185e71e41312dabcc400), [`5934bf8`](https://github.com/hollware/hollware/commit/5934bf84b1202d8b558c185e71e41312dabcc400)]:
  - @hollware/core@1.1.0
  - @hollware/client@1.1.0

## 1.0.0

### Minor Changes

- [`e4b8296`](https://github.com/hollware/hollware/commit/e4b8296ac4f525f5ee969f2bcd1cb466b06be3e4) Thanks [@sergioazoc](https://github.com/sergioazoc)! - `createHollware` (and so `@hollware/react` and `@hollware/vue`) reads `search` and `describeSite` too, as the binding and the read API already did: a site's search page needs no reader of its own.

- [`88965e8`](https://github.com/hollware/hollware/commit/88965e8b3431656e939056cc8cfb7ec0b4206072) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Components to render entries in every framework:

  - `<HollwareImage>` in React, Vue and Nuxt renders the image a frontmatter field holds (a cover) with its alt, its size and the `srcset` of its copies; `imageOf(entry, field)` of `@hollware/client` gives the same attributes for any other renderer. The `images` of a summary carry the alt of each image.
  - `@hollware/astro` exports `HollwareContent.astro`, which renders an entry from its document with the site's own Astro components (`components={{ callout: Callout }}`), through the same rules as the HTML Hollware makes, and `HollwareImage.astro`. Its loaders keep the document and the images of each entry for them.
  - `safeDocument` of `@hollware/core` copies a document through the rules of `renderHtml`, for a renderer of a site's own.

- [`5e4bee1`](https://github.com/hollware/hollware/commit/5e4bee1adf9d2e119b90ca4ae3c5e07d8055c260) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Responsive images: when an image is uploaded, Hollware also makes its narrower copies, the `media.widths` of the site (640 and 1280 pixels by default, `[]` for none), served at `<url>/<width>`. `upload_asset`, `get_asset` and `list_assets` answer `widths` and `srcset`; the HTML of `get_entry`, and the document a site reads, give each image its `srcset`, `sizes`, `width` and `height`; and a summary read by a site (`get_entry`, `list_entries`, `createHollware()`) carries `images`, the size and `srcset` of each image its frontmatter names, by URL, to lay out a cover. The admin sets the format, quality, widest width and copies in Site, and shows the copies of each image. Images uploaded before keep none.

### Patch Changes

- [#55](https://github.com/hollware/hollware/pull/55) [`77b98b8`](https://github.com/hollware/hollware/commit/77b98b8e91e34b6b11c70adb16ed5fe35efda837) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Comark 0.8.1, with its fixes for URLs, markup and nested props. The documents of the shared fixtures come out the same, byte for byte, as with 0.7.0, and the cron reparses the revisions that 0.7.0 parsed. Two things change. A code block renders its language as `data-language` on the `<pre>`. And as Comark keeps 49 levels of nesting and drops the text below them, a document that nests elements more than 49 levels deep is refused with its fix, where 100 was the limit, so no word is lost quietly.

- [#24](https://github.com/hollware/hollware/pull/24) [`73110f5`](https://github.com/hollware/hollware/commit/73110f5317dd9da454ad45a84baccedd1403767a) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The packages carry no comments but the TSDoc of their public API, and the help of the CLI and the descriptions of the MCP tools no longer cite decision records the repository does not have. The starter's `AGENTS.md` now says what each setting of its `wrangler.jsonc` is for.
- Updated dependencies [[`84d96fd`](https://github.com/hollware/hollware/commit/84d96fdbfe0527c5aae28b52d2d5045c8ec69354), [`0647944`](https://github.com/hollware/hollware/commit/06479447b92e584277b0be96162888039e198adb), [`901959b`](https://github.com/hollware/hollware/commit/901959bff6b8de29b8db6206a47c5b2e03efef55), [`8d6edca`](https://github.com/hollware/hollware/commit/8d6edcadbf06f1c4b85c5fe9739fb09a2a1c1f85), [`f31b9fb`](https://github.com/hollware/hollware/commit/f31b9fbbd99f08ab8d094742813f62dc32834d44), [`b29fe9d`](https://github.com/hollware/hollware/commit/b29fe9d074c7b83b77014c59c41a4037d044bed4), [`83f582a`](https://github.com/hollware/hollware/commit/83f582ab6e2483fe94ba7d3953b3b968835443c7), [`4fd2a54`](https://github.com/hollware/hollware/commit/4fd2a54a0426ee128403febc89d45e127c7fa5ac), [`e4b8296`](https://github.com/hollware/hollware/commit/e4b8296ac4f525f5ee969f2bcd1cb466b06be3e4), [`77b98b8`](https://github.com/hollware/hollware/commit/77b98b8e91e34b6b11c70adb16ed5fe35efda837), [`1530a5f`](https://github.com/hollware/hollware/commit/1530a5f2a49cc6e47682e123e35a8d45cef4553b), [`0235865`](https://github.com/hollware/hollware/commit/0235865719899057dc58f7888208c16f1e990eda), [`0075a00`](https://github.com/hollware/hollware/commit/0075a0089e21f378c2295b4f26f5626e866bad67), [`fe98663`](https://github.com/hollware/hollware/commit/fe98663f342ff4f69ea6e579c9dc28670ded00d7), [`44149e0`](https://github.com/hollware/hollware/commit/44149e0d5a2921754521b7be0797306cf2d5cd55), [`18aac23`](https://github.com/hollware/hollware/commit/18aac23e3ef8309fb802437d5166094cb4a7eb03), [`4d9b15e`](https://github.com/hollware/hollware/commit/4d9b15ea2d854cbec6f4390d14317b705d56cc45), [`88965e8`](https://github.com/hollware/hollware/commit/88965e8b3431656e939056cc8cfb7ec0b4206072), [`f16f745`](https://github.com/hollware/hollware/commit/f16f7452e24037ab564f4442839c26b463019d58), [`29e7ecc`](https://github.com/hollware/hollware/commit/29e7ecc893fcb5f145e53b99a7f158b518e423f3), [`73110f5`](https://github.com/hollware/hollware/commit/73110f5317dd9da454ad45a84baccedd1403767a), [`0150c9f`](https://github.com/hollware/hollware/commit/0150c9f4d1be3be699d6987946acd3bc5041e619), [`73110f5`](https://github.com/hollware/hollware/commit/73110f5317dd9da454ad45a84baccedd1403767a), [`b47f74a`](https://github.com/hollware/hollware/commit/b47f74aefaf518df6cc95b8cf9f33388b488cd22), [`ea570be`](https://github.com/hollware/hollware/commit/ea570be69416f9a9b87d6d3a449975a42a58ab48), [`42df9fb`](https://github.com/hollware/hollware/commit/42df9fb82477bec5b80385bd1b853f68d89092db), [`3b98d87`](https://github.com/hollware/hollware/commit/3b98d8701f82646554a9355e7523addb2ed5b09c), [`9e93f74`](https://github.com/hollware/hollware/commit/9e93f740a5d3c5fd68d16ea43b2ec79853ab1ee6), [`1310c51`](https://github.com/hollware/hollware/commit/1310c515a6ee07656aac57f3d5cd0fa0e824dd83), [`cebe6bb`](https://github.com/hollware/hollware/commit/cebe6bb99e776214d595f6223744b3fa670dd8ea), [`d0f43a4`](https://github.com/hollware/hollware/commit/d0f43a433a29618c763a8fde6662f777b4bb00e2), [`5e4bee1`](https://github.com/hollware/hollware/commit/5e4bee1adf9d2e119b90ca4ae3c5e07d8055c260), [`7f6ca95`](https://github.com/hollware/hollware/commit/7f6ca9528c258518065dedb22b3703910ec5e985), [`1ab4a4c`](https://github.com/hollware/hollware/commit/1ab4a4c26b492dedc77b1e1289ab883b4a0124d3), [`e6c6fb7`](https://github.com/hollware/hollware/commit/e6c6fb74ce757f74d215564a5174133e2879b1d3), [`4c03dd3`](https://github.com/hollware/hollware/commit/4c03dd3f8fb3a366f095b3f8b84c4704819b714f), [`102ea18`](https://github.com/hollware/hollware/commit/102ea18cbc076fbc47f1128b0f71e98e4dd071d8), [`ca4225d`](https://github.com/hollware/hollware/commit/ca4225d3d0a04eb59323c89156ed167ec1b4b905), [`bce8006`](https://github.com/hollware/hollware/commit/bce80069a466f41ee929f33bd11c302b92e9e3a2), [`2a302dc`](https://github.com/hollware/hollware/commit/2a302dcbe1fb41c10757352312b21861aa60f6d5), [`2244160`](https://github.com/hollware/hollware/commit/2244160693dc307127bced011214b59080832dba), [`865c6c7`](https://github.com/hollware/hollware/commit/865c6c75ebd68f3c30993a0f9f346c9188f7843f), [`51fc47c`](https://github.com/hollware/hollware/commit/51fc47c170d39ce69350c800d287309ba3ebb92e)]:
  - @hollware/core@1.0.0
  - @hollware/client@1.0.0

## 1.0.0-rc.11

### Patch Changes

- Updated dependencies []:
  - @hollware/client@1.0.0-rc.11
  - @hollware/core@1.0.0-rc.11

## 1.0.0-rc.10

### Patch Changes

- Updated dependencies []:
  - @hollware/client@1.0.0-rc.10
  - @hollware/core@1.0.0-rc.10

## 1.0.0-rc.9

### Patch Changes

- [#55](https://github.com/hollware/hollware/pull/55) [`77b98b8`](https://github.com/hollware/hollware/commit/77b98b8e91e34b6b11c70adb16ed5fe35efda837) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Comark 0.8.1, with its fixes for URLs, markup and nested props. The documents of the shared fixtures come out the same, byte for byte, as with 0.7.0, and the cron reparses the revisions that 0.7.0 parsed. Two things change. A code block renders its language as `data-language` on the `<pre>`. And as Comark keeps 49 levels of nesting and drops the text below them, a document that nests elements more than 49 levels deep is refused with its fix, where 100 was the limit, so no word is lost quietly.

- [#24](https://github.com/hollware/hollware/pull/24) [`73110f5`](https://github.com/hollware/hollware/commit/73110f5317dd9da454ad45a84baccedd1403767a) Thanks [@sergioazoc](https://github.com/sergioazoc)! - The packages carry no comments but the TSDoc of their public API, and the help of the CLI and the descriptions of the MCP tools no longer cite decision records the repository does not have. The starter's `AGENTS.md` now says what each setting of its `wrangler.jsonc` is for.
- Updated dependencies [[`901959b`](https://github.com/hollware/hollware/commit/901959bff6b8de29b8db6206a47c5b2e03efef55), [`b29fe9d`](https://github.com/hollware/hollware/commit/b29fe9d074c7b83b77014c59c41a4037d044bed4), [`4fd2a54`](https://github.com/hollware/hollware/commit/4fd2a54a0426ee128403febc89d45e127c7fa5ac), [`77b98b8`](https://github.com/hollware/hollware/commit/77b98b8e91e34b6b11c70adb16ed5fe35efda837), [`fe98663`](https://github.com/hollware/hollware/commit/fe98663f342ff4f69ea6e579c9dc28670ded00d7), [`44149e0`](https://github.com/hollware/hollware/commit/44149e0d5a2921754521b7be0797306cf2d5cd55), [`18aac23`](https://github.com/hollware/hollware/commit/18aac23e3ef8309fb802437d5166094cb4a7eb03), [`4d9b15e`](https://github.com/hollware/hollware/commit/4d9b15ea2d854cbec6f4390d14317b705d56cc45), [`73110f5`](https://github.com/hollware/hollware/commit/73110f5317dd9da454ad45a84baccedd1403767a), [`73110f5`](https://github.com/hollware/hollware/commit/73110f5317dd9da454ad45a84baccedd1403767a), [`42df9fb`](https://github.com/hollware/hollware/commit/42df9fb82477bec5b80385bd1b853f68d89092db), [`3b98d87`](https://github.com/hollware/hollware/commit/3b98d8701f82646554a9355e7523addb2ed5b09c), [`7f6ca95`](https://github.com/hollware/hollware/commit/7f6ca9528c258518065dedb22b3703910ec5e985), [`e6c6fb7`](https://github.com/hollware/hollware/commit/e6c6fb74ce757f74d215564a5174133e2879b1d3), [`2a302dc`](https://github.com/hollware/hollware/commit/2a302dcbe1fb41c10757352312b21861aa60f6d5), [`2244160`](https://github.com/hollware/hollware/commit/2244160693dc307127bced011214b59080832dba)]:
  - @hollware/core@1.0.0-rc.9
  - @hollware/client@1.0.0-rc.9

## 1.0.0-rc.8

### Patch Changes

- Updated dependencies []:
  - @hollware/client@1.0.0-rc.8
  - @hollware/core@1.0.0-rc.8

## 1.0.0-rc.7

### Patch Changes

- Updated dependencies [[`0647944`](https://github.com/hollware/hollware/commit/06479447b92e584277b0be96162888039e198adb)]:
  - @hollware/core@1.0.0-rc.7
  - @hollware/client@1.0.0-rc.7

## 1.0.0-rc.6

### Patch Changes

- Updated dependencies []:
  - @hollware/client@1.0.0-rc.6
  - @hollware/core@1.0.0-rc.6

## 1.0.0-rc.5

### Minor Changes

- [`88965e8`](https://github.com/hollware/hollware/commit/88965e8b3431656e939056cc8cfb7ec0b4206072) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Components to render entries in every framework:

  - `<HollwareImage>` in React, Vue and Nuxt renders the image a frontmatter field holds (a cover) with its alt, its size and the `srcset` of its copies; `imageOf(entry, field)` of `@hollware/client` gives the same attributes for any other renderer. The `images` of a summary carry the alt of each image.
  - `@hollware/astro` exports `HollwareContent.astro`, which renders an entry from its document with the site's own Astro components (`components={{ callout: Callout }}`), through the same rules as the HTML Hollware makes, and `HollwareImage.astro`. Its loaders keep the document and the images of each entry for them.
  - `safeDocument` of `@hollware/core` copies a document through the rules of `renderHtml`, for a renderer of a site's own.

### Patch Changes

- Updated dependencies [[`88965e8`](https://github.com/hollware/hollware/commit/88965e8b3431656e939056cc8cfb7ec0b4206072)]:
  - @hollware/core@1.0.0-rc.5
  - @hollware/client@1.0.0-rc.5

## 1.0.0-rc.4

### Patch Changes

- Updated dependencies [[`9e93f74`](https://github.com/hollware/hollware/commit/9e93f740a5d3c5fd68d16ea43b2ec79853ab1ee6)]:
  - @hollware/core@1.0.0-rc.4
  - @hollware/client@1.0.0-rc.4

## 1.0.0-rc.3

### Minor Changes

- [`e4b8296`](https://github.com/hollware/hollware/commit/e4b8296ac4f525f5ee969f2bcd1cb466b06be3e4) Thanks [@sergioazoc](https://github.com/sergioazoc)! - `createHollware` (and so `@hollware/react` and `@hollware/vue`) reads `search` and `describeSite` too, as the binding and the read API already did: a site's search page needs no reader of its own.

- [`5e4bee1`](https://github.com/hollware/hollware/commit/5e4bee1adf9d2e119b90ca4ae3c5e07d8055c260) Thanks [@sergioazoc](https://github.com/sergioazoc)! - Responsive images: when an image is uploaded, Hollware also makes its narrower copies, the `media.widths` of the site (640 and 1280 pixels by default, `[]` for none), served at `<url>/<width>`. `upload_asset`, `get_asset` and `list_assets` answer `widths` and `srcset`; the HTML of `get_entry`, and the document a site reads, give each image its `srcset`, `sizes`, `width` and `height`; and a summary read by a site (`get_entry`, `list_entries`, `createHollware()`) carries `images`, the size and `srcset` of each image its frontmatter names, by URL, to lay out a cover. The admin sets the format, quality, widest width and copies in Site, and shows the copies of each image. Images uploaded before keep none.

### Patch Changes

- Updated dependencies [[`8d6edca`](https://github.com/hollware/hollware/commit/8d6edcadbf06f1c4b85c5fe9739fb09a2a1c1f85), [`f31b9fb`](https://github.com/hollware/hollware/commit/f31b9fbbd99f08ab8d094742813f62dc32834d44), [`83f582a`](https://github.com/hollware/hollware/commit/83f582ab6e2483fe94ba7d3953b3b968835443c7), [`e4b8296`](https://github.com/hollware/hollware/commit/e4b8296ac4f525f5ee969f2bcd1cb466b06be3e4), [`1530a5f`](https://github.com/hollware/hollware/commit/1530a5f2a49cc6e47682e123e35a8d45cef4553b), [`0235865`](https://github.com/hollware/hollware/commit/0235865719899057dc58f7888208c16f1e990eda), [`0075a00`](https://github.com/hollware/hollware/commit/0075a0089e21f378c2295b4f26f5626e866bad67), [`29e7ecc`](https://github.com/hollware/hollware/commit/29e7ecc893fcb5f145e53b99a7f158b518e423f3), [`0150c9f`](https://github.com/hollware/hollware/commit/0150c9f4d1be3be699d6987946acd3bc5041e619), [`ea570be`](https://github.com/hollware/hollware/commit/ea570be69416f9a9b87d6d3a449975a42a58ab48), [`1310c51`](https://github.com/hollware/hollware/commit/1310c515a6ee07656aac57f3d5cd0fa0e824dd83), [`cebe6bb`](https://github.com/hollware/hollware/commit/cebe6bb99e776214d595f6223744b3fa670dd8ea), [`d0f43a4`](https://github.com/hollware/hollware/commit/d0f43a433a29618c763a8fde6662f777b4bb00e2), [`5e4bee1`](https://github.com/hollware/hollware/commit/5e4bee1adf9d2e119b90ca4ae3c5e07d8055c260), [`1ab4a4c`](https://github.com/hollware/hollware/commit/1ab4a4c26b492dedc77b1e1289ab883b4a0124d3), [`4c03dd3`](https://github.com/hollware/hollware/commit/4c03dd3f8fb3a366f095b3f8b84c4704819b714f), [`102ea18`](https://github.com/hollware/hollware/commit/102ea18cbc076fbc47f1128b0f71e98e4dd071d8), [`ca4225d`](https://github.com/hollware/hollware/commit/ca4225d3d0a04eb59323c89156ed167ec1b4b905), [`bce8006`](https://github.com/hollware/hollware/commit/bce80069a466f41ee929f33bd11c302b92e9e3a2), [`865c6c7`](https://github.com/hollware/hollware/commit/865c6c75ebd68f3c30993a0f9f346c9188f7843f)]:
  - @hollware/core@1.0.0-rc.3
  - @hollware/client@1.0.0-rc.3

## 1.0.0-rc.2

### Patch Changes

- Updated dependencies [[`f16f745`](https://github.com/hollware/hollware/commit/f16f7452e24037ab564f4442839c26b463019d58), [`51fc47c`](https://github.com/hollware/hollware/commit/51fc47c170d39ce69350c800d287309ba3ebb92e)]:
  - @hollware/core@1.0.0-rc.2
  - @hollware/client@1.0.0-rc.2

## 1.0.0-rc.1

### Patch Changes

- Updated dependencies [[`84d96fd`](https://github.com/hollware/hollware/commit/84d96fdbfe0527c5aae28b52d2d5045c8ec69354)]:
  - @hollware/core@1.0.0-rc.1
  - @hollware/client@1.0.0-rc.1

## 1.0.0-rc.0

### Patch Changes

- Updated dependencies [[`b47f74a`](https://github.com/hollware/hollware/commit/b47f74aefaf518df6cc95b8cf9f33388b488cd22)]:
  - @hollware/core@1.0.0-rc.0
  - @hollware/client@1.0.0-rc.0

## 0.11.0

### Minor Changes

- [`7b846a1`](https://github.com/hollware/hollware/commit/7b846a1317aba18d78a5d72210e78defb4c8e356) Thanks [@sergioazoc](https://github.com/sergioazoc)! - A new package: Hollware for any React app. `createHollware` reads published entries, listings and translations from a loader, a Server Component or a server function, over a service binding or HTTP; `previewRedirect` and `previewHeaders` serve a preview link of a draft; and `<HollwareContent>` renders an entry's Comark document with your own React components, on the server and in the browser.

### Patch Changes

- Updated dependencies [[`069c95f`](https://github.com/hollware/hollware/commit/069c95f1e940ea4f9ac013cac3a69d5ad5d7732d), [`304e18d`](https://github.com/hollware/hollware/commit/304e18d68482c88db6987e2453bcfa0b75467595), [`ead05f6`](https://github.com/hollware/hollware/commit/ead05f60b7240ede34e78a9f2694a238ac8932a6), [`5e24d98`](https://github.com/hollware/hollware/commit/5e24d987c38466a315bcb3b94c3dfa23de90e71f), [`302cbf6`](https://github.com/hollware/hollware/commit/302cbf6e70012513b6debb63fc3b818f97136ee9)]:
  - @hollware/core@0.11.0
  - @hollware/client@0.11.0
