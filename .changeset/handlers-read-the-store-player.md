---
"@jsprismarine/prismarine": minor
---

The packet handlers read a player's state from its `StorePlayer` and change it through the session or the entity runtime of the session's world. They call a `Player` method only where it posts a player event, where the callee takes a `Player`, or for the respawn, a move's pose writes and the item-use clock. Packet handling is unchanged.

- `network/handler/playerPorts.ts` exports `storePlayerOf(session)`, the session's store player, and `playerInputsOf(session)`, the runtime that takes its inputs.
- `network/handler/workstation.ts` exports `WorkstationPlayer`, the port its functions take in place of `Player`.
- Breaking: `playerPorts.ts` no longer exports `KickedPlayer`, `PlacedPlayer`, `InventoryHolder`, `CraftingHolder` or `FlyingPlayer`.
- Breaking: `blockTargetRejection` in `network/handler/BlockTarget.ts` takes the sending session, whose `getViewPosition` and `getWorld` it reads, in place of the player.
- Breaking: the `Trader` that `selectTrade` in `network/handler/tradeScreen.ts` takes is the store player's `getComponents`, which holds the experience an offer pays, in place of `getExperience`.
