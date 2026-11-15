---
'@jsprismarine/prismarine': patch
---

Keep a ghast, a bat, a bee and the wither in the air. Their `minecraft:physics` turns gravity on, and the server let them fall until they reached the ground. A mob with `minecraft:can_fly` now ignores gravity, as Java's flying mobs do. A parrot still flutters down, because its `minecraft:movement.fly` does not hover in place.
