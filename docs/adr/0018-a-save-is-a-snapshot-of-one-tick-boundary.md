# A save is a snapshot of one tick boundary

Status: proposed

A save pass writes the authoritative state of one tick boundary, called the save cut, and commits it as one atomic write. At the cut the world encodes the player and entity records and marks the chunks that changed since the last pass. Those chunks are encoded over the following ticks, a bounded count each tick. A chunk in the marked set that is about to be written to is encoded first, which every write makes possible because every write goes through a logged setter ([ADR 0012](0012-the-change-log-is-the-history.md)). The encoded bytes go to disk between ticks. The level metadata travels in the same atomic write, and `level.dat` is rewritten afterward as a copy through an atomic file replace.

Today a pass mixes ticks. Autosave starts mid-tick on the first microtask after its trigger. Players are captured then, and chunks are serialized eight at a time across later ticks, each with the entities it holds at that moment. A crash can therefore leave an item both in a saved inventory and in a chest saved several ticks later, or drop an entity that changed chunk during the pass. Each chunk's own write is already atomic, and `level.dat` is written in place with no atomic replace.

## Considered options

Encoding every changed chunk at the cut gives the same result with no copy-on-write rule. It puts the whole pass's encoding into one tick, so the cost of that tick grows with the number of changed chunks. Encoding before the first later write spreads the same number of encodes across ticks.

## Consequences

The encoded pass stays in memory until it commits. The count to watch is encoded bytes held per pass.

`Database.write` in `@jsprismarine/leveldb` appends a batch of any size to the log as one record, so a pass can commit as one batch. That call is synchronous and its log is not synced by default (`DatabaseOptions.sync`). The commit therefore runs on the server thread between two ticks, and its cost grows with the bytes in the pass. Moving the append off the thread and syncing the log at each commit are open before this is accepted.
