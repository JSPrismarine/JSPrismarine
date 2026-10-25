---
'@jsprismarine/features': minor
'@jsprismarine/prismarine': patch
---

Give a template a feature placed its block entities, and keep the processors a feature writes
inline, so a desert well's suspicious sand holds the loot a brush turns up. Two misses on the
same path. `placeJavaTemplate` wrote the template's blocks and never asked for the block entities
saved on them, so every compound a feature-placed template carried was dropped. The feature
parser kept a `processors` field only when it was a string, so a feature writing its rules where
it stands had them thrown away. Java's processor list codec takes an identifier, a bare list or
an object holding one, and `TemplateRequest.processors` now carries whichever arrived.

The desert well is where both land. In a generated world at seed 1234, its four nearest wells, in
chunks -691,-239, -687,-18, -649,-130 and -647,-38, each placed two suspicious sand and no block
entity at all. Each now places the same two sand, carrying
`loot_tables/archaeology/desert_well.json`.

Java 26.3 places a template nine times across its 240 feature documents: two `minecraft:fossil`
features that name their processor lists by identifier, and seven `minecraft:template` features
nested inside the desert well and the sulfur spring, which is why neither shows up as a feature
document of that type. Two of the seven carry processors, both written inline, and both are the
desert well's archaeology rule. That rule and the three trail ruins processor lists are the only
four `append_loot` in the game data.

`append_loot` adds the loot table to the compound it is handed, and the template source keeps
each decoded template for the life of the world, so a chain run over a template's own compounds
would bake one placement's table into every later placement of it. The placement copies the
compounds it hands to the chain, and indexes each copy under the Java block the original sat in,
which is where a banner keeps its color.

The desert pyramid still leaves its corridor suspicious sand out, for a different reason than the
one recorded beside it. The seam carries a brushable block entity and `archaeology/desert_pyramid`
is in the loot data. The positions are what is missing: they live in Java's `DesertPyramidPiece`
rather than in data, and the pyramid's interior here is a reconstruction.
