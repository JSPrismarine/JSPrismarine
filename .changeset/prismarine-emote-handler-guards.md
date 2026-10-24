---
'@jsprismarine/prismarine': patch
---

`EmoteHandler` now drops an emote that names another player's runtime id or whose emote id is not a uuid string, and `EmoteListHandler` drops a list for another runtime id. Both log the drop at debug level.
