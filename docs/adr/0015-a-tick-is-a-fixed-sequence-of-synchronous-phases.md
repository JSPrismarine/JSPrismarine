# A tick is a fixed sequence of synchronous phases

Status: accepted

A world's tick runs these phases in this order. Each one is synchronous and bounded by counts.

1. The input step applies the inputs admitted for this tick ([ADR 0009](0009-external-inputs-enter-once-per-tick.md)).
2. World systems run block updates, scheduled block and fluid ticks, random ticks and light.
3. World services run raids, cooking stations, spawners and the dragon fight.
4. Entities handle portal contact, then run one pass in runtime-id order ([ADR 0007](0007-one-entity-index-visible-on-write.md)).
5. Population runs spawn and despawn.
6. Script flush runs the world's script runtime until its queues are empty: after-events, `system.run` tasks and promise jobs, in the loop Bedrock documents, bounded by the script watchdog's step budget ([ADR 0020](0020-scripts-run-in-quickjs-on-the-world-thread.md), [ADR 0021](0021-the-script-watchdog-counts-steps.md)). Writes a script makes here enter this tick's change log.
7. Close seals the tick's change log ([ADR 0012](0012-the-change-log-is-the-history.md)).

Replication reads the log after close, outside the simulation ([ADR 0016](0016-replication-reads-the-change-log.md)). Autosave and chunk unload begin outside the simulation, and their results return as inputs. A save reads the state of one tick boundary ([ADR 0018](0018-a-save-is-a-snapshot-of-one-tick-boundary.md)). Worlds tick one after another in a fixed order and not through `Promise.all`, so one world's tick never interleaves with another's.

When code throws in a phase, the damage stays at the smallest unit that keeps the store consistent. A unit of work that throws is undone first: the store applies the inverses of the entries that unit appended to the change log ([ADR 0012](0012-the-change-log-is-the-history.md)), so a half-finished update leaves nothing behind. An entity that throws is then skipped for the rest of that tick, logged with its type and id, and removed after a fixed count of consecutive failures. A player is disconnected instead of removed. A throw outside the entity pass undoes the unit that threw and aborts that phase for the tick. Each world is isolated, and a failing world never skips another.

The order is the one `World.update` has today, and the parity suite and replay digests pass with it. Matching Java's order is not the goal. Changing no functionality is. A reordering needs a parity or replay result that shows no observable difference.

Today the tick awaits at many points, so a handler can run in the middle of it and the order of effects depends on promise scheduling. The ticker already logs a failed tick and carries on instead of stopping the server. This keeps that choice and stops one world's failure from affecting another.

Changed 2026-11-16: added the script flush phase before close. Bedrock flushes after-events and system tasks at the end of the tick where they were queued, so they cannot wait for the next tick's input step. Before-events are not part of the phase. They run inline as guards under [ADR 0013](0013-vetoable-actions-are-staged.md). A world that loads no scripts runs an empty phase.
