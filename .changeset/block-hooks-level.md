---
'@jsprismarine/blocks': patch
'@jsprismarine/block-behaviors': patch
'@jsprismarine/prismarine': patch
---

A block hook's `HookBlock` carries the name of the level the block is in, and `BlockWorld.at` takes it, so a block family that runs in a second level (a torch losing its support, a scheduled tick, a random tick, a redstone update) reads and writes that level instead of the default level's world of the same dimension.
