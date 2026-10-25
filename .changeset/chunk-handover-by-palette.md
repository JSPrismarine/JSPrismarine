---
'@jsprismarine/prismarine': patch
---

Hand a generated chunk to the Bedrock storage by its palette rather than block by block.

`DataDrivenGenerator.toChunk` translated each of the column's blocks on its own: a mapping lookup
for the Java state, a sub chunk lookup, and a palette insert, roughly 18000 times. It now
translates the generation region's palette once, a few hundred materials, and reindexes the block
buffer into one `BlockStorage` per sub chunk. A sub chunk whose palette never grows past air is
left out, which is what the per-block fill did by never writing into it.

`recordBiomes` resolved each sub chunk's sixty-four biome cells and then spelled them out over
4096 single-block writes, which expanded the section to 8 KiB on the first cell that disagreed
even when it would pack straight back down. It now hands the section over whole through the new
`ChunkBiomes.setSection`, so a section whose cells all agree stays one number.

Measured on one overworld column, best of five rounds of twenty-five: the block fill went from
3.17 ms to 0.10 ms and the biome fill from 1.57 ms to 0.35 ms, where the biome figure is the
mixed-section worst case. The output is unchanged; the generation corpus regenerates block for
block and biome for biome.

This is the main thread's share of a chunk, so it is what caps a generator that hands work to a
worker pool: at 100 chunks a second the old shape spent close to half a core doing nothing but
receiving.
