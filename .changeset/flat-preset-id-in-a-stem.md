---
'@jsprismarine/worldgen': patch
'@jsprismarine/prismarine': patch
---

A `minecraft:flat` level stem may name a `worldgen/flat_level_generator_preset` id in place of
its settings object, as Java's `world_gen_settings` allows. `parseGeneratorDefinition` keeps the
id as a `FlatPresetGeneratorDefinition`, the `minecraft:flat` factory resolves it through the pack
stack's preset registry and reads the document's `settings`, and the save writes the stem back
as the id. `isFlatGenerator` narrows to a stem that carries its layers, so the `level.dat` flat
layers and the announced biome are written only when the layers are in the stem.
