---
'@jsprismarine/prismarine': patch
---

Send `DeathInfoPacket` (id 189) to a player who dies, after the `Respawn` packet, so the client's death screen shows the cause. It carries the same translation key and parameters as the chat announcement from `DeathMessages`, with the key's leading `%` removed, since the death screen takes the bare key. The packet class is new and registered.
