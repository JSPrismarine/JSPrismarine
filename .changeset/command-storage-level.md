---
'@jsprismarine/prismarine': patch
'@jsprismarine/errors': patch
---

A level keeps Java Edition's command storage, `Level.getCommandStorage`: an NBT compound under each resource location, which reads as the empty compound until something writes it. The save writes it under the LevelDB key `jsprismarine:command_storage`, one entry of SNBT per storage, split into a list of strings when it is too long for one, and drops the key once every storage is empty. A provider's `LevelRecords` carry it as `commandStorage`. `PrismarineWorldErrors.InvalidStorageId` refuses an id that is not a resource location.
