---
'@jsprismarine/prismarine': patch
---

`WorldManager` builds the Java worldgen registries its levels read from the server's composed
pack stack instead of from the vanilla datapack alone, so a datapack in the stack can add a
`dimension_type` or a `worldgen/noise_settings` document and a stem can name it. The `preset`
a world names resolves against the built-in two presets with every `worldgen/world_preset` the
stack carries over them. The deprecated `Overworld` generator class keeps reading the vanilla
datapack for itself and opens its own worker pool, as its JSDoc now says; it goes in the next
release.
