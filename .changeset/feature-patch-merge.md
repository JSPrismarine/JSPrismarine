---
'@jsprismarine/chunkgen': minor
'@jsprismarine/prismarine': minor
---

Keep a tree whole where it crosses a chunk border.

The generator decorated a three by three window and kept only the middle chunk, so whatever a
neighbor's feature pass wrote across the border was thrown away. A chunk generated on its own never
received it. Measured at seed 987654321, chunk -96,48: an oak whose trunk stands in the last column
of -97,48 had air where its crown should be, from y 126 to y 130.

The decoration pass is the `features` status of the ladder now, and the promotion to a Bedrock chunk
is `full`. A chunk's blocks are its terrain tile, then its own feature writes, then the eight
inbound patches in `FEATURE_PATCH_ORDER`, which is `(dx, dz)` ascending with `dx` fastest. The
terrain tile is written once and read by up to nine feature passes; nothing writes into it again,
and nothing is replayed into a chunk already handed out.

That is what makes a chunk a function of the seed and its position. The caches it replaces made it a
function of what else the generator had produced: cross-border output was replayed into terrain
built later and into chunks already returned, so the same chunk differed depending on what was asked
for around it and changed under a player who already had it.

The border moves once, for every world. Measured over the generation corpus, between 1.4% and 1.9%
of a decorated chunk's positions gain a block, concentrated at the chunk edge and thinning inward:
ore and stone blobs, gravel and dirt patches, amethyst geodes and tree crowns that start in the
chunk next door. Terrain, biomes, structure placement and the structure beards are untouched.

Two consequences for anyone running the server. Asking for one chunk on its own costs more, because
it cannot be finished until its eight neighbors have decorated: twenty-five terrain tiles and nine
feature passes where the old shape drove nine and one. Filling a region pays once per tile instead.
And `@jsprismarine/chunkgen`'s holder, holder map and scheduler now take the chunk type as a
parameter, defaulting to `ProtoChunk`, so a server can climb the ladder with a chunk buffer of its
own.
