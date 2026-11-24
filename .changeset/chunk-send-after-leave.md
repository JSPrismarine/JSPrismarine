---
'@jsprismarine/prismarine': patch
---

A player leaving while the server was still producing chunks for them no longer logs "Failed to send chunk" with a `PRISMARINE_PLAYER_HAS_LEFT` stack trace for each one. Leaving now drops the chunks still queued or in progress for that player, so none of them reaches the send.
