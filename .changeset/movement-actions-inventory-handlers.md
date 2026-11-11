---
"@jsprismarine/prismarine": minor
---

Move the movement, action and inventory handlers to the narrow handler context. `InventoryTransactionHandler`, `ItemStackRequestHandler`, `MovePlayerHandler`, `PlayerActionHandler`, `PlayerAuthInputHandler`, `RequestChunkRadiusHandler` and `RespawnHandler` now take an `InputContext` in place of the `Server` and the session, and return without waiting, so a plugin that calls their `handle` directly passes a context. `PlayerActionHandler.handleAction` and `applyClientMovement` take the context too. Their sends go to `step.output`. A melee hit, a block break, a block hit and the cracks, the respawn action, and a dead player's respawn search go to `step.defer`.

`workstation.ts` no longer reaches the server: `refreshEnchantOptions` and the enchanting and anvil helpers take the enchantment registry, and the enchanting table counts bookshelves from loaded chunks only.

A block action or a block break transaction aimed at a chunk the world has not loaded is dropped and logged at verbose level, where it used to load or generate that chunk.
