---
'@jsprismarine/prismarine': patch
---

`AnimatePacket` exports an `AnimateAction` enum with the numbers a protocol 2193 client sends (Swing 1, WakeUp 3, CriticalHit 4, MagicCriticalHit 5). `AnimateHandler` relays only those actions and only when the packet names the sender's own runtime id; anything else is logged at debug level and dropped.
