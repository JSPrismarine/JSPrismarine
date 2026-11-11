---
"@jsprismarine/prismarine": minor
---

Remove the packet handler shape that takes the server. `network/handler/PacketHandler`, the `takes` field of a handler and `takesContext` are gone, and the dispatcher and `PacketHandlerRegistry.appendHandler` run only handlers in the shared shape: `handle(packet, context)` with a `SessionContext` or, in the input lane, an `InputContext`. A handler registered with `handle(packet, server, session)` moves to that shape, reading what it needs from its context. `appendHandler` now takes and returns `SessionHandler`s, and the merged handler runs in the stricter of the two lanes.
