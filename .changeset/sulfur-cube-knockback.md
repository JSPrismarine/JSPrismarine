---
'@jsprismarine/prismarine': patch
---

A sulfur cube carrying a block is now pushed as Java's `SulfurCube.knockback` pushes it: by its archetype's knockback modifiers, which the carried block's `#minecraft:sulfur_cube_archetype` tag picks, aimed by where the attacker looks and stands, and added to the cube's motion rather than halving it.
