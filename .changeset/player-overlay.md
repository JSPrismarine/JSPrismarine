---
"@jsprismarine/prismarine": patch
---

The entity store treats a player by the three rules ADR 0008 gives it. A player overlay adds `minecraft:health` 20 to the `minecraft:player` type when the winning pack's file declares none, as Bedrock's shipped file does. The client owns a player's movement: the tick applies no gravity, navigation or pushes to a store player's body, `EntityRuntime.applyClientMovement` writes what the client reported, and an impulse aimed at a player is logged as an `impulse` occurrence instead of a velocity. A player that dies stays in the store with its id until `EntityRuntime.revive` brings it back.

For the live player, `Player.setPosition` now always sends a teleport, so the client acknowledges every move the server makes, and a move event's reset waits for the same acknowledgment. Knockback on a player is logged as an `impulse` occurrence. `Entity.damage` and `Player.onDeath` commit the health, the death event, its advancement triggers and the respawn search before they first wait, so a mob's blow on a player lands inside the blow, and a respawn logs the health and component fields it restores.
