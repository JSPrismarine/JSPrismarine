---
'@jsprismarine/prismarine': patch
---

Generated End chunks hand their crystal spawns to the entity runtime whole. The generation
region records the beam target, base plate flag and invulnerability a feature asked for, the
spawn keeps them across the worker boundary and through the chunk's pending entity list, and
`World.createGeneratedEntities` passes them into `EntityRuntime.spawn`. A freshly generated End
pillar's crystal therefore spawns vulnerable with no beam, which is Java's worldgen
configuration, instead of losing the options on the way to the world.
