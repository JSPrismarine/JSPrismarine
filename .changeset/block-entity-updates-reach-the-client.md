---
'@jsprismarine/prismarine': minor
---

Send block entity changes to the clients that already have the chunk. A chunk carries its block
entities in its own payload, so a sign placed before the chunk was sent arrived with its text, but
everything written afterwards went no further than the chunk. `BlockActorDataPacket` was registered
for decoding and no code path ever built one, so a sign's text, a chest's contents, a lectern's
page and a flower pot's plant were server-only facts until the player walked far enough away to
unload the chunk and came back. This matters more since 25 block types started opening real screens
backed by the chunk's own block entities.

`WorldChangeSink` gains `blockEntityChanged` and the `flushBlockEntities` tick phase, and
`NetworkWorldReplicator` encodes a `BlockActorDataPacket` per changed position and sends it to the
players whose streamed chunks cover it. The flush runs after `flushBlockChanges`, which is a
correctness rule rather than an economy: a client drops a block entity update for a position it has
no block entity at, and an `UpdateBlockPacket` landing afterwards makes it rebuild the block entity
from its own empty data, so a chest placed and filled in one tick has to be announced as a block
first.

The three places that wrote a block entity into a chunk - the content adapter behind `setBlockData`,
the piston carry in `blockMove`, and the loot roll a generated chest gets on first open - go through
one new `writeBlockEntity`, which also drops a write whose compound encodes to the bytes already
there. Several families rewrite a block entity on a schedule whether or not anything moved: a
comparator restates its signal on every tick it runs, and a beacon recounts the same pyramid on
every neighbor change. Each of those used to drop the chunk's serialization cache, and would
otherwise now have cost a packet to everyone nearby every tick.

`WorldChangeSink`, and so `World.attachChangeSink`, has two more required members.
