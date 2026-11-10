---
"@jsprismarine/prismarine": patch
---

Data-driven mobs walk at Java's travel speed. A walk on land used to move `minecraft:movement` times the goal's `speed_multiplier` in blocks every tick, so a zombie covered 0.23 blocks a tick where Java's zombie settles at about 0.117, and a large slime glided at 0.6. A walk now follows `LivingEntity.travel` along the heading: the speed accelerates the mob against the friction of the block under it, and the momentum carries from tick to tick, also when a goal re-aims the walk. A mob with `minecraft:movement.jump` hops instead of gliding: it waits on the ground for a draw from `jump_delay`, refuses a goal's jump during the wait, and covers ground only in the hop. Flying, swimming and climbing keep their plain speed. A walker on land turns toward its waypoint without pitching its head at it, so a mob looking at a player beside it no longer looks at the ground.
