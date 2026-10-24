---
'@jsprismarine/prismarine': minor
---

Every entity now spawns under an actor type the client was told about in `AvailableActorIdentifiersPacket`. `EvokerIllager` uses `minecraft:evocation_illager` instead of the unknown `minecraft:evoker_illager`. The `Chalkboard`, `MovingBlock` and `Shield` entity classes are removed from `Entities`: their types are not in the 1.26.51 identifier list, so a client could never draw them.
