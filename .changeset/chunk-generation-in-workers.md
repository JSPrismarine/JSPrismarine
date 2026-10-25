---
'@jsprismarine/chunkgen': patch
'@jsprismarine/prismarine': minor
---

Generate whole chunks in worker threads, and serve the chunks somebody is waiting on first.

Measured over a contiguous 24 by 24 block of overworld chunks on an Apple M1 Pro, eight cores:
one thread builds a chunk in 427.8 ms, six workers running only `terrain` in 237.4, and six
workers running the whole ladder in 124.7. The middle row is where this server was. `terrain` is
71 of the 239 ms a chunk costs and it was the only status that left the server thread, so the
decoration pass, the structure layout and the merge stayed serial and no worker count could take
the pool past 1.33 times.

A worker now climbs the whole ladder and hands back the merged region; only the Bedrock
translation stays on the server thread, because it reads this server's mapping tables. That is
safe because this server's decoration pass is already pure - Java writes a feature through into
its neighbors, which is why Java keeps `features` on one executor, while here it runs over a
private view and returns patches. A chunk is therefore a function of the seed and its position,
and `test/chunkParity.ts` builds chunks both ways and compares the serialized result exactly.

`ShardedGenerationPool` gives each worker a region of the world to own, so the neighbors a chunk
reads are ones its worker has already built rather than ones it has to build again. A region
whose owner falls far behind has its overflow taken by an idle worker.

Chunk requests now carry how badly the chunk is wanted. A chunk a player is standing next to is
`immediate`, one inside half their view distance is `soon`, and the rim beyond it is `idle`; the
start region preload is `idle` throughout. The pool drains its backlog in that order instead of
in arrival order, so a player walking into fresh terrain no longer waits behind a preload rim
that was asked for first. A request that becomes more urgent while it waits is moved up.

A chunk several callers want at once is generated once. `World.loadChunk` read the provider on
every call, so overlapping requests for one position each built the chunk and each caller got a
different `Chunk` object; the last to finish won the map, and a block written through one was
invisible through another.

`/locate structure` answers. A structure's position is a function of the seed and the placement
grid, so `Generator.locate` finds the nearest one by laying candidates out against the bare noise
terrain, nearest first, without generating anything.

`World.loadChunk`'s third parameter was an unused `_ignoreWarn` flag and is now the request
options. A caller passing `true` should pass `{ urgency: 'idle' }` or nothing.
