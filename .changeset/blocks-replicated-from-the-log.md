---
"@jsprismarine/prismarine": minor
---

Send block and block entity changes from the change log. `WorldChangeSink` loses `worldChanged`, and the `WorldChange` type is gone: a sink now gets each sealed tick of the world's change log through `tickSealed`, and the block entities of each chunk that enters and leaves through `chunkEntered` and `chunkLeft`. `NetworkWorldReplicator` reads the tick's `block` and `block-entity` entries and folds a block entity's compound from its logged fields, which it keeps for the loaded chunks. A custom sink that recorded block changes reads them from `tickSealed` instead.

A world seals its tick before it sends the tick's changes, and a block write between ticks, such as one from a command, is logged at the start of the next tick, which is when its update went out before. `World.resendBlock` logs a `block-shown` occurrence. Clients see the same blocks at the same ticks. A write that a failed unit of work undid no longer sends the block it restored.
