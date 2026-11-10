---
'@jsprismarine/prismarine': patch
---

On a transport that encrypts the connection itself, as NetherNet's DTLS does, the login still sends `ServerToClientHandshake` but leaves batches unencrypted, as Bedrock Dedicated Server 1.26.51 does over NetherNet. `MinecraftSession.transportCapabilities` exposes what the transport under a session does on its own.
