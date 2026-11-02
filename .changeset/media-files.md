---
'@hollware/core': minor
'@hollware/server': minor
'hollware': minor
---

A site takes videos (MP4, WebM) and PDFs besides images, kept as they arrive, up to the new `maxBytes` of its media setting (100 MB by default, up to 5 GB). `PUT /v1/assets?filename=…&alt=…` streams the body of the request to R2 as it arrives, so the size of a file is bounded by that setting and the plan of the zone, not by the memory of the Worker; `upload_asset` streams a URL that declares its `Content-Length` the same way. Assets are served with `Range`, so a video seeks, and a link in Markdown may name an asset: `[the policy](asset:ast_…)`. Images stay at 10 MB, what Cloudflare Images converts. The CLI exports and backs up videos and PDFs with the images.
