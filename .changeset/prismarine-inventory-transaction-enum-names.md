---
'@jsprismarine/prismarine': minor
---

The enums exported from `network/packet/InventoryTransactionPacket` now carry the docs' names: `UseItemAction` is `ItemUseActionType` with members `PLACE`, `USE`, `DESTROY` and `USE_AS_ATTACK` (formerly `CLICK_BLOCK`, `CLICK_AIR`, `BREAK_BLOCK`), `UseItemOnEntityAction` is `ItemUseOnActorActionType`, `ReleaseItemAction` is `ItemReleaseActionType`, and `ActionSource` is `InventorySourceType`. Values are unchanged.
