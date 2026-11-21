---
'@jsprismarine/worldgen': patch
---

The aquifer, the surface pass's preliminary surface and ore veins, and the biome climate sampler read their density trees through the new `RandomState.densitySampler`, which runs a tree in the native library when it loads and no structure or blending hook is set, with the same bits as its closures. An overworld chunk's terrain fill now makes no noise call from TypeScript.
