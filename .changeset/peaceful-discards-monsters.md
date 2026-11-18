---
'@jsprismarine/bedrock-data': patch
'@jsprismarine/entities': patch
'@jsprismarine/prismarine': patch
---

Peaceful follows Java's rules for the mobs already in a world. Each row of `java_entity_attributes` carries `allowedInPeaceful`, Java's `EntityType.isAllowedInPeaceful` from the pinned server, and the entity runtime discards a mob whose type is not allowed on its next tick while the world is on peaceful, named or not, as `Mob.checkDespawn` does. Hostile mobs are gone once the difficulty changes to peaceful, and a monster loaded from a save goes on its first tick. No mob takes a player as its target on peaceful, as Java's `LivingEntity.canAttack` refuses, so a neutral mob a player hits does not turn on them.
