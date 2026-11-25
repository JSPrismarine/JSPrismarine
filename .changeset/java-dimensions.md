---
'@jsprismarine/prismarine': minor
---

Java Edition players are shown the dimension they are in. A Java player who logs in where their record left them, such as a linked account whose Bedrock play ended in the Nether, is now told that dimension and sent its chunks. Before, the client was told the Overworld and sent the default world's chunks, so it fell and its moves pulled the server's player down with it. A change of world through a portal, a command or a respawn now sends `Respawn` into the new dimension and the chunks around the arrival, and a death respawns the player in the dimension their spawn point is in. A Java player also logs in standing on the ground rather than 1.62 blocks above it.

`SessionPresenter.showRespawn` now takes a `ShownRespawn`, which carries the dimension, the feet position, whether the player keeps its data, and whether it replaces another world of the same dimension, and is called on a change of world as well as after a death.
