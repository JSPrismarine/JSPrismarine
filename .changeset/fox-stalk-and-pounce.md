---
'@jsprismarine/entity-goals': patch
'@jsprismarine/prismarine': patch
---

A fox stalks and pounces as Java's `Fox$StalkPreyGoal` and `FoxPounceGoal` do: only on a chicken or a rabbit farther than 6 blocks, which it walks toward at 1.5 until it is within 6, crouches for 15 ticks and leaps, biting on landing. The stalk used to stall on each waypoint until the next re-path, so the fox overshot into a range its leap could not land from, and it stalked any target, players included. `minecraft:behavior.stalk_and_pounce_on_target` takes a `filters` key for the prey it stalks.
