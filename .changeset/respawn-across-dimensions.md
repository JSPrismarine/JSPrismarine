---
'@jsprismarine/prismarine': patch
---

Respawn a player in the world their spawn point was set in. A death in the Nether with an Overworld bed now resolves the bed through the level, building the Overworld if it is not loaded, and the respawn exchange opens with a `ChangeDimension` marked as a respawn. A bed whose block is gone, or no spawn point at all, falls back to the Overworld spawn of the default level. A bed only sets a spawn where the dimension type's bed rule allows it and a respawn anchor only where `respawn_anchor_works` is set; the explosion Java gives elsewhere is not modeled yet.
