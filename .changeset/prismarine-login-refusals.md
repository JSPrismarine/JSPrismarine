---
'@jsprismarine/prismarine': patch
---

Refuse a login the way the client expects.

`LoginPacket` now reads only `Client Network Version` and the connection request framing when the version is not the server's. It used to parse the certificate chain and client data regardless, and a client of another version whose blobs did not have the 2193 shape failed to decode, which dropped the packet before `LoginHandler` could answer with `PlayStatus(LoginFailed_ClientOld)` or `PlayStatus(LoginFailed_ServerOld)`. The player saw a timeout instead of "outdated client".

Each refusal `LoginHandler` sends as a `Disconnect` now carries the `DisconnectReason` the client shows on its disconnect screen: `INVALID_PLAYER` for a login with no username or no identity, `NOT_AUTHENTICATED` for an unauthenticated login on a server in online mode, `NOT_ALLOWED` for a banned player, and `LOGGED_IN_OTHER_LOCATION` for the player a new login replaces. All of them used to go out as `DISCONNECTED`.
