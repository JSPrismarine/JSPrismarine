---
'@jsprismarine/prismarine': patch
'@jsprismarine/items': patch
---

Resolve a raised shield before the hurt grace period, as Java's `LivingEntity.hurtServer` does, so an axe blow inside the grace window still disables the shield. Let an arrow with Piercing past the shield, and send the shield's cooldown to the player's client when an axe disables it. `@jsprismarine/items` exports `cooldownCategoryOf`, the Bedrock cooldown category of an item.
