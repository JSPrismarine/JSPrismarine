---
'@jsprismarine/engine-systems': patch
'@jsprismarine/prismarine': patch
---

Draw random ticks only where Java draws them, which is also what makes an idle world free.
`ServerLevel.tickChunks` visits a chunk when a player ticket holds it and draws in a section when
that section's palette holds something that ticks; this server drew in all 24 sections of all 441
loaded chunks with nobody online. `WorldSystemsView.randomTickChunks` is the world's answer to both
halves, and `World` gives it from the players' simulation distance and the chunk's occupied sub
chunks. Measured over the real loop on a flat world: 29.5 ms per tick to 3.5 with the section half,
and to nothing at all with no players online, against a 50 ms tick budget.

`EngineOptions.randomTickHandlers` now receives the block with the position. The engine has just
read it to find the handler, so reading it again cost a chunk lookup and a block-state construction
in the hottest loop the world has.
