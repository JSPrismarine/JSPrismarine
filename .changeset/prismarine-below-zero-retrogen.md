---
'@jsprismarine/prismarine': patch
---

Upgrade pre-1.18 Bedrock overworld chunks the way Java does: the first time one loads, the generator fills y -64 to -1 under it, blended toward the old terrain, the old bedrock floor at y 0 to 4 turns to deepslate, and columns dug through the floor stay open. The LevelDB provider also reads pre-1.18 `Data2D` biomes, which it ignored before.
