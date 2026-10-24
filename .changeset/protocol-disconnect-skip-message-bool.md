---
'@jsprismarine/protocol': patch
---

`DisconnectPacket` now reads and writes `Skip Message` as the one bool byte the client uses. It was a varuint compared against 1, which agreed with the client for 0 and 1 but took any other byte as "strings follow" and read past the packet.
