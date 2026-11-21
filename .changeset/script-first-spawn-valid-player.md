---
'@jsprismarine/prismarine': patch
---

Raise a player's first `playerSpawn` for behavior pack scripts once the player's entity is in the level, so the player the event carries is valid there, as on Bedrock Dedicated Server: `player.name` and `player.sendMessage` work in the handler instead of throwing.
