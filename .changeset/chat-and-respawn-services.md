---
"@jsprismarine/prismarine": patch
---

Chat fan-out and the respawn search move out of `Player` into services. `ChatManager.join` and `ChatManager.leave` add a `ChatRecipient` to the chat fan-out and take it out again, keyed by `keyOfPlayer`, and the manager decides which players a message's channel reaches and hands each one its `ChatDelivery`. `Level.getRespawnSearch` returns the level's `RespawnSearch`, whose `find` takes a plain-data request (the player's key, saved spawn point and body) and answers with the dimension, the three respawn positions and whether the spawn point stopped holding. `Player.getRespawnPoint` keeps its signature and delegates to it. Who receives chat and where a player respawns are unchanged.
