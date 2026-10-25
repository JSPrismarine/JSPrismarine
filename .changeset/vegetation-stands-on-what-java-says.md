---
'@jsprismarine/prismarine': patch
---

Ask the block below a plant for Java's support tag, not for a sturdy top face.

The generated world grew grass on exposed stone, dark oaks and oaks on top of the huge mushrooms
in the dark forest, and trees on bare stone and gravel. All three came from one approximation in
the data-driven generator's block oracle: `canSurvive` answered yes for any block that was not a
full cube standing on a block with a sturdy top face. Stone, gravel, sandstone, deepslate, snow
blocks, packed ice, logs and the mushroom blocks all have one.

Java does not ask that. `VegetationBlock.mayPlaceOn` is `state.is(BlockTags.SUPPORTS_VEGETATION)`,
which resolves to `#minecraft:dirt`, `#minecraft:mud`, `#minecraft:moss_blocks`,
`#minecraft:grass_blocks` and farmland, and a subclass that wants a different base names its own
tag. The oracle now carries that association from the placed block to its support tag and reads
the membership out of the datapack's own `tags/block`, so the sapling and small flower lists stay
where Mojang writes them. Cactus, sugar cane, bamboo, the lily pad, the mangrove propagule, the
wither rose, the azaleas and the dry grasses each get the tag their block class tests.

The sturdy top face rule stays as the fallback, because that is what `LeafLitterBlock` and the
other `canSurvive` overrides that read `isFaceSturdy` genuinely do.

This moves generated worlds. Plants and trees no longer land on stone or gravel, and a rejected
position leaves the feature's random stream where it was, so later features in the same chunk
place differently, the way they do in Java.
