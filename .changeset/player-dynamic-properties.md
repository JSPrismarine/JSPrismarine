---
'@jsprismarine/prismarine': patch
---

A script's dynamic properties on a player now survive the player's logout, a dimension change and a server restart, as on Bedrock Dedicated Server. The player record carries the actor tags the server does not model, which the properties live in: at the root of the `player_server_` record in LevelDB, where the game keeps them, and as `persistentNbt`, network NBT in base64, in the fallback JSON file. A record the game wrote keeps its own tags the same way.
