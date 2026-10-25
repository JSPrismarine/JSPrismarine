---
'@jsprismarine/wire': patch
---

Take the block runtime id hash and the packet payload types from
`@jsprismarine/protocol` rather than keeping a second copy. `fnv1a32`,
`blockStateCompound`, `writeBlockStateNbt`, `blockRuntimeId`, `UNKNOWN_BLOCK_NAME` and
`UNKNOWN_RUNTIME_ID` are re-exported from there, so a caller keeps one import and the two packages
cannot drift on what a block state hashes to. `serializeBlockState(name, states)` is gone; call
`writeBlockStateNbt(blockStateCompound(name, states))`. `BlockProperty` and `ItemRegistryEntry` now
come from the `@jsprismarine/protocol` index instead of a deep import into the packet modules.

The empty-list fix in `@jsprismarine/nbt` lands here as well: all 98 captured block definitions
read and rewrite byte for byte, and all 98 generated ones are byte identical to what the server
sent, up from 97. All 1065 captured block `network_id` values still reproduce.
