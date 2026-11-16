---
'@jsprismarine/prismarine': patch
---

Take off the vanilla goals a mob's Java class never registers, such as `minecraft:behavior.float` on the bat, blaze, ghast and wither, `find_mount` on zombies, `flee_sun` on the drowned and the camel's goals its brain runs. A goal a mob's own Java goal stands in for stays, so a blaze still shoots. A tamed parrot now lands on its owner's shoulder as Java's `LandOnOwnersShoulderGoal` has it, instead of walking to any mount within 16 blocks.
