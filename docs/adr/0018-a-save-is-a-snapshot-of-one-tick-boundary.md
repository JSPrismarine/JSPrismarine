# A save is a snapshot of one tick boundary

Status: accepted, 2026-11-12, with the changes [the save pass measurement](../research/save-pass-measurement.md) asked for

A save pass writes the authoritative state of one tick boundary of a level, called the save cut, for every dimension the level holds, and commits it as one atomic write. At the cut the level encodes the player and entity records, takes each chunk's entity membership, and marks the chunks that gameplay changed since the last pass. Those chunks are encoded over the following ticks, a bounded count each tick. A sub chunk of a marked chunk that is about to be written to is encoded first, with the chunk's height and biome record. Every chunk write goes through a method of `Chunk`, and no code outside generation and loading may hold a mutable sub chunk or biome store, so the hook sees every write. Once the last marked chunk is encoded, the bytes go to disk as one batch. The append and its sync run off the server thread, and the next pass waits for the commit. The level metadata travels in the same atomic write, and `level.dat` is rewritten afterward, once per pass of the level, as a copy through an atomic file replace.

A chunk generated since the last pass and not changed by gameplay is not part of the cut. It is written on its own, as terrain and generation spawns, with no actor records or digest. Such a chunk has the same content at every tick boundary since it was generated, so it needs no cut. A fresh chunk that gameplay touches before it is written moves into the cut whole.

Today a pass mixes ticks. Autosave starts mid-tick, on the first microtask after its trigger. Players are captured then. Chunks are serialized eight at a time with an event-loop turn between batches, each with the entities it held when the pass started and their state when the chunk is written. A crash can therefore leave an item both in a saved inventory and in a chest saved several ticks later. A crash between the writes of two chunks keeps an entity that moved between them in both or in neither. A player's record on disconnect and on a dimension change, and a chunk on unload, are written outside any pass today. Under this rule they join the next commit. Each chunk's own write is already atomic, and `level.dat` is written in place, once per dimension, with no atomic replace.

## Considered options

[The save pass measurement](../research/save-pass-measurement.md) counted three options on a pass of 441 freshly generated chunks, 200 entities and one player, 9.92 MB encoded.

Encoding everything at the cut puts all 642 records into one tick. Encoding each marked chunk before its first later write, which this ADR first proposed, spreads the encodes but still holds 9.92 MB until the commit, most of it terrain no player has touched. Cutting only what gameplay changed and copying per sub chunk holds about 66 KB for the same pass, and a forced encode is one sub chunk and the height and biome record, about 4 KB, where a whole chunk is about 22 KB. The third option is the rule above.

## Consequences

The encoded pass stays in memory until it commits. The count to watch is encoded bytes held per pass. A changed chunk encoded to about 22 KB in the measurement, so a pass over the 441 chunks it loaded around one player holds about 10 MB if gameplay changed all of them. That is an estimate at the measured sizes, not a limit: the held bytes grow with what the changed chunks encode to.

`Database.write` in `@jsprismarine/leveldb` appends a batch of any size to the log as one record, so a pass can commit as one batch. A batch larger than the write buffer goes into the memtable whole and is flushed as one table, and a crash applies none of a batch whose record is incomplete. The call is synchronous today and its log is not synced by default. `Database.write` gains a per-call sync flag and an asynchronous commit that appends and syncs off the server thread, and no other write reaches the database while a commit is in flight.

`Chunk` hands out its sub chunks and biomes through read-only types (`ReadonlySubChunk`, `ReadonlyBlockStorage` and `ReadonlyChunkBiomes`), so a TypeScript caller writes through a method of `Chunk` or not at all. A generator or the provider builds sub chunks and a biome column and hands them to the chunk before it joins a world. The types are not copies, so a plain JavaScript caller can still write around the chunk. The pass counts such a write as `bypassedWrites` and logs it.

The measurement could not establish how many chunks gameplay changes in an autosave interval. It is between none and every chunk a player keeps loaded, and the worst case is what the commit path has to carry.
