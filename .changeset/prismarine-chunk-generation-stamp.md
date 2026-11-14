---
'@jsprismarine/prismarine': patch
---

Stamp every LevelDB chunk with the Java data version of the server that saved it, as Java's `DataVersion` does, in a `jsprismarine:chunk_generation:` record, and write Bedrock's `BlendingData` record so BDS treats the server's chunks as current. Chunks read back follow Java's rule for old generation: an overworld chunk with no stamp or one older than data version 4997 is old, covering sections 0 to 16 when Bedrock's pre-1.18 generator made it. The provider exposes stored chunks to the generator through `storedChunks(dimension)`. A save written before this release has no stamps, so its chunks count as old, and new terrain generated next to them blends toward them, as Java 26.3 does with worlds from before 26.3. The change is additive: saves keep loading and no API is removed, so it is a `patch` under the versioning policy for packages below 1.0.0.
