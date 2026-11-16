---
'@jsprismarine/prismarine': patch
---

Freeze mobs in powder snow. A living mob inside powder snow takes a tick of cold a tick, warms by two a tick outside it, and once frozen through after 140 ticks takes a freezing blow every 40 ticks: 1, or 5 for a type in Java's `freeze_hurts_extra_types` tag or one that declares `minecraft:freezing_vulnerable`. A type immune to freezing stays warm. `EntityRuntime.frozenTicksOf` and `setFrozenTicks` read and write the cold.
