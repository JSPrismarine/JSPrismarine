---
title: Structures
group: Documents
category: Guides
---

# Structures in the data-driven overworld

Java Edition 26.3 ships 52 structures over 16 types, placed by 21 structure sets and grown out of
245 template pools. This page says which of them the server generates, how the generation is
split, and where it differs from Java.

The code is under `packages/prismarine/src/world/generators/datadriven/`, in the files whose names
start with `javaStructure`. The algorithms a structure is built from live in
[`@jsprismarine/structures`](../../packages/structures/README.md): the template readers, the
rotation and mirror transforms, the eleven structure processors, the jigsaw assembler and the
three placement types.

## The two halves

Generation is split the way Java splits it, and the split is what makes a structure that spans a
dozen chunks come out whole.

**Laying out** happens against the bare noise terrain. No chunk is loaded, no surface rule has
run and nothing has decorated, so the answer depends only on the world seed and the chunk the
structure starts in. A village laid out from one of its chunks is the same village laid out from
any other. `StructureStartSource` does this and caches the result.

**Placing** happens once per chunk, clipped to that chunk. Each piece writes its blocks freely
and the writer drops whatever falls outside, which is what Java's write region does at its edge.

Everything the layout reads about the world goes through `StructureLevel`: the noise terrain
height of a column, the block the noise puts at a position, and the biome the biome source names.
Everything a piece writes goes through `StructureWriter`.

## Placement

For each chunk, the generator asks every structure set whether a structure of that set may start
there. The scan covers the chunk and the eight chunks around it in each direction, which is how
far a structure may spill from where it started.

A set is only consulted when at least one of its structures can generate in a biome this
dimension has. That is what keeps the nether's and the end's sets out of the overworld without
anything naming a dimension.

A random spread placement chooses one chunk per region, so the scan asks each region once rather
than asking each of the 289 chunks in the window. Once a chunk is chosen, the set draws which of
its structures goes there, the structure lays itself out, and the biome at the layout's
generation point decides whether it is kept.

## What generates

51 of the 52 generate.

| Type | Structures | State |
| --- | --- | --- |
| `jigsaw` | 28 | Generates |
| `ruined_portal` | 7 | Generates |
| `mineshaft` | 2 | Generates; a chest minecart becomes a chest on the floor |
| `ocean_ruin` | 2 | Generates, without the satellite ruins around a large one |
| `shipwreck` | 2 | Generates |
| `buried_treasure` | 1 | Generates |
| `desert_pyramid` | 1 | Generates; the floor mosaic, sealed chamber and corridors are a reconstruction, and the corridor suspicious sand is left out |
| `igloo` | 1 | Generates |
| `jungle_temple` | 1 | Generates; the basement is a reconstruction |
| `nether_fossil` | 1 | Generates |
| `ocean_monument` | 1 | Generates, without Java's surrounding-biome check |
| `stronghold` | 1 | Generates, at the unsnapped ring position |
| `swamp_hut` | 1 | Generates |
| `woodland_mansion` | 1 | Generates, without the cobblestone pillars Java drops under it |
| `end_city` | 1 | Generates |
| `fortress` | 1 | Not implemented |

The jigsaw type is the five villages, the pillager outpost, the bastion, the ancient city, the
trail ruins, the trial chambers and the eighteen abandoned camps.

`fortress` is the one left unimplemented. It is the nether's, as `nether_fossil`,
`bastion_remnant` and `ruined_portal_nether` are, and `end_city` is the end's; the data-driven
generator serves those dimensions through their level stems.

The end city is Java's `EndCityPieces` read from the 26.3 jar: the house, the tower column, the
bridges that end in further houses, the fat tower, and the ship the bridge generator hangs once
per city. A dropped batch leaves its near `bridge_end` on the tower, as Java does. Bedrock has no
item frame entity, so the elytra hangs in a `frame` block whose block entity holds it.

## Terrain adaptation

29 structures carry a `terrain_adaptation` field, and Java reads it while the terrain is sampled
rather than after. Each piece near the chunk adds a density contribution, so a village flattens
the hillside under it and an ancient city hollows the rock around it. `javaStructureBeard.ts` is
that function, and the generator fills it from the structure starts before the chunk's noise is
sampled. The starts are laid out against the bare noise, which carries no contribution of its
own, so reading them first is not circular.

Java adds a contribution at each jigsaw junction, the connection between two pool pieces, at
0.4 times the piece kernel. The assembler records both endpoint junctions with their source
ground heights. The beardifier sums every piece contribution first, then these junction
contributions in piece and connection order.

## Where this differs from Java

Each of these is a decision rather than an omission, and each is written down beside the code it
affects.

**A structure settles its height once.** Java settles a legacy structure inside `postProcess`,
which runs once per chunk the structure covers and draws from that chunk's own random. A beached
shipwreck therefore draws its sink depth separately in each chunk and can end up sheared along a
chunk border. These settle while they are laid out, so the whole of a structure lands at one
height.

**The jigsaw free space is a list of boxes.** Java's is a voxel shape, which accepts a few
placements a box rejects. `placement_priority`, which only the trial chambers use, does not
reorder the placement queue.

**A stronghold is not snapped to its preferred biome.** Java's concentric ring placement moves
each of the 128 ring positions to the nearest chunk whose biome is in `stronghold_biased_to`.
This uses the unsnapped ring positions.

**Pool alias draws use a different stream.** Java forks a positional random off the world seed at
the structure's position for the trial chambers' pool aliases. This forks one keyed the same way
but from a different generator, so the aliases are stable for a world and a chunk without being
Java's.

**The exclusion zones are parsed and not applied.** A set whose `exclusion_zone` names another
set is placed as if the zone were absent.

**A few decoration draws moved from placement to layout.** Java's ocean monument draws its
simple room pillars and its sponge room patterns inside `postProcess`, so a room on a chunk
border gets two patterns. Those draws happen once here, after every draw Java makes while laying
the monument out, so the floor plan is unchanged and the room is whole.

## Comparing the output

`DataDrivenGenerator.structureStartsAt(chunkX, chunkZ, seed)` answers the starts that reach into
a chunk without generating it. A start carries the structure identifier, the set that offered the
chunk, the chunk it started in, the decoration step, its bounding box, its pieces and its
generation point. The generation point is the position Java makes the biome check at and the
position `/locate` reports, so it is the field to compare against Java directly.

`DataDrivenGenerator.unbuiltStructureTypes(seed)` names the structure types a world asked for and
got nothing from.

## Running the tests

The structure suites are gated, because they read the Java vanilla datapack, the data generator
reports and the structure templates:

```sh
pnpm --filter @jsprismarine/bedrock-data run fetch:sources
pnpm --filter @jsprismarine/bedrock-data run datagen:java
pnpm --filter @jsprismarine/prismarine exec vitest run src/world/generators
```

`datagen:java` also extracts the 1511 structure templates out of the pinned server jar;
`pnpm --filter @jsprismarine/bedrock-data run extract:structures` does that step alone, for a
checkout with no JDK. Without it the generator reads the templates from the jar, which means
inflating all 17655 of its entries inside the first chunk that places one.

The layout of each structure family also has unit tests that need none of that data, beside the
file they cover.
