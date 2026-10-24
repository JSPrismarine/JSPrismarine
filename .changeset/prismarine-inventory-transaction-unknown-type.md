---
'@jsprismarine/prismarine': patch
---

`InventoryTransactionPacket` keeps a transaction type it does not know instead of throwing from `decodePayload`, so the handler can drop the packet at debug level rather than the server logging an error for it. The packet refuses an Actions list longer than the 100 the docs allow before allocating it. `ActionSource.INVALID`, a `-1` that was never a wire value, is gone; `NON_IMPLEMENTED_TODO` stays `99999`, the value the client sends. `ReleaseItemAction` names the docs' `ItemReleaseActionType` (`RELEASE` 0, `USE` 1).
