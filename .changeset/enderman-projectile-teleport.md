---
'@jsprismarine/entities': patch
'@jsprismarine/prismarine': patch
---

An enderman struck by a projectile teleports as Java's does. `minecraft:teleport` tries up to 64 teleports on a projectile hit and takes no damage from it even when none lands. A host can give the actuator `randomTeleport`, Java's `Enderman.teleport` landing rule: the destination is drawn anywhere in the teleport cube, drops to the ground under it, and is refused in water or where the entity does not fit. The server's runtime implements it and sends the `minecraft:teleport` game event when the enderman lands, for its random teleports too.
