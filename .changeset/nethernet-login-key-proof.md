---
'@jsprismarine/nethernet': patch
'@jsprismarine/prismarine': patch
---

In online mode, a NetherNet login is accepted only on a connection whose offer was signed with the login's identity key. NetherNet leaves Minecraft's encryption off, and with it the handshake that proves a client holds the key its login names, so a login somebody recorded could be sent again by anybody. The server now keeps the signature the offer's `a=identity` makes over its DTLS fingerprint and checks it against the verified login's key, as gophertunnel does. A client that sends no identity, or one made with another key, is refused with `NOT_AUTHENTICATED`. Offline mode is unchanged.

`@jsprismarine/nethernet` adds `identityProofOf`, `provesKey`, `IdentityProof` and `Connection.provesKey`. `NetherNetServer.handleOffer` takes the proof as an optional third argument and reads it from the offer otherwise, and it now removes `a=identity` from the offer itself before WebRTC sees it.
