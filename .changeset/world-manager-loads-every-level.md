---
'@jsprismarine/prismarine': patch
---

`WorldManager` loads every `worlds.*` entry as a `Level`, with `level-name` as the default. The
stems of a level come from its `preset`, with each `dimensions.<id>` entry replacing that stem's
type or generator or adding a dimension; the Overworld is built at startup and the other stems on
first entry unless the entry says `load: 'eager'`. A save that already carries `worldGenSettings`
keeps those stems over the config, and the server logs each dimension whose saved generator kind
differs from the configured one; a save without them gets them on its first load. An entry still
written as `generator` and `layers` is logged as deprecated once and written back through
`Config.setWorld` as `preset` and `dimensions`. `getDefaultLevel()`, `getWorldByDimension(id)` over
the default level's loaded worlds and `worldFor(id)`, which builds a lazy dimension, are new;
`loadLevel` replaces `loadWorld`, and `getWorlds()` is deprecated. `BaseProvider.setLevel` takes
the save's name and seed, which is all a format reads from its level. The command layer resolves
dimensions through the default level and accepts every stem's dimension, and `/teleport` into
another dimension waits for the world change before it sets the position.
