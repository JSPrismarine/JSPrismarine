---
'@jsprismarine/prismarine': patch
---

Decode `ResourcePacksReadyForValidationPacket` (id 340), `PartyChangedPacket` (id 342) and `SetPlayerFurnaceOptionsPacket` (id 351) instead of warning `Packet 0x.. isn't implemented` when a 1.26.51 client sends them. Each gains a class, a handler and a registry entry. The resource pack report has no fields and needs no reply; the party change is logged with its id and leader flag, and an id over the schema's 49 characters is dropped; the furnace options are logged, and a furnace type, tab or layout outside its enum is dropped. `FurnaceType`, `FurnaceLeftTabIndex` and `FurnaceLayout` are exported from the furnace packet module. None of the three changes server state yet.
