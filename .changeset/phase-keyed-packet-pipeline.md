---
'@jsprismarine/prismarine': minor
---

Route each connection's packets through a per-connection pipeline with phase-keyed handlers.
Every `ClientConnection` carries a `SessionPhase` (`handshake`, `login`, `resourcePacks`, `play`)
advanced by the handlers that complete each step, and every packet handler declares the phases it
accepts; the dispatcher drops a packet that arrives outside them. Inbound frames run through a
typed stage chain (batch split, decode, log filter, phase gate, dispatch). New connections start
on a layout-stable `HandshakeCodec` that speaks only the pre-negotiation packets until
`RequestNetworkSettings` assigns the negotiated codec.

Breaking for handler authors: `PreLoginPacketHandler` and its `preLogin` marker are gone -
implement `ConnectionPacketHandler` for handshake- or login-phase packets - and both handler
interfaces now require a `phases` declaration.
