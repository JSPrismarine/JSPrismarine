---
"@jsprismarine/prismarine": minor
---

Add the narrow context packet handlers take in place of the `Server`, and run handlers in the shape `@jsprismarine/protocol` now shares with the client. A handler that implements `ConnectionLaneHandler`, `ReadLaneHandler` or `InputLaneHandler` from `network/handler/SessionHandler` takes a `SessionContext` (the session, a logger and the settings it may read) or, in the input lane, an `InputContext`, which adds the server-wide services handlers use and the input step's hooks. An input-lane handler in this shape is synchronous: it runs as one unit of its world's change log and hands its sends to `step.output` instead of awaiting them.

Handlers that take the server keep working, and `appendHandler` merges either shape with the other. `network/handler/Lane` is gone: import `LANES`, `Lane` and `strictestLane` from `@jsprismarine/protocol/handler/Lane`.
