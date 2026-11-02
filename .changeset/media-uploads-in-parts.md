---
'@hollware/core': minor
'@hollware/server': minor
---

A file larger than one request carries goes up in parts of 50 MiB, each streamed to R2 as it arrives: `POST /v1/uploads` with its filename, alt and bytes, `PUT /v1/uploads/<id>/parts/<n>` for each part, then `POST /v1/uploads/<id>/complete` with the etags, which makes the asset as `PUT /v1/assets` does; `DELETE /v1/uploads/<id>` aborts it. Only the person who started an upload may continue it, and the cron trigger aborts an upload left unfinished for 24 hours.
