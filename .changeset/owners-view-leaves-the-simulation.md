---
"@jsprismarine/prismarine": minor
---

Stop awaiting sends to a player's own client inside the simulation. `PlayerSession.setGamemode`, `setFlying`, `completeSpawn`, `sendInventory`, `setPlayerPosition`, `openMainInventory` and the sends they make now write and queue every packet before they return, and the promise they return only waits for the transport. `World.addPlayer` returns `void`, and `meleeAttack` and `loose` return their `boolean` directly instead of a promise. `SetPlayerGameType`, `SetLocalPlayerAsInitialized`, a melee hit and a bow release now run in their input's unit, so a failure undoes the whole input.

`WorldChangeSink` gains the tick phase `flushOwnerViews`, which runs after `flushOccurrences`. A custom sink has to implement it. The replicator sends a trader's offers from the trader's `merchant` entries to every player trading with it, instead of `ItemStackRequest` sending them after a trade, so a level up or a restock while the screen is open reaches it too. A slot whose write is undone is logged as a `slot-shown` occurrence and sent to its owner again with the stack's new network id, through the new `PlayerSession.sendOwnSlot`. `ChangeLog.revertSpan` returns the entries it removed.
