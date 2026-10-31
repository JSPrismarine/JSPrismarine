---
'@jsprismarine/features': minor
'@jsprismarine/prismarine': patch
---

Derive the End's ten spike pillars from the world seed when the `end_spike` configuration lists none, as vanilla's `"spikes": []` asks. `FeatureWorld.spawnEntity` now takes an options object carrying the yaw and the crystal's beam target, base plate and invulnerability instead of a bare yaw, which is a breaking signature change for worlds that implement it; the generator's region adapter records the yaw as before.
