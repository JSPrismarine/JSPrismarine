---
'@jsprismarine/prismarine': minor
'@jsprismarine/engine-systems': patch
---

A world's change log now holds everything the replay digest hashes, so a snapshot of a world plus the sealed ticks after it reaches the digest of any of them. The block update queue and the scheduled block and fluid ticks are logged as `block-update` and `scheduled-tick` entries, so undoing a unit also takes back the updates and ticks its writes queued, and each sealed tick carries a `header` with the level clock, the weather, the game rules, the random tick generator, the depth of the light queue and the chunk loads in flight. `World.replayStateDigest` takes a header to hash, `World.tickHeader` reads the world's own, and `World.replayChunkLeave` applies a logged chunk leave.

Status effect changes are sent from the log as `status-effect` occurrences, so one made in a unit that throws is not sent. `WorldChangeSink.statusEffectChanged` is gone, `World.sendStatusEffect`, `sendWorldEvent`, `sendActorSound` and `sendActorEvent` return nothing, and `EntityStore` no longer takes unit journals (`UnitJournal`, `addUnitJournal`): the block update queue reports to an observer and is undone through the log. The replay recorder counts a packet toward the tick that queued it rather than the tick the transport framed it in.

`TickScheduler.observe` hears each scheduled tick queued and taken off, and `TickList.restore` writes one back without reporting it.
