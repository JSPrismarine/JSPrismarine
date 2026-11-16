---
'@jsprismarine/entity-goals': patch
---

`minecraft:behavior.rise_to_liquid_level` holds no control flag, so a strider strolls across a lava pool while it floats on it. Java floats a strider from `Strider.tick` rather than from a goal, and the goal holding `move` kept a strider in lava standing still.
