---
"@jsprismarine/protocol": patch
"@jsprismarine/prismarine": minor
---

Move `PlayerAuthInputPacket` and its wire structures into Protocol. Prismarine now resolves item descriptors and block positions at the handler boundary, and Protocol can read and write item stack requests carried by player input.
