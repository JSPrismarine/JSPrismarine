---
"@jsprismarine/prismarine": minor
---

Show players in the entity store to other clients as players. A store player's `StorePlayerActor` goes on the wire as an `AddPlayer` with its name, skin, held item, game mode and permissions, followed by its abilities and armor, and its moves, metadata and equipment changes reach the clients that track it. The actor reads the `StorePlayer` beside the store entity for what the store does not hold yet, and `EntityRuntimes.players` files the server's store players by entity id. `StorePlayer` gains the skin, the device and the platform chat id the login carries, and `HumanInventory.getEquipment` reads what a human holds and wears. No live player is a store entity yet, so clients see the same packets as before.

A legacy player and a store player are shown through the same code, which reads the structural `ShownPlayer` interface: `PlayerSession.sendAddPlayer`, `sendAbilities`, `sendArmorFor`, `sendGameTypeFor` and `playerListEntryOf`.

Breaking: `PlayerSession.sendSpawn` and `PlayerSession.sendDespawn` are gone. Call `sendAddPlayer` on the session of the client that should see the player, and `sendRemoveActor` to take it away. `sendArmorFor` reads the wearer's `getEquipment()` instead of its inventory.
