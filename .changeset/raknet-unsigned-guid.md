---
'@jsprismarine/raknet': patch
---

GUIDs and timestamps in the handshake packets are now read and written as unsigned 64 bit values, which is what RakNet's `RakNetGUID` and `RakNet::Time` are, and `ServerSocket`, `ClientSocket` and `LoopbackSocket` generate their guids unsigned. `ServerSocket` also passes its guid to `ServerName.setServerId`, so the seventh field of the MOTD line now carries the same guid as the pong header instead of `0`. A caller that hands a packet a negative bigint now gets a `RangeError` on encode.
