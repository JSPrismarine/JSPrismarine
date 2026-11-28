---
'@jsprismarine/structures': patch
'@jsprismarine/prismarine': patch
---

Structures start where Java 26.3 starts them. Abandoned mineshafts generate again: `legacy_type_1` and `legacy_type_3` were swapped, so mineshafts drew one 1 in 250 chance per 16 by 16 block of chunks and pillager outposts drew one per chunk. A structure set whose first draw cannot start in a chunk now tries the set's other structures, as Java does, so a chunk outside the badlands that draws the badlands mineshaft gets the normal one, and an ocean chunk that draws a beached shipwreck gets a sunken one. Exclusion zones apply, so pillager outposts keep ten chunks clear of villages.

Strongholds are moved to the biomes they prefer, and their ring positions draw from the world seed and fork a source for each position as Java does. A jigsaw start piece turns about the start position as Java turns it about its pivot, which moves a turned village, outpost, bastion or camp to Java's position and its generation point with it. An ancient city reads its biome at its anchor's height. `max_distance_from_center` is measured from the start piece's center, bounds y as well, defaults to 80 and honors `dimension_padding`. Desert pyramids and jungle temples need every corner of their footprint at or above sea level, an ocean monument needs every biome around it in `#minecraft:required_ocean_monument_surrounding`, and a structure on top of the chunk's middle reads its biome one block lower, on the topmost block. `/locate structure` walks the regions ring by ring and answers the first start in Java's scan order.

`@jsprismarine/structures` adds `structureAttemptOrder`, `concentricRingPositions` and `pivotedCorner`, and `concentricRingChunks` now returns Java's ring positions.
