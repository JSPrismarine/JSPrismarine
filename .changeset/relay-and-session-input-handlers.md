---
"@jsprismarine/prismarine": minor
---

Move more handlers to the narrow handler context. `ActorEventHandler`, `EmoteHandler`, `PlayerSkinHandler`, `ContainerCloseHandler`, `InteractHandler`, `RequestAbilityHandler`, `SetPlayerGameTypeHandler`, `ShowCreditsHandler`, `ServerboundLoadingScreenHandler` and `ResourcePackChunkRequestHandler` now take an `InputContext` in place of the `Server` and the session, and `DisconnectHandler` takes a `SessionContext`, so a plugin that calls their `handle` directly passes a context. Their sends go to `step.output` instead of being awaited. The game mode change, the world change that ends the credits or a dimension change's loading screen, and the resource pack kick go to `step.defer`.

`DisconnectHandler` moves from the input lane to the connection lane. It only hangs up, and the removal of the player that follows is already an input of its own, so a client's goodbye no longer waits for the next tick before the transport closes.
