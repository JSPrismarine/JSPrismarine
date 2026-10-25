---
'@jsprismarine/block-behaviors': patch
---

Stop `setStates` from writing a block whose states did not move.

Every family rewrites its block through `setStates`, and the write is not free: it notifies the
six neighbors. Five families recompute a derived state when a neighbor changes without first
asking whether it moved, which is the wall, fence and pane connections, scaffolding's
`stability` and the campfire's `extinguished`. Each rewrote its unchanged value and notified
back, so two neighbors of the same family kept handing the notification to each other and a
settled run never reached a fixed point. Only the chained-update cap of one million stopped it.
The stairs corner, the fence gate's `in_wall_bit` and the redstone diodes already compared
before writing; this moves that check into the one place every family goes through.

Measured over the real content adapter and a real `World`. One notification on a settled
four-block scaffolding run spent 9.5 seconds inside a single tick; it now costs nothing. Putting
a support under a six-block run took 14.2 seconds and left the run wrong, because the cap fired
before the recompute had walked past the third block and the last three kept `stability=7`,
which is the value `climbingFamily.onTick` pops a scaffolding for. The same change now takes 1.2
seconds, walks the whole run to 0, 1, 2, 3, 4, 5, and sends 7 block-change packets.

The propagation the recompute depends on is unchanged, because a value that genuinely moves
still writes and still notifies. A boolean compares equal to the 0 or 1 the wire carries, so a
family computing `false` against a chunk holding `0` counts as settled.
