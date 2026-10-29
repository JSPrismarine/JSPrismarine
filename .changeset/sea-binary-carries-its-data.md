---
'@jsprismarine/server': patch
---

The packaged single executable now arranges the data it runs on. The binary carries the Java
worldgen data (vanilla datapack, biome parameter reports, structure templates) and this
project's overlay packs as an embedded bundle, extracts them on first run, and downloads the
pinned Bedrock Dedicated Server zip from Mojang — verified against its sha256, keeping only the
vanilla behavior pack — because its license does not allow shipping the zip inside the binary.
`JSP_VANILLA_BEHAVIOR_PACK` skips the download for offline machines. The SEA bundle also
externalizes `@jsprismarine/console` (whose native renderer cannot be bundled) and resolves
`jsonc-parser` to its ESM build, fixing a startup crash where the executable's `require` could
not reach the UMD build's relative imports. Outside the executable nothing changes.
