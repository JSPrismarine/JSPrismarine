---
'@jsprismarine/bedrock-data': patch
---

Wait for every chunk of each reference-region tile to load before releasing its ticking area. `createTickingArea` resolves on registration, not on chunk load, so the refworld pass saved a partial region; the pass now polls `dimension.getBlock` per chunk, and both the pack and the save reader fail with expected-versus-saved counts and missing chunk coordinates instead of writing a partial `reference_world.json`.
