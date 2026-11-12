---
"@jsprismarine/prismarine": patch
---

Undoing a unit of work that took a player out of a world puts the player back whole. The entity came back without the player's inventory and component parts and the session was no longer among the world's viewers, so the undo of a slot write in the same unit stopped the world with `No writer knows entity`. `EntityRuntime.onPlayerReentered` and `reattachStorePlayer` (`entity/data/storePlayers`) are new.
