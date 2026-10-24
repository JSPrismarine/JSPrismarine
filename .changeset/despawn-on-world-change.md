---
'@jsprismarine/prismarine': patch
---

Despawn the old world's entities when a player changes world.

The server used to forget what the client was showing and send nothing, on the assumption that a dimension change made the client drop every entity. It does not, so mobs from the world a player left stayed on screen in the new one. `Player.setWorld` now sends a `RemoveActor` for every entity the client held before the dimension change goes out.
