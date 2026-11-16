---
'@jsprismarine/entity-goals': patch
'@jsprismarine/prismarine': patch
---

Turn a squid's body a tenth of the way toward where it swims each tick, as Java's `Squid.aiStep` eases it, and leave a slime's turn to its move control's 90 degrees a tick: `slime_random_direction` no longer sets the slime's heading at once.
