---
'@jsprismarine/engine-systems': patch
'@jsprismarine/prismarine': patch
---

Look a random tick's section up once for all the positions drawn in it. `WorldAccess` gains an optional `sectionRuntimeIds`, which the server answers with a reader over the section's own storage, so each of the three draws per section no longer finds the chunk and the sub chunk again.
