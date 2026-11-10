# The change log is a world's history, complete and invertible

Status: accepted

The simulation's change log is the history of a world. It is complete. Every mutation of authoritative state goes through a setter that appends a delta, so a change that is not in the log did not happen, and a test checks that a snapshot plus the log reproduces the replay digest. Every delta carries the before-value and the after-value of what it changed, so the history can be read forward or backward from any tick. A tick, at whatever scale, is the unit of history, and entries are addressed by tick and sequence number. A finer internal tick rate would change the scale and leave the format alone.

A replay (see [ADR 0006](0006-replay-determinism-contract.md)) re-simulates forward from a keyframe. It cannot undo a selected change in a live world, such as one player's griefing. Before-values make that possible. They cost the old value of each changed field, which is three doubles for an entity position. The server re-architecture plan rejected event sourcing as the whole architecture because it is a tarpit at 20 TPS. This decision is narrower. State stays stored directly, and the log has to be complete.

An entry is one of three kinds, and each kind has a stated inverse.

- A field entry carries the before-value and the after-value of one field: an entity field, the block at a position, one inventory slot or one block entity field. Its inverse writes the before-value.
- A membership entry records an entity entering or leaving the store and carries the entity's saved form. The inverse of a removal adds the entity back from that form.
- A chunk entry records a chunk entering or leaving the world. It names the chunk and does not carry its content, because a loaded or generated chunk arrives as an input ([ADR 0009](0009-external-inputs-enter-once-per-tick.md)). History cannot be read backward past the point where a chunk entered.

The entries one unit of work appends form a span. One entity's update, one block update, one applied input and one committed action ([ADR 0013](0013-vetoable-actions-are-staged.md)) are each a unit. A unit that throws is undone by applying the inverses of its span in reverse order ([ADR 0015](0015-a-tick-is-a-fixed-sequence-of-synchronous-phases.md)). That gives invertibility a use inside this program, and a test for every entry kind: applying a span and then its inverse leaves the replay digest unchanged.

This program keeps a tick's log only until replication and the save cut ([ADR 0018](0018-a-save-is-a-snapshot-of-one-tick-boundary.md)) have read it, so the before-values cost memory for one tick and nothing on disk. Retention (a ring of recent ticks plus keyframes), crash recovery from the log and rollback tooling are later work that needs no format change. The cost of the log is counted in deltas and bytes per tick, never in time.
