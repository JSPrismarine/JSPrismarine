---
"@jsprismarine/prismarine": minor
---

Block and block entity writes are recorded in the world's change log, so undoing a unit of work that wrote a block puts the block and its block entity back.

- A block write in a loaded chunk appends a `block` field entry with the runtime id before and after it. A block entity write appends `block-entity` field entries addressed by the block position: `data` for every tag but the stacks, and `items.<slot>` for each stack of an `Items` list, so one stack moved into a chest is one entry. Writes between ticks are counted as unlogged.
- Breaking: `World.blockEntityChanged` and `BlockEntityWorld.blockEntityChanged` take a third argument, the block entity's tags before the write, or `null` when there was none. `writeBlockEntity` passes it.
- `ChangeLogCost` reports `blockEntries` and `blockBytes` beside its totals.
- `EntityStore` gains `writtenBlock`, `writtenBlockEntity` and `addUnitJournal`, and `BlockUpdateScheduler` is a `UnitJournal`, so undoing a unit also takes back the block updates its writes scheduled. `Chunk` gains `restoreBlockRuntimeId` and `restoreBlockEntity`, the writes an undo makes.
