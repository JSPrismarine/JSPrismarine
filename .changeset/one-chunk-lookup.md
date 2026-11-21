---
'@jsprismarine/prismarine': patch
---

Add an optional `blockChunkAt` to `ContentBlockAccess`, which answers the loaded chunk holding a block, so a cache that spans ticks gets its identity and block revision from one lookup. The entity navigation view prefers it, so every cached block read an entity makes resolves its world and its chunk once rather than twice. `blockChunkIdentityAt` and `blockChunkRevisionAt` still work for an adapter that has no `blockChunkAt`.
