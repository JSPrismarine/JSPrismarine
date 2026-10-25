---
'@jsprismarine/packs': patch
---

`loadDatapack` opens only the files it can route. A vanilla 26.3 datapack is 8373 files of which
6335 reach a registry; the rest are the worldgen, villager trade and nested built-in pack
directories this loader does not consume, and each of them cost a syscall pair for bytes that went
straight back out. Overlay directories are matched by shape - a path that routes once its leading
directory is dropped - because their names live in the `pack.mcmeta` this also reads.

A declared overlay's file count is still taken over every path in the pack rather than over the
files that were read, so `mcmeta.empty-overlay` still means what it says for an overlay that holds
nothing but registries the loader skips.
