---
'@jsprismarine/prismarine': patch
---

Place a player who has no saved position the way a Bedrock Dedicated Server does. The feet go one block above the stored spawn height, centered on the block. A spot inside solid blocks moves up to the first free space, and a spot above leaves moves to a random column up to 15 blocks away. The join now sends BDS's `StartGame` position for that player and the three `Respawn` packets BDS sends after the inventory. New worlds store the surface block itself as the spawn height, which is how Bedrock worlds store it.
