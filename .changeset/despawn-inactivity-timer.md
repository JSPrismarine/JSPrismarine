---
'@jsprismarine/entities': patch
---

Make a mob between 32 and 128 blocks from the nearest player wait out `minecraft:despawn`'s `min_range_inactivity_timer` (30 seconds by default) before it rolls its random despawn. It rolled every tick from the moment it spawned, so a mob a player walked away from could vanish at once. Java's `Mob.checkDespawn` has the same rule as `noActionTime > 600`.
