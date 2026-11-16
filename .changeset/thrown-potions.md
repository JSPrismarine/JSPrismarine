---
'@jsprismarine/prismarine': patch
---

Thrown potions now do what Java's do where they break. A water bottle hurts a blaze, an enderman, a snow golem or a strider within 4 blocks by 1 and puts out burning mobs. A splash potion gives each living thing within 4 blocks of it its effects, scaled by `1 - distance / 4`, and a lingering one leaves an area effect cloud of radius 3 for 600 ticks that waits 10 ticks, shrinks to nothing over its life and by half a block for each entity it reaches, at the potion's duration scale. Area effect clouds honor `radius_on_use`. The server now carries Java's potion table, so drinking a potion applies its effects too.
