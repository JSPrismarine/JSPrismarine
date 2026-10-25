---
'@jsprismarine/prismarine': patch
---

Build a block schema's default state once instead of per call. A read of a position no sub chunk
covers answers with air's default state, and the random tick pass over an idle flat world makes
about 32000 of those a tick, so the server spent most of each tick in the `BlockState` constructor.
