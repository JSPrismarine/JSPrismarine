---
'@jsprismarine/prismarine': patch
---

Keep generated terrain tiles on disk, in a `cache/terrain` folder next to `worlds`, so a restart does not rebuild terrain it already generated. Generating the same area with a warm cache took a third less time and 43% less CPU in a 9 by 9 chunk run. The `terrain-cache-size-mb` option sets the budget, 1024 by default, and 0 turns the cache off. Records are keyed by the server version, so an upgrade never reads tiles an older build wrote.
