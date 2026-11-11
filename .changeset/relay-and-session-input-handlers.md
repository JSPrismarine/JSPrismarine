---
"@jsprismarine/prismarine": minor
---

Move more input-lane handlers to the narrow handler context. `ActorEventHandler`, `EmoteHandler`, `PlayerSkinHandler`, `ContainerCloseHandler`, `InteractHandler`, `RequestAbilityHandler` and `SetPlayerGameTypeHandler` now take an `InputContext` in place of the `Server` and the session, so a plugin that calls their `handle` directly passes a context. Their sends go to `step.output` instead of being awaited, and `SetPlayerGameTypeHandler` hands the game mode change to `step.defer`.
