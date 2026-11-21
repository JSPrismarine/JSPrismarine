---
'@jsprismarine/engine-systems': patch
'@jsprismarine/prismarine': patch
---

Random ticks check the server's content build once per section instead of on every draw. `WorldAccess` gains an optional `sectionRandomTickIds`, a per-section reader that returns a block's runtime id only when it takes random ticks, and `runRandomTicks` prefers it over a per-draw tick check.
