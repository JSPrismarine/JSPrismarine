# External inputs enter a world once per tick and are recorded

Status: accepted

Anything outside a world's tick reaches that world as an input: inbound packets, chunk completions, and the results of offloaded work such as pathfinding, lighting or encoding. A world applies its inputs in one step at the start of its tick. Inside the tick nothing reads the wall clock, and every limit on work is a count. The wall clock may decide only when an input is admitted to a tick, as the 2 ms drain of the chunk completion queue does. Each admitted input is recorded in the replay trace with its tick number, and a replay admits exactly the recorded set.

This is what makes the replay contract in [ADR 0006](0006-replay-determinism-contract.md) hold. Today an inbound handler can run between the awaits of `World.update`, and capture stamps a frame that arrives mid-tick with the current tick while replay injects it at the start of that tick, so live play and its replay can differ. Block updates and scheduled ticks also stop on `performance.now()`, with budgets of 20 ms and 25 ms. Those limits become counts. An overloaded host then ticks slower, as Java does, and never simulates differently.

Not every inbound packet is an input. A handler declares one of three lanes, and the lane decides when it runs.

- The connection lane is for a handler that touches only its own network session, such as network settings, cache status, latency and resource pack transfer. It runs when the packet arrives and never enters a world.
- The read lane is for a handler that reads authoritative state, writes none, and replies only to the connection that asked, such as a sub-chunk request. It runs when the packet arrives, between ticks, against the state the last tick closed with. It may wait for a chunk, and the chunk still enters the world as an input. Its replies are not recorded, because they cannot change a digest.
- The input lane is for every handler that writes authoritative state or produces something other players see. Only these packets are inputs, applied in the input step and recorded.

Without the read lane, chunk streaming would wait for the next tick and slow down with the tick rate. The read lane depends on the handler and the tick sharing a thread. A world that moves to its own thread serves these reads from replication's replica ([ADR 0016](0016-replication-reads-the-change-log.md)) and the chunk payload cache instead.

The rule says nothing about threads. It describes how a world talks to anything outside it, which is what lets pathfinding, replication or a whole world run elsewhere later without changing the model.
