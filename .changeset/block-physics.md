---
'@jsprismarine/prismarine': minor
---

Give blocks physics, and players fall damage.

Four behaviours were asked for - plants breaking when their support goes, sand and gravel falling, water running into holes, and fall damage - and the first three are the same problem wearing different hats: something changed *there*, so something may now have to happen *here*. So the work is one mechanism and three rules rather than three features.

**`World.setBlockRuntimeId` is now the only way a block changes.** It writes the block, tells every client, and queues the block and its six neighbours to look at themselves. `breakBlock` and block placement both go through it, which is what makes breaking or placing anything have consequences; a caller that writes into a chunk directly changes the world without anything noticing, and the sand above stays in mid air.

**`BlockUpdateScheduler`** holds the queue. It deduplicates by position, because a cascade queues the same places repeatedly and would otherwise grow faster than it drains; it supports delays, because water spreads on a timer and a falling block descends a block at a time; and it has a per-tick budget, so a lake breached into a cavern is spread over several ticks rather than taking one down.

**The rules** live in `world/physics/`, keyed by block state name. Deliberately not by the registered `Block` classes: those cover eighty of the twelve hundred blocks the client knows and `getBlock` returns air for the rest, so a rule that consulted them would silently do nothing for most of what world generation actually places - which is the worst way for physics to fail, since it looks implemented.

- Plants, crops and torches break and drop when what holds them up is removed. A block at the edge of the loaded world is assumed supported rather than guessed at, so borders do not strip themselves.
- Sand and gravel are handed to a `FallingBlock` entity, which accelerates under vanilla's figures and turns back into a block where it lands - or drops as an item if the place it came to rest will not take one. It has to be an entity: a block is only ever in one place or another, so stepping it down through the world could only ever move it at a fixed rate, and sand would drift rather than drop. The client draws it from the block runtime id in its `VARIANT` metadata, which is also why `Metadata` gained a `setInt` - a short would truncate the hash to nonsense.
- Water spreads outward losing a level each block and falls at full strength, so it goes *down* a hole rather than across the floor, and a waterfall does not thin out on the way. Flowing water with nothing feeding it dries up, so breaking a source takes the stream with it.

**Fall damage** is a half-heart per block past the third, cancelled by water and by the other things that break a fall, and never charged to a creative or flying player. Movement is client authoritative here, so the server cannot simulate the fall and instead adds up the positions it is told about - which means rising has to reset the distance, or every jump would be measured from the floor it started on.
