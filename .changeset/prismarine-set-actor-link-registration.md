---
'@jsprismarine/prismarine': patch
---

`SetActorLinkPacket`, `AddPaintingPacket` and `SetActorLinkHandler` are registered, so a client mounting something no longer logs an unimplemented packet warning. The handler drops a link that does not have the sender at either end.
