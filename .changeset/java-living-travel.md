---
'@jsprismarine/prismarine': patch
---

Move mobs the way Java's living travel does.

- A mob moves by its velocity before gravity applies, so a jump rises Java's 1.25 blocks rather than 0.85.
- A baby's body is its box times its scale, so a baby zombie fits through a one-block gap.
- A mob in a ladder slides down at 0.15 blocks a tick, and a cobweb slows every mob but a spider to a quarter.
- An enderman, horse or camel walks up a full block without jumping.
- Chickens, blazes and parrots fall slowly, and fish fall when they leave the water.
- Minecarts, experience orbs, end crystals, area effect clouds and fireworks keep Java's gravity.
- Boats and minecarts can be pushed, while end crystals, fireballs and tridents cannot.
- Ground friction follows Java's friction and air drag modifiers.
- A boat that drops onto water floats at its surface instead of sinking.
- A piston carries a mob in front of it one block along.
