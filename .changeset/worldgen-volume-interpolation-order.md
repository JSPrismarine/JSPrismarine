---
'@jsprismarine/worldgen': patch
---

Fill interpolation cells in the order Java builds terrain in. Java 26.3's `doFill` samples `final_density` through `sampleVolume`, whose `interpolated` nodes lerp the four z edges, then x, then step y as a running sum, and its per-block `sampleValue` interpolates x, then y, then z. The two differ in the last bits of a float, and the terrain fill followed the per-block order. The cell walk now uses the volume order and matches Java's `sampleVolume` bit for bit in every section of the 14 captured chunks, while a sample taken one block at a time keeps the per-block order. One block of the committed generation corpus changes from air to stone, at -2392, 38, -4815 for seed 1234, where Java's density is 9.3e-10 and the per-block path's was -3.7e-9.
