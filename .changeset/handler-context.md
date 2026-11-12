---
"@jsprismarine/prismarine": minor
---

Add the narrow context packet handlers take in place of the `Server`, and run handlers in the shape `@jsprismarine/protocol` now shares with the client. A handler that implements `ConnectionLaneHandler`, `ReadLaneHandler` or `InputLaneHandler` from `network/handler/SessionHandler` takes a `SessionContext` (the session, a logger and the settings it may read) or, in the input lane, an `InputContext`, which adds the server-wide services handlers use and the input step's hooks. An input-lane handler in this shape is synchronous: it runs as one unit of its world's change log, hands its sends to `step.output` instead of awaiting them, and hands work that still has to wait, such as a world change, to `step.defer`, which runs it after the handler as a unit of its own.

`NetworkStackLatencyHandler`, `SubChunkRequestHandler`, `AnimateHandler` and `MobEquipmentHandler` take a context now, so a plugin that calls their `handle` directly passes one. `network/handler/Lane` is gone: import `LANES`, `Lane` and `strictestLane` from `@jsprismarine/protocol/handler/Lane`.
