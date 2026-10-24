---
'@jsprismarine/prismarine': patch
---

The creative menu sends every block entry and group icon with the block runtime id vanilla records for it. Pistons, dispensers, droppers and glow lichen showed their default state instead of the one the menu draws, and the item form of doors, beds and hanging signs carried a block id where vanilla sends none. `Item` takes an optional `blockRuntimeId` and exposes `getBlockRuntimeId()`.
