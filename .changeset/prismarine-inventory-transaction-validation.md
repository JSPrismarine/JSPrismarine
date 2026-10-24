---
'@jsprismarine/prismarine': patch
---

`InventoryTransactionHandler` checks every field of an item use, a use on an entity and a release before acting on it. A transaction whose type, action source, action type, hand, hotbar slot, face or position is not one the docs allow is dropped at debug level. One whose hotbar slot is not the slot the server has selected, or whose block is further than a creative reach from where the server has the player, is dropped at verbose level. A clicked block is placed with the item the server holds in the player's hand, not the item the client named, and a swing at a runtime id the world does not track is dropped. The handler no longer throws on anything a client can send.
