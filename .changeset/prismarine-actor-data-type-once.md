---
'@jsprismarine/prismarine': patch
---

Write each entity data item's type once.

`SetActorDataPacket`, `AddPlayerPacket`, `AddActorPacket` and `AddItemActorPacket` wrote every `DataItemEntry` as the id, a varuint type selector, the same type again as a byte, and the value. The 1.26.51 docs draw the payload as a one-of whose every alternative opens with `Type`, and that single byte is the discriminator; nothing precedes it. A retail client took the repeated byte as the start of the value and read the rest of the list from the wrong place, which stalled the join before the client reported itself initialized. The entry is now id, one type byte, value, and a `CompoundTag` entry is written as network NBT instead of throwing.
