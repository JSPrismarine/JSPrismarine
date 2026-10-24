---
'@jsprismarine/prismarine': patch
---

`NpcRequestPacket`, `PurchaseReceiptPacket` and `ShowCreditsPacket` and their handlers are registered, so a client sending one no longer logs an unimplemented packet warning. `ModalFormRequestPacket`, `SetTitlePacket` and `ShowStoreOfferPacket` are registered as well.
