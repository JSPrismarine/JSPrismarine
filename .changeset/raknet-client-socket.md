---
'@jsprismarine/raknet': minor
---

Add RakNet's outgoing half, so the library can make connections as well as accept them.

This is the foundation both `@jsprismarine/client` and the planned proxy stand on. The reliability layer is not duplicated for it: ACK/NACK, ordering, fragmentation and retransmission are the exact code paths the server already runs, which is the only way an outgoing connection is worth anything as a test of the incoming one.

- **`RakNetPeer`.** `Session` coupled to `ServerSocket` through four members - `getLogger`, `sendPacket`, `emit`, `removeSession` - and nothing else. Extracting them as an interface is what lets a session be driven from either side. `@jsprismarine/client` used to reach the same end by passing itself as `this as any` in place of a `ServerSocket`, because there was no smaller contract to implement.
- **`ClientSocket`.** `connect()`, which resolves on a completed handshake and rejects with the server's own reason when it refuses - full, banned, protocol mismatch, already connected - rather than letting all four look like a timeout. Plus `ping()` for a server's MOTD without connecting, several at a time, and a keepalive so a session idle in both directions is not timed out. The offline exchange has no session to retransmit for it, so the socket owns the retry timer and RakNet's three-rung MTU ladder.
- **`OfflineClientHandler`.** The mirror of `OfflineHandler`, applying the same magic-and-length guard to what a server sends back that we already applied to what a client sends us.
- **The client role in `Session`.** Sending `ConnectionRequest`, answering `ConnectionRequestAccepted` with `NewIncomingConnection`, and reaching `CONNECTED`. Keyed on an explicit `RakNetRole` rather than on the message id, which would have let a peer talk a listening server through the client half of the handshake and skip `NEW_INCOMING_CONNECTION` entirely.

Three fixes fell out of needing the codecs to work in both directions:

- `NewIncomingConnection.encodePayload` wrote the remote's address twenty one times instead of the address followed by twenty system addresses. The byte count matched, which is why it survived: JSPrismarine was the only thing decoding it and reads those twenty purely to advance past them. A real server does look.
- `Session` never handled `CONNECTED_PONG`, so the answer to a ping was emitted as `encapsulated` and reached the packet dispatcher as if it were a Minecraft packet.
- `ConnectedPing`, `ConnectedPong` and `IncompatibleProtocolVersion` each implemented only the direction the server needed. They are now symmetric, like the rest of the handshake packets already were.
