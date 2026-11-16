---
'@jsprismarine/entity-brains': patch
'@jsprismarine/entity-goals': patch
'@jsprismarine/prismarine': patch
---

Tick the happy ghast's brain only while it is a ghastling, as Java's `HappyGhast.customServerAiStep` does, so a grown ghast's brain no longer drags it away from a player tempting it with a snowball. `BrainMobDefinition` gains an optional `ticksBrain`. `minecraft:behavior.follow_mob` reads a `preferred_actor_type` written without a namespace, such as the ghastling's `player`, so a ghastling follows a nearby player.
