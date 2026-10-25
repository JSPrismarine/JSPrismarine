---
'@jsprismarine/prismarine': minor
---

Delete the entity class hierarchy the data-driven runtime replaced.

Every mob is a component set in `EntityRuntime` now, with a `GenericEntity` for a body, so the 111
written classes beside it were running nothing. 152 files and 6,740 lines go: the 74 mob classes
under `hostile/`, `neutral/` and `passive/`, 34 of the 43 under `other/`, `Mob`, `MobStats`,
`MobEnvironment`, `EntitySize`, `ai/Brains`, `ai/Targeting`, `ai/Speed`, `ai/GoalSelector`,
`ai/Goal`, `ai/Navigator` and the 11 legacy goals.

Seven classes stay, the ones whose behavior no behavior pack describes: a dropped stack, a lit TNT,
a falling block, the three thrown things and `Human`. `Entities.spawnableEntities()` and
`allEntities()` become `Entities.writtenEntities()`, a map of those by identifier, and
`EntitySerializer.isModeled` and `EntitySerializer.reset` go with the index they read.

Three things that used to come from a table in this repository now come from the pack stack. Every
hitbox is the type's own `minecraft:collision_box`, with Java's numbers kept for `minecraft:item`
and `minecraft:falling_block`, which Mojang ships no entity file for. `/summon`'s `EntityType` enum
is every type the stack declares summonable rather than a list of classes, so a pack that adds a mob
gets it completed. An entity world generation left in a chunk goes to the runtime first, so a
village's villager arrives with its components, its brain and its trades instead of as an inert
body.

Two fixes fall out of it. A blow now shoves a mob again: the body hands the impulse to the entity
behind it, which the runtime already integrates, where before a sword took a cow's health away and
left it standing exactly where it was. `Entity.getHeldItem` and `Entity.setHeldItem` move up from
`Mob`, so what an entity is holding is a question anything can answer rather than a type test.
