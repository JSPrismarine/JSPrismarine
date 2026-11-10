# A world exchanges only plain data with everything outside it

Status: accepted

Five rules keep a world's simulation separable from the code around it.

1. Only ids and plain data cross a world's boundary. Nothing outside a world holds an entity object.
2. A world's state changes only through that world's own setters, on its own thread.
3. The simulation's output is a per-tick plain-data change log.
4. Offloaded work is a pure function of a plain-data snapshot, and its result returns as an input under [ADR 0009](0009-external-inputs-enter-once-per-tick.md).
5. Movement between worlds is a message. A transfer carries the entity's saved form and leaves at a tick boundary of the source world. The destination admits it at the start of one of its own ticks, so the two worlds' ticks do not need to align.

Today handlers mutate player objects directly, and a handler can run between the awaits of a tick, so nothing marks where a world ends. With one writer per world and plain data at its edge, replication, pathfinding or a whole world can move to another thread later without changing the model. This program delivers the seams only. It moves no world, replication stage or pathfinding to another thread.

## Considered options

The candidates for later are replication on workers, one thread per world, pathfinding offload and parallel regions inside a world. Parallel regions need typed-array storage and would reopen [ADR 0007](0007-one-entity-index-visible-on-write.md) and [ADR 0008](0008-one-entity-model.md), so they come last. Pathfinding offload delivers a path a tick later than Java computes it and needs a parity check before it ships.
