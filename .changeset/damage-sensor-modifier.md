---
'@jsprismarine/entities': patch
---

Read `damage_modifier` in `minecraft:damage_sensor` triggers and add it after the multiplier, so a goat takes ten less from a fall, and treat a trigger whose cause is `all` as answering every cause. Falls and freezing no longer hurt a type in Java's `fall_damage_immune` or `freeze_immune_entity_types` entity type tags.
