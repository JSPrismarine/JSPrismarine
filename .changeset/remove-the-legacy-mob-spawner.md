---
'@jsprismarine/prismarine': minor
---

Delete `MobSpawner`. `@jsprismarine/spawning` runs the spawn and despawn cycle inside the
data-driven entity runtime, with Bedrock's caps and cadences and the sixty vanilla spawn rules,
and that cycle now runs on every world rather than only on one with the pack stack turned on.
`MobSpawner`'s 36 hard-coded species, its light and surface checks and its own despawn radius are
gone with it, and `World.dataEntities()` returns the dimension's runtime rather than a runtime or
nothing.
