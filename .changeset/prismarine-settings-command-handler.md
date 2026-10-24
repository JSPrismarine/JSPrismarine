---
'@jsprismarine/prismarine': patch
---

`SettingsCommandPacket` and `SettingsCommandHandler` are registered, so a world setting toggled
from the client's settings screen (for example `/gamerule showcoordinates true`) reaches the
command manager instead of being logged as an unimplemented packet and dropped.
`CommandOutputPacket` and `ServerSettingsResponsePacket` are exported from `Protocol.Packets`.
