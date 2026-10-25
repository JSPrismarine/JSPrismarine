---
'@jsprismarine/prismarine': minor
---

Three fixes to the data-driven entity path.

**The villager brain attaches.** `@jsprismarine/entity-brains` registers all twenty of its
definitions under Java Edition's identifiers, and five Bedrock entities kept a legacy name when
Mojang rewrote their file. One of the five is a brain mob: Java's `minecraft:villager` spawns here
as `minecraft:villager_v2`, so the registry read missed it and a villager ran its 27 Bedrock goals
while its schedule, professions, memories and sensors sat unused. `EntityRuntime.spawn` now looks
the definition up through `@jsprismarine/mapping`'s Java to Bedrock entity table, the same source
`javaEntityStats` reads for the same renames. All twenty brain mobs attach; the villager is the only
one of the twenty the two editions spell differently.

**Data entities survive a save.** Nothing restored one: a mob that was running its components, goals
and brain came back from disk as a body with none of them behind it, and the spawn loop counted
nothing against the population cap it had been spawned under, so a reloaded world over-spawned.
`World.saveChunks` now writes each entity's component groups, property values, attributes and body
state into its actor compound under one JSON tag, which is the choice
`blockentity/contentRecord.ts` already makes for fields Bedrock publishes no schema for.
`EntityRuntime.restore` builds the entity back from that record without running a spawn event, so a
wounded mob stays wounded and a sheared sheep stays sheared. The actor's `UniqueID` and every other
tag the file carried move onto the restored body, so the next save addresses the same actor. An
actor the data path never wrote still loads through the written classes.

**`/summon` reaches the data path.** The command resolved an identifier against the 108 written
entity classes, so with `content-packs` on it could neither build a mob from its behavior-pack
definition nor summon anything a pack declares. The verb asks the dimension's `EntityRuntime` first
and falls back to the written classes, which still cover falling blocks, projectiles and everything
the content declares no type for. `SpawnOptions` gains the rotation, applied before the spawn event
runs, so the body a client is first sent faces where the command said.

`entities.spawn` on the live world adapter is also wired: it was left throwing while
`serverSource.ts` already called the widened `worldEntityAccess` signature. It builds a written
class where one adds behavior and a `GenericEntity` carrying the identifier otherwise, and its drop
member keeps the meta, damage, custom name, lore, enchantments and contents the widened `ItemDrop`
carries.
