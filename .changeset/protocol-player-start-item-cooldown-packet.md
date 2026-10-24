---
'@jsprismarine/protocol': patch
---

Add `PlayerStartItemCooldownPacket` (id 176): `Item Category` as a string, then `Duration Ticks` as a ZigZag varint32. The server sends it when a player uses an item with a cooldown, and the client greys out that category's slots for the duration.
