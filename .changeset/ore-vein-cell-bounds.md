---
'@jsprismarine/worldgen': patch
---

Rule out ore veins a whole interpolation cell at a time. `RandomState.boundSampler` bounds a density function's samples over a box of blocks, and `compileOreVeinRule` takes that bound to skip the cells where the vein density cannot be positive, instead of sampling it at every stone block. The surface pass passes it, so a chunk samples the vein density at about a tenth of its blocks and places the same ore.
