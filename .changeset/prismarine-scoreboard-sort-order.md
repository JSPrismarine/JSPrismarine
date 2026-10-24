---
'@jsprismarine/prismarine': patch
---

`SetDisplayObjectivePacket` exports an `ObjectiveSortOrder` enum (`Ascending` = 0, `Descending` = 1) and types its `sortOrder` field with it. The JSDoc of `SetScorePacket` and `SetScoreboardIdentityPacket` now records why the pre-2193 type-byte layouts no longer apply, and the scoreboard packets link to the 1.26.51 docs.
