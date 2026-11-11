---
"@jsprismarine/prismarine": minor
---

Move more input-lane handlers to the narrow handler context. `ActorEventHandler`, `EmoteHandler` and `PlayerSkinHandler` now take an `InputContext` in place of the `Server` and the session, and hand their relays to `step.output` instead of awaiting them, so a plugin that calls their `handle` directly passes a context.
