---
'@jsprismarine/prismarine': minor
---

Carry the chunks still settling across a replay boundary. The replay initial-state manifest is now version 3 and records each loaded world's settling chunks, which a restore puts back before it checks the world digests; the tick header and the replay digest include them too. Version 2 manifests are refused.
