---
'@jsprismarine/prismarine': minor
'@jsprismarine/entities': minor
'@jsprismarine/entity-goals': minor
---

Fix two gaps the written entity classes were covering, found by connecting real clients to a
server running the data path alone.

A data-driven mob dropped nothing when it died. `EntityRuntime.kill` read the loot table off the
resolved type, which only ever sees an entity's base components, and 29 of the 128 vanilla entity
files declare `minecraft:loot` only inside a component group. The cow carries it in
`minecraft:cow_adult`, so every cow, pig, sheep and chicken in the world died empty-handed. The
table is now read off the live instance through `EntityInstance.lootTable()`, which sees the
groups the entity's spawn event turned on, and falls back to the type.

`minecraft:behavior.mount_pathing` started on nothing more than the entity having a target. The
adult zombie carries it at priority 2 and `minecraft:behavior.melee_box_attack` at priority 4, and
both claim the `move` and `look` control flags, so the moment a zombie picked a player it took
those flags off every goal below it and stood still. Mojang's wording for the goal is "while
mounted", and it now refuses unless the entity is riding something.
