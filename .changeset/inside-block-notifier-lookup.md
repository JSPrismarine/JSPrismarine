---
"@jsprismarine/entities": patch
---

`minecraft:inside_block_notifier` looks up the block list entries an entity was inside on its last tick in a set, so each tick costs one lookup per entry instead of a scan of the last matches for every entry.
