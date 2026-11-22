---
'@jsprismarine/prismarine': patch
---

Placing a block plays its sound again, for the player who placed it and the players near it. Placement sent a named sound `place`, which no client has, so every placement was silent. It now sends the `place` level sound event with the block's runtime id, so the client plays the sound of the block's material. `World.playBlockSound` plays such a sound for any block.
