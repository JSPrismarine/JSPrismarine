---
'@jsprismarine/worldgen': patch
'@jsprismarine/prismarine': patch
---

Run the material rule again under a cave mouth that took a grass block, so a carved opening is
left with grass rather than bare dirt.

Two reports, one cause. Dirt sat exposed to the sky where a cave had broken the surface, and
short grass grew on that dirt. The grass is legal: Java's `#minecraft:dirt` is inside
`#minecraft:substrate_overworld`, which is inside `#minecraft:supports_vegetation`, and
`patch_grass_plain` adds no ground predicate. The dirt is what should not have been there.

Java remembers, per carved column, whether the carve has taken a grass block or mycelium out of
it. Once it has, every plain `minecraft:dirt` the carve then uncovers goes back through the
material rule, through `MaterialSystem.topMaterial`. This server had no such entry point, so the
carve wrote its opening and stopped.

`SurfaceSystem.buildSurface` now returns the context and the compiled rule it built as a
`SurfacePass`, whose `topMaterial` evaluates that rule at one position with both stone depth
counters pinned to one and the water line one block up. One context serves the whole chunk where
Java builds a fresh one per call, which computes the same answers: every cached value in the
context is keyed by the update counters that `updateXZ` and `updateY` bump.

Two neighboring carver deviations go with it. The mask the generator allocated spanned the whole
dimension, so a carver could open the bottom block and the top seven that Java's `CarvingMask`
protects; `CarvingMask.forChunk` already had those bounds and nothing called it. The apply loop
also skipped a cell that already held a fluid, where Java skips only `#minecraft:uncarvable` and
lets the aquifer decide what replaces the water it removed.

This moves generated worlds. One chunk of the parity corpus changed, `987654321/333,-17`: three
dirt blocks under a cave mouth became grass blocks, and twenty-eight blocks at y -63 that the old
mask let a carver flood with lava stayed deepslate.
