---
'@jsprismarine/prismarine': patch
---

Move the world change onto the session as `PlayerSession.changeWorld(arrival)` and send the dimension change sequence a Bedrock client expects: the record saved to the world being left, one `ChangeDimension` with the target's Bedrock id, `StopSound`, `NetworkChunkPublisherUpdate`, the server-sent `PlayerAction ChangeDimensionAck`, the arrival chunks and `PlayStatus PlayerSpawn`. The old four-step Overworld and Nether detour is sent only between two worlds of the same Bedrock id. The change stays pending until the client closes the loading screen it was given; `PlayerAuthInput` is dropped until then, and the close triggers a `MovePlayer` teleport, the attributes, the inventory and the changed dimension advancement hook. `Player.setWorld(world)` forwards to `changeWorld` with the world's spawn as the arrival. A chunk batch on the wire during the change no longer marks the old world's coordinates as loaded.

Not verified against a real Bedrock client: whether the client keeps inventory and attributes across the change (the re-send after `EndLoadingScreen` is the safe default) and how many arrival chunks it needs before it closes the screen. Both need a manual run.
