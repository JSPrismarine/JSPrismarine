---
'@jsprismarine/block-behaviors': patch
'@jsprismarine/blocks': patch
---

Grow twisting vines up and weeping vines down on a random tick, as Java's `TwistingVinesBlock` and `WeepingVinesBlock` do: a head younger than 25 grows one block into air at 0.1 a tick, one year older. They used to stay the length they generated at. Both now belong to the `jsprismarine:crop` family with the cave vines, rather than `jsprismarine:climbing`, which keeps ladders, chains and scaffolding off the random ticks. A twisting vine pops without a block below it and a weeping vine without one above.
