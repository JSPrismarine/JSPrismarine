---
'@jsprismarine/prismarine': patch
---

Each edition's code now lives in its own folder: Bedrock's packet handlers, decoders, presenter and join packets under `editions/bedrock/`, and Java's under `editions/java/`. The handler contexts are under `player/context/`. The exported handlers have new subpaths, such as `@jsprismarine/prismarine/editions/bedrock/handler/AnvilDamageHandler`. The old `network/` subpaths still resolve to the same modules and are deprecated.
