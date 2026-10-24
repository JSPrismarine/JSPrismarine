---
'@jsprismarine/protocol': patch
---

Add `MovementEffectPacket` (id 318) with the `MovementEffectType` enum: `Target Runtime ID` and `Tick` as varuint64, `Effect ID` and `Effect Duration` as ZigZag varint32, in the order protocol 2193 defines.
