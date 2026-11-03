---
'@jsprismarine/worldgen': patch
---

Size a chunk's interpolation cells from the `interpolated` nodes reachable from final density. Once the surface pass compiled `chunk_surface_level` on the same random state, later chunks walked 6144 cells instead of 768. `RandomState.interpolationCellSizeOf` returns the cell of one tree, and `RandomState.interpolationCellSize` is deprecated.
