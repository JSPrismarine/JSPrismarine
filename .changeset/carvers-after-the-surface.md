---
'@jsprismarine/prismarine': patch
---

Run the carvers after the surface materials, and leave open air alone.

`DataDrivenGenerator` carved before building the surface, so the surface rules ran over terrain
that was already full of holes. The 26.3 server jar's `terrain` status runs `doFill`, then
`buildSurface`, then `generateCarvers`, so a cave mouth should cut through finished grass instead.

A carver's mask can also reach above the terrain, because `carver/cave.json` runs up to `y: 180`.
Writing there was a no-op in value but went through the region, which tracks each column's highest
block, so a cell that is already air is now skipped.
