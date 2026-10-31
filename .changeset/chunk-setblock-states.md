---
"@jsprismarine/prismarine": patch
---

`Chunk.setBlock` now places the state the `Block` carries. It resolved the runtime id by name alone, so a block with a non-default state, such as a log lying along x, was stored as its default state.
