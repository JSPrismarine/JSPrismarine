---
'@jsprismarine/protocol': patch
---

`AvailableCommandsPacket` decodes enum constraints through a value-to-offset map built once per constrained enum, instead of searching the enum's values for every constraint. A packet with many enum values and many constraints used to cost their product to decode.
