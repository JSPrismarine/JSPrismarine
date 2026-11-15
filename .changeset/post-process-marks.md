---
'@jsprismarine/features': patch
'@jsprismarine/prismarine': patch
---

Mark the positions Java 26.3 marks for post-processing when world generation places soul sand, a magma block or a small mushroom, and every face a multiface growth places. Soul sand and a magma block mark the block above them, so the water standing there gets its tick when the chunk loads. `FeatureWorld.setBlock` takes an optional `{ postProcess: false }`, which the ore feature passes because Java writes ore past the region, and `FeatureWorld.markForPostProcessing` is a new optional hook.
