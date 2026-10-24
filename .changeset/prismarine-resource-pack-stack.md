---
'@jsprismarine/prismarine': minor
---

`ResourcePackStackPacket` now writes the full protocol 2193 stack. Each `texturePackList` entry is a `PackInstanceId` with `packId`, `version` and `subPackName`, the `baseGameVersion` string and `includeEditorPacks` flag are fields instead of hardcoded values, and `experiments` is an `Experiment` array written with the uint32 little-endian count the docs specify. The packet also decodes. The unused `addonList` field is gone and `experiments` is no longer a `Map`.
