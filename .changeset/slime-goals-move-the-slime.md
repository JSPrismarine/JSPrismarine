---
'@jsprismarine/entity-goals': patch
---

Make the slime line move. `minecraft:behavior.slime_keep_on_jumping` called
`EntityActuator.jump` and nothing else, and `minecraft:behavior.slime_random_direction` picked a
heading that nothing read, so the two goals ran every tick and displaced the slime by zero blocks.
On a host whose actuator has no vertical impulse the slime did not even leave the ground.

A slime has no walk in either edition. It moves by hopping, and vanilla's four slime goals all talk
to one `SlimeMoveControl` on the mob rather than to each other. `SlimeHeading` is that shared piece
here, kept per entity because each goal component builds its own `GoalSupport`.
`slime_random_direction` and `slime_attack` set the heading, and `slime_keep_on_jumping` spends it:
on each landing it jumps and sends the slime four blocks along the heading through the navigator, so
a wandering slime travels and a slime with a target closes in on it.

`slime_attack` also aims the heading at its target now. It holds `look` at a better priority than
`slime_random_direction`, which is what stops a slime wandering once it has something to land on.
