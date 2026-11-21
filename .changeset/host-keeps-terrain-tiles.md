---
'@jsprismarine/chunkgen': patch
'@jsprismarine/prismarine': patch
---

A generation host keeps each terrain tile it builds, so the server no longer sends the tile back to the host for the feature and merge tasks that read it. A task asks for this with `keepResult`, and `HostedGenerationPool.reusableValuesSent` counts the reusable values that still went with their value.
