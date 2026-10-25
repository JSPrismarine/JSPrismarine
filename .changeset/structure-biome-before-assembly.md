---
'@jsprismarine/structures': patch
'@jsprismarine/prismarine': patch
---

Check a structure's biome before assembling it, the way Java does.

Over a 102 by 102 chunk area at seed 1234, 319 of 356 candidate starts were fully assembled and
then discarded by the biome check at their generation point. That check ran after the builder, so
a village rejected for being in the wrong biome still cost a whole jigsaw expansion.

Java rejects first. `Structure.generate` calls `findValidGenerationPoint`, which filters
`findGenerationPoint`'s `GenerationStub` on the biome at the stub's position, and the stub carries
an unrun `Consumer<StructurePiecesBuilder>`; the pieces are built on the line after the filter.

A `StructureLayout` is now that stub: a generation point, and a call that assembles. The structures
package gains `startJigsaw`, which places a jigsaw structure's start piece and hands back the
generation point with the breadth-first expansion deferred; `assembleJigsaw` is it with the
expansion run straight away, so every existing caller is unchanged. `jigsawBlocksOf` is memoized
per template, because the expansion rescans the same few templates once per parent jigsaw, per
candidate element and per rotation.

No structure moves. Over that area the 37 kept starts are identical in structure, set, chunk, step,
terrain adaptation, generation point, bounding box and piece count, and the generation golden corpus
is unchanged. Candidate layout fell from 20.8 ms to 4.3 ms per chunk, with 47 assemblies where there
were 356.
