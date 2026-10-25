---
'@jsprismarine/structures': patch
'@jsprismarine/prismarine': patch
---

Give a generated structure the block entities and the mobs Java's data declares. Across the
generation corpus's seven decorated chunks the generator produced one block entity and no entity
spawns at all, including in the trial chambers chunk. Three faults stacked up.

The jigsaw assembler rejected every connection that pointed back into its own piece. Java gives
such a connection a free space built from the parent piece's own box, with the parent not cut out
of it, so a child may overlap the piece it hangs inside; the assembler checked each candidate
against every placed piece instead. A trial chamber hangs its spawners, its vaults, its dispensers
and its pots off exactly those connections, so it grew none of them. At seed 1234 the chunk at
3,-14 goes from 30 pieces to 251.

A template's entity list was never read. That list is how a village gets its villagers, its cats
and its iron golem, an igloo its two villagers and a bastion its piglins; across the 1511 templates
Mojang ships it names 288 mobs, and none of them existed. `TemplatePiece` now records them at the
fractional position they were saved at, with the yaw turned and reflected the way Java turns it.
`StructureWriter.spawnEntity` takes the entity's own position rather than the block's, so a mob
saved between blocks stays there.

The Java to Bedrock block entity id table had six rows: chest, trapped chest, barrel, bee nest,
spawner and end gateway. Everything else was dropped on the floor, which is 422 of the 1124 block
entities the templates declare. It now covers the whole of Java 26.3's `block_entity_type`
registry, and a vault's loot table is read out of the `config` compound Java keeps it in rather
than only from the top level. Over the structure starts within 24 chunks of three seeds' origins,
108 block entity placements of which 85 survived became 1199 of which all 1199 survive.
