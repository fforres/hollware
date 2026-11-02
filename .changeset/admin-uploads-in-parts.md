---
'@hollware/admin': minor
---

The library of the admin sends a file past 50 MiB in parts through `/v1/uploads`, so a video larger than one request of the zone's plan carries goes up whole; a part that fails aborts the upload.
