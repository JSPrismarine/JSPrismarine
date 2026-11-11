---
'@jsprismarine/native-network': patch
'@jsprismarine/nethernet': patch
'@jsprismarine/prismarine': patch
---

A NetherNet connection that closes delivers everything sent before it. The native peer connection is deleted only once libdatachannel reports it closed, after its graceful SCTP shutdown, and a connection whose unreliable channel or peer connection goes down first waits for the reliable channel's own close, which comes after its last message. The server no longer waits before it closes a kicked player's connection.
