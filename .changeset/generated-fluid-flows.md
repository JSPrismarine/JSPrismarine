---
'@jsprismarine/prismarine': patch
---

Water and lava that world generation leaves over air now flow when their chunk loads. Java marks those fluids for post-processing and schedules a fluid tick for each, so an aquifer over an empty cave falls and a lake edge spreads. This server never scheduled one, and the water hung in the air until something disturbed it.
