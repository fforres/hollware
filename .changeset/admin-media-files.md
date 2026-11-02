---
'@hollware/admin': minor
---

The library of the admin takes videos (MP4, WebM) and PDFs besides images, and streams each file to `PUT /v1/assets` instead of sending it in base64: a video plays in its card, a PDF opens in a new tab, and "Copy for Markdown" gives a link, `[alt](asset:ast_…)`, for either. The image picker of the editor lists only images. Settings › Images sets the largest video or PDF the site takes, in megabytes.
