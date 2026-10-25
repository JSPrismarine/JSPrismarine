---
'@jsprismarine/features': patch
'@jsprismarine/prismarine': patch
---

Carry a structure template's saved block entity into the generated chunk, so the contents
translation reaches a world. The translation covers 149 of the 1124 block entities Java 26.3's
templates declare and nothing called it: the generation path read the type, the loot table and the
spawner's mob off the saved compound and dropped the rest, so a generated decorated pot had no
sherds and a generated vault had no key.

`BlockEntityRequest` gains `saved` and `javaBlock`. `saved` is typed `unknown` because
`@jsprismarine/features` models no NBT and depends on no library that does, and the server narrows
it before reading it. `javaBlock` is the Java block the block entity sat in, which is the one thing
the saved compound does not carry: Java keeps a banner's color in the block, Bedrock keeps it in
the block entity and has a single banner block where Java has sixteen, so the color is
unrecoverable once the translation drops the Java palette.

The template store indexes the Java block of each saved compound as it reads a template, keyed on
the compound itself. That works because the compounds travel by reference: `translateJavaTemplate`,
`transformTemplate` and `applyProcessors` each carry `nbt` through untouched, and the one processor
that writes to a block entity, a rule's `append_loot` modifier, adds to the compound it was handed
rather than replacing it.

In a generated world at seed 1234, across the 25 chunks around the trial chamber at chunk 3,-14,
all 16 decorated pots carry their four sherds, all 13 vaults carry their reward table and their
key, and the one dispenser carries its water bucket. The 13 trial spawners there still carry
nothing. That is the listed loss: every trial spawner in the templates writes its configuration as
a reference into Java's own registry, and nothing is wired to resolve one.

A vault no longer gets a top-level `LootTable`. Reading one level down into `config` for it was how
its reward reached a chunk before the contents translation existed. Bedrock's vault reads
`config.loot_table`, which the translation now writes, and a vault is not a container, so
`fillContainerLoot` never rolled the top-level copy either.

One worldgen corpus digest moves, the block entities of `1234/3,-14/full`, which holds the single
vault the 22 corpus chunks record. Blocks, biomes, heightmaps, counts, structures and entity spawns
are unchanged, and so is the ocean ruin chest in `1234/-12,0/full`, which a data marker places with
no saved compound behind it.
