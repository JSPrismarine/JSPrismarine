---
"@jsprismarine/prismarine": minor
---

Move more input-lane handlers to the narrow handler context. `ActorEventHandler`, `EmoteHandler`, `PlayerSkinHandler`, `ContainerCloseHandler`, `InteractHandler`, `RequestAbilityHandler`, `SetPlayerGameTypeHandler`, `ShowCreditsHandler`, `ServerboundLoadingScreenHandler` and `ResourcePackChunkRequestHandler` now take an `InputContext` in place of the `Server` and the session, so a plugin that calls their `handle` directly passes a context. Their sends go to `step.output` instead of being awaited. The game mode change, the world change that ends the credits or a dimension change's loading screen, and the resource pack kick go to `step.defer`.
