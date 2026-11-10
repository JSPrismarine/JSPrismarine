---
"@jsprismarine/prismarine": patch
---

Answer a player's death at the next input step. `Player.onDeath` files the level's respawn search with the new `RespawnRequests` (`Server.getRespawnRequests()`) instead of awaiting it, and the input step that follows awaits every search filed before it, in order, then clears a spawn point that stopped holding and sends the `Respawn` and the `DeathInfo` the death screen shows. A client sees the same packets one tick later than before.
