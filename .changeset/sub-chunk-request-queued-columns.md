---
'@jsprismarine/prismarine': patch
---

Answer a sub chunk request for a column that is queued for the client but not yet sent, instead of replying that it does not exist. A request for a column the server never queued is now logged at debug rather than as one warning per sub chunk.
