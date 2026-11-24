---
'@jsprismarine/prismarine': patch
---

A chunk that grew a sub chunk while it waited to be sent no longer fails its batch for a 1.26.51 (2193) client. The `LevelChunk` packet declared the column's current sub chunk count over the payload serialized when the chunk was queued, so translating the payload's block ids read past its end and threw "No bytes left in buffer". The client never got those chunks and could wait on a dimension change's loading screen until the server gave up on it. The packet now declares the count the payload was serialized with.
