---
'@jsprismarine/protocol': patch
---

Add `PlayerUpdateEntityOverridesPacket` (id 325) with its `Update` tagged variant (`ClearOverrides`, `RemoveOverride`, `SetIntOverride`, `SetFloatOverride`) in the layout protocol 2193 defines: a varuint32 selector, the alternative's type string, then the int32 or float value.
