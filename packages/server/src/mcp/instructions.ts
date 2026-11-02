export const INSTRUCTIONS = [
  'Hollware is the CMS of a site, and you write its content in Markdown.',
  'Call describe_site first: it gives the locales, the JSON Schema of the frontmatter of each collection, the components the body may use and the contracts every write is checked against.',
  'Write a whole Markdown file, its frontmatter between two --- lines and then its body, with create_draft, and change it with update_draft and the version you last read.',
  'A draft is saved even when its contracts report errors: fix what the verdict lists, by its path and line, and write again. An answer of conflict means someone wrote since: read the entry again with get_entry.',
  'publish needs the version you read. needs_acknowledgement lists warnings: publish again with them in acknowledgeWarnings. Without content:publish the answer is pending_review, and a person approves it in the admin.',
  'Name what upload_asset gave you as asset:ast_… in the frontmatter, or in Markdown: ![alt](asset:ast_…) for an image, [text](asset:ast_…) for a video or a PDF. search finds published entries; list_entries finds drafts too.',
].join('\n')
