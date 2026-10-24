---
'@jsprismarine/protocol': patch
---

Add `UpdateClientInputLocksPacket` (id 196) with the `ClientInputLock` bit flags. The payload is one varuint32 bitmask, as the protocol 2193 schema and gophertunnel master define it.
