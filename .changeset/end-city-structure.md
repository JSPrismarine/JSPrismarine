---
'@jsprismarine/prismarine': patch
---

Generate the end city. `minecraft:end_city` was one of the two structure types with no builder,
so a world's End had its placement computed and nothing placed. The builder is Java's
`EndCityPieces` read from the 26.3 jar: the house tower, the tower generator with its bridges,
the fat tower, the depth limit of 8, the batch collision rule, and the one ship a city may hang
under a bridge. Chests under a `Chest` marker roll `minecraft:chests/end_city_treasure`, a
`Sentry` marker stands a shulker, and an `Elytra` marker hangs the elytra in a `minecraft:frame`
block, since Bedrock keeps an item frame as a block. A generated item frame's held stack,
rotation and drop chance now reach the chunk's `ItemFrame` block entity. `fortress` is the one
structure type left without a builder.
