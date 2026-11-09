---
'@jsprismarine/mapping': patch
'@jsprismarine/prismarine': patch
---

A broken bed or banner now drops the item of its own color instead of the black one. Bedrock keeps their color in the block entity, so the loot lookup reads it from there: `blockEntityRecord` exposes a bed's `color` and a banner's `Base` as `dyeIndex`, `blockLootTableOf` and `rollBlockDrops` use it to pick the Java table, and `/loot mine` passes it too. `@jsprismarine/mapping` adds `bedrockBlockEntityDyeIndexOf` and `javaBlockOfBedrockDyeIndex` to convert between a Java colored block and that index.
