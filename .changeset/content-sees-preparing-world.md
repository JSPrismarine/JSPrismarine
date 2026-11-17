---
'@jsprismarine/prismarine': patch
---

A mob that a world's start region generates, such as a village's villager, can read its biome while the region is still being prepared. Before, the content adapter answered only for ready worlds, so the server stopped at startup with "no minecraft:overworld world is loaded".
