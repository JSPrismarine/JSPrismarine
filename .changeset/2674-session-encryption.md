---
'@jsprismarine/prismarine': patch
---

Encrypt RakNet sessions with the Bedrock handshake: the server sends `ServerToClientHandshake` to a login that names an identity key, and finishes the login once the client answers encrypted.
