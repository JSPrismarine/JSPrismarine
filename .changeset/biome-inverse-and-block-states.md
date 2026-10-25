---
'@jsprismarine/mapping': minor
'@jsprismarine/prismarine': minor
---

Read a Bedrock biome and a Bedrock block state back into Java's vocabulary.

The seam was one-way, and three things were stuck behind that. A chunk stores a numeric biome id,
so `blocks.biome` and `blocks.biomeTags` on the content world adapter both refused - block
behaviors and the spawn rules' `is_biome` and `has_biome_tag` had nothing to read. And
`@jsprismarine/engine-systems` carries Java's redstone, fluid and piston models, so it spells a
direction as a word where Bedrock spells it as a number, which meant a piston arm resolved to no
palette state at all and pistons never extended.

`bedrockBiomeToJava` takes the number a chunk holds, or the Bedrock identifier, and answers both
the Bedrock biome and the Java 26.3 biome behind it. It is total over the 89 biomes the pinned
Bedrock data lists: 62 carry a Java source, and the 27 legacy terrain biomes Java deleted in its
1.18 rewrite are `BEDROCK_BIOME_LOSSES`, each with a reason rather than a guessed stand-in.

`bedrockBlockStates` and `javaBlockStates` translate a whole state record each way. The
correspondence is per block and cannot be worked out from a state's name: a dropper's
`facing_direction` calls north 2 and a piston's calls it 3, a redstone torch spells north `south`,
and a door spells it `east`. The write direction also drops the states a Bedrock block does not
carry, which is how Java's piston `extended` disappears. 309 blocks share thirty vocabularies; the
27 `(block, state)` pairs with no vocabulary at all are `BLOCK_STATE_LOSSES`.

Both tables are generated from the pinned sources and committed, so a version bump regenerates them
and the diff is reviewable, and both join the property tests the other domains already have.

In `@jsprismarine/prismarine`, the world subsystem answers `blocks.biome` through the biome inverse
and `blocks.biomeTags` out of the `minecraft:tags` component of the pack stack's biome definitions,
which nothing parsed; `EngineWorld` translates every block it hands the engine and every block it
takes back.

Breaking: `worldContentGroups` takes a `content` option, the biome registry it reads the tags from.
`registriesTable.bedrock.biome` is gone, replaced by the richer `registriesTable.bedrockBiomes`.

Also fixes every piston letting light through: when the generated block property table collapses a
Java property Bedrock does not carry, it now keeps the value of the Java state nearest the block's
default rather than whichever came first. Java lists a boolean's `true` ahead of its `false`, so
all twelve piston states took the extended row's `lightDampening` of 0 where Java's retracted
piston, which is what a Bedrock piston almost always is, dampens the full 15.
