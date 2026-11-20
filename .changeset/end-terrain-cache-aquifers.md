---
'@jsprismarine/worldgen': patch
'@jsprismarine/prismarine': patch
---

Fix Nether and End chunks failing to load with the persistent terrain cache on. `parseNoiseGeneratorSettings` now leaves `aquifers` out of the settings when the document names none, instead of setting it to `undefined`, which the cache key's hash refused.
