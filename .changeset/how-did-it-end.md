---
'@jsprismarine/color-parser': patch
'@jsprismarine/prismarine': patch
'@jsprismarine/brigadier': patch
'@jsprismarine/minecraft': patch
'@jsprismarine/protocol': patch
'@jsprismarine/client': patch
'@jsprismarine/errors': patch
'@jsprismarine/logger': patch
'@jsprismarine/raknet': patch
'@jsprismarine/server': patch
'@jsprismarine/math': patch
'@jsprismarine/nbt': patch
---

Slightly revamp build system to allow for way better dev UX.

Fix error getting thrown on first run due to missing the `level.json`
file. We no longer try to read it if it doesn't exist.

Fix logic error in `BatchPacket`'s `decodeHeader` resulting in invalid
`pid` validation.
