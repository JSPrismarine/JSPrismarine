---
"@jsprismarine/protocol": patch
---

Add the packet handler shape the server and the client share, under `@jsprismarine/protocol/handler/PacketHandler`: a `PacketHandler` takes the packet and a context its side supplies, lists the session phases it accepts, and a serverbound handler declares its `lane`. An `InputHandler` returns `undefined`, so an asynchronous input-lane handler does not type-check. The lanes, `LANES` and `strictestLane` move here from the server, under `@jsprismarine/protocol/handler/Lane`.
