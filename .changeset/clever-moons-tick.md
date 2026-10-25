---
'@jsprismarine/prismarine': patch
---

Draw random ticks only for the sections Java draws for, which is `LevelChunkSection.isRandomlyTicking`: a scan of the section's palette rather than a test for an empty sub chunk. A section of solid stone was being drawn for, and because the draw state is one counter shared across the world, every extra draw shifted every position drawn afterwards, so the ticked-position sequence was not Java's. Over 441 simulated chunks the pass went from 3528 sections and about 3.2 ms to 441 sections and about 0.52 ms.
