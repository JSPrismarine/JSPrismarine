---
'@jsprismarine/bedrock-data': patch
---

Add `dump:bedrock`, the Bedrock half of the capture job. It copies the pinned Bedrock Dedicated Server into a run directory of its own, makes the binary executable, turns the content log on, and drives three passes: a dump behavior pack that writes every Script API registry to `src/jsp/bedrock/`, a reference world generated from a fixed seed and reduced to `src/jsp/reference_world.json`, and the packet capture, which now also keeps the raw payloads of the engine tables with no decoder yet under `src/jsp/packets/`. The reference world carries a digest per chunk of the heightmap, the 3D biome arrays, the terrain-class row and the block states, whole arrays for sixteen chunks, and one block histogram for the region. The job runs on Linux x86-64, which is the zip `sources.json` pins, and refuses anywhere else.
