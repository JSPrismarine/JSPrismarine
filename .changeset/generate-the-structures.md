---
'@jsprismarine/structures': minor
'@jsprismarine/prismarine': minor
'@jsprismarine/bedrock-data': patch
---

Generate Java Edition's structures. Nothing generated before: the world generator read none of
the three registries a structure is built from, and `@jsprismarine/structures` was imported
nowhere in the server. It now loads `worldgen/structure`, `worldgen/structure_set` and
`worldgen/template_pool` alongside the eleven registries it already read, decides which chunks a
structure starts in from the 21 structure sets, lays the structure out against the bare noise
terrain, and writes its pieces into every chunk it covers. 50 of Java's 52 structures generate;
the end city and the nether fortress are the two left, and neither has a dimension to generate
in. [docs/data-driven/structures.md](../docs/data-driven/structures.md) is the inventory.

29 structures ask for terrain adaptation through `terrain_adaptation`, and the field was not
read at all, so a village landed on whatever the noise happened to make. Java's beardifier
density function now runs from the structure starts before a chunk's terrain is sampled.

The decoration pass runs Java's own loop: each step's structures, then that step's features,
sharing one index counter. A step's features are therefore seeded from the structure count
onward, which is what Java does and what this did not.

`@jsprismarine/structures`' jigsaw assembler changed to match Java's placer. It draws the
rotation before the start element rather than after, sits a `terrain_matching` element on the
terrain through the new `JigsawSources.terrainHeight`, settles a projected start onto the
surface through `JigsawConfig.projectStartToHeightmap`, reserves vertical room under
`JigsawConfig.useExpansionHack`, and reports the generation point as `JigsawAssembly.origin`. A
pool element's `processors` may now be an inline list as well as an identifier, which is how
1439 of the 2287 vanilla pool elements write it. The same seed and pools no longer produce the
same layout as before, because the draw order and the ground level delta both changed.

`@jsprismarine/bedrock-data` gained `extract:structures`, which lifts the 1511 `.nbt` templates
out of the pinned server jar into `node_modules/.cache/jsprismarine/java-structures/<version>/`;
`datagen:java` now runs it too. Reading them from the jar instead meant inflating all 17655 of
its entries inside the first chunk that placed one.

The generator's hand-written Bedrock biome id table is gone. The ids come from
`@jsprismarine/mapping`'s generated registry table instead, so they regenerate with the pinned
version rather than drifting. `BEDROCK_BIOME_IDS` is no longer exported.
