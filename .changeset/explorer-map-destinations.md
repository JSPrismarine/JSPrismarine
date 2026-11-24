---
'@jsprismarine/predicates': patch
'@jsprismarine/loot': patch
'@jsprismarine/prismarine': patch
---

Explorer maps get a destination. `LevelView` gains `nearestStructure` and `newMapId`, and an `exploration_map` modifier with no `structures` locator or `mapIds` allocator of its own now uses them, searching from the roll's `origin`. The `mapIds` option receives the roll's context. The server answers both from the world the roll happens in: the search is the one `/locate structure` runs, and map ids come from a counter each level saves. Shipwreck and ocean ruin chests, abandoned camp chests and cartographer trades now give a map with a `minecraft:map_id` that points at the nearest structure, instead of dropping the map.
