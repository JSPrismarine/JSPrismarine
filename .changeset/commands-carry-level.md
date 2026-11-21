---
'@jsprismarine/commands': patch
'@jsprismarine/prismarine': patch
---

Run a command at an entity in a level other than the default in that level, rather than in the default level at its coordinates. The server names such a level in the dimension a command carries, as `minecraft:overworld@<level>`, and `WorldCommandHost` gains an optional `dimensionIn` that `execute in` and `execute if dimension` ask, so they keep the source's level.
