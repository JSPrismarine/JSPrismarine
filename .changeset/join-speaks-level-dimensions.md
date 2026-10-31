---
'@jsprismarine/prismarine': patch
---

The join now describes the level's dimensions to the client. `StartGame.generator` is read from the Overworld stem, Flat for a `minecraft:flat` stem and the stem type's overlay value otherwise, instead of from the join world's generator class; `StartGame.dimension` stays the join world's id, so a Nether join sends dimension 1. A level with a custom dimension type sends `DimensionData` after `StartGame` with one entry per custom type, its id from 1000 up, and the cloud fields on the wire for a 2225 session. `SetSpawnPosition` carries the player's own spawn point in that point's dimension when they have one, and the world spawn of the join world otherwise.

Not checked against a real client, since none was available: whether it accepts a dimension id of 1000 or more, and whether `generator` has to describe the Overworld stem when the join dimension is another one.
