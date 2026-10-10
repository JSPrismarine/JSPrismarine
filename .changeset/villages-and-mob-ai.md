---
'@jsprismarine/prismarine': minor
---

Put villages and wildlife into the overworld, and give mobs an AI that moves them smoothly.

**Structures.** `world/generators/structure/` is new. A structure is a pure function of its origin: the world is cut into a grid of regions, each region's origin is arithmetic on the world seed, and any chunk can work out on its own which structures reach it, plan each one in full, and draw the slice it owns through a canvas that discards everything outside its sixteen blocks. Each of the dozen chunks a village covers does the same work and keeps a different part of it, and the parts fit because they came from the same plan. No chunk needs a neighbour to have been generated, and generating one twice gives the same result - which is what makes a structure larger than a chunk possible at all when chunks are generated alone and in no particular order.

Villages are the first: a well, streets running out from it, and houses, fields and lamp posts along them. Buildings level the ground they stand on - foundations below, headroom cleared above - and are held within a few blocks of the village's own level, so a village drapes over a rise rather than being quarried into it. Sites that are underwater or too rugged are refused, which puts a village roughly every four to five hundred blocks.

**Mobs.** `entity/Mob.ts` and `entity/ai/` are new, and the mobs that spawn now derive from `Mob`. Behaviour is a list of small goals - float, approach, stroll, watch, look around - claiming *lanes* rather than one state machine per species, so a mob can walk somewhere and watch you at the same time. Routes come from A\* over the block grid, and are then straightened by string-pulling and followed by aiming at a point some way *along* the route rather than at the next corner.

Movement is deliberately physical: velocity integrated per tick, chasing a desired velocity rather than being assigned it, with a limited turn rate taking the short way round the circle. A server that decides "the mob is now one block north" produces stuttering no client can hide, so the smoothness is on the server, where it has to be.

The timings and speeds are taken from the vanilla Bedrock behaviour packs rather than invented, and `entity/ai/Speed.ts` holds them in blocks per *second* so they can be judged against a player's 4.317. The one that matters most is `random_stroll`'s `interval: 120` - a one in a hundred and twenty chance *per tick* of setting off, which makes the wait geometric with a long tail. A fixed or uniform pause instead makes a whole field of animals visibly pulse, and each one plainly on a timer. `look_at_player` likewise runs on a 2% roll rather than whenever somebody is in range.

**Movement on the wire.** Three separate faults, none visible in the movement model:

- Rotation was never sent, so every mob faced north whatever it was doing.
- The three rotations were written as pitch, *head* yaw, body yaw. The packet's order is pitch, body yaw, head yaw, so an entity's head was set from its body and its body from its head - a head stuck at an angle that never turned.
- Every move was sent as its own compressed batch and its own RakNet frame, *and* `sendDataPacket` queues behind any chunk still compressing. So while a walking player streamed terrain, every mob's movement waited behind it and arrived in a burst: mobs froze and jumped in the rhythm the chunks were arriving in. A tick's movement now goes out as one batch per player.

Pathfinding was also costing milliseconds a route on the tick thread - the open set was re-sorted on every expansion, the expansion budget did not scale with the distance, and ties were not broken - and a late tick is visible as stuttering however smooth the model underneath is.

`MobSpawner` puts animals on grass by day and monsters in the dark, in groups, around players, and takes away again the ones nobody is near. Village inhabitants and anything restored from the save file are marked persistent and are never tidied away.
