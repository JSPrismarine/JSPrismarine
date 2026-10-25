---
'@jsprismarine/block-behaviors': patch
---

Stop leaves from flipping `update_bit`, which never settled.

`leavesFamily` set `update_bit` on a neighbor change and cleared it on the scheduled tick that
followed. Nothing read it back: `hasNearbyLog` walks the canopy from scratch on every random
tick, so the flag gated no decision. It was not free, and it was not a one-off either. The
clearing write notified the six neighbors, every un-flagged leaf among them flagged itself and
scheduled its own tick, and the canopy never reached a fixed point. Removing one log under a
17-leaf canopy churned 32 block writes per tick indefinitely, 16019 over 500 ticks; breaking one
corner off a 125-leaf slab churned 248 a tick, 124125 over the same span. Both now cost the one
write that caused them. Each avoided write also carried a block-change packet to every player in
range, a light update, seven scheduled physics positions and six more neighbor notifications, and
leaves now fall out of the neighbor walk entirely because the family declares no reaction to it.

Java has no equivalent state. It recomputes a leaf's `distance` when a neighbor changes, and all
seven of those values collapse onto the two Bedrock leaf states that differ only in
`persistent_bit`. `update_bit` is the Bedrock engine's own marker for the same check, and the
Java-to-Bedrock block table never emits it set, so no client has ever been shown a leaf with it
on. Decay is unchanged: 8519 leaves generated across 36 chunks at seed 1234 and none decays,
before or after, while the same leaves with their logs stripped all 8519 decay.

One side effect is a fix rather than a saving. `minecraft:oak_leaves` carries
`randomTick: false` with a `persistent_bit=0,update_bit=0` override that turns it on, so a leaf
holding the flag was skipped by the random-tick draw. Leaves that kept it, through a scheduled
tick lost to a chunk unload, would never have decayed at all.
