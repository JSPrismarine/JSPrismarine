---
'@jsprismarine/mapping': patch
'@jsprismarine/prismarine': patch
---

Drop the right items from the blocks Bedrock spells as a name where Java spells a state.

`@jsprismarine/mapping` gains `bedrockBlockStateToJava` and `bedrockBlockToJava`, the inverse of
`javaBlockStateToBedrock`, derived from the same generated table. The round trip is exact for all
15953 Bedrock states the Java palette reaches.

The server resolved a block's loot table by mapping each Java table forward through the block's
default state, which never produced the 113 Bedrock identifiers that only a non-default state
reaches, so all 59 double slabs, the lit furnace, smoker, blast furnace and redstone ore, the
powered repeater and comparator, the inverted daylight detector, the unlit redstone torch and the
berried cave vines dropped nothing at all. Resolving the block's own state back to Java reaches
them, and carries the Java properties into the roll's `block_state`, so the tables that branch on
it are right: a double slab yields two slabs and a grown shelf mushroom yields two mushrooms.
