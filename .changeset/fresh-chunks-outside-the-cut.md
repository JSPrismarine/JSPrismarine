---
'@jsprismarine/prismarine': patch
---

A chunk generated since the last autosave and untouched by gameplay is written on its own, between autosaves, rather than as part of the next save pass (ADR 0018). The pass after a start region generates holds only what gameplay changed, not every chunk of the region. The fresh chunk's terrain is written with the mobs its generation left as a pending record, with an end crystal's beam target, bottom plate and invulnerability kept, and those mobs come back as generated ones when the chunk loads. A chunk gameplay touches before its turn is saved by the next pass instead.

The pending record gains a second shape for this. A world saved by an older version reads as before. An older version opening a world saved by this one loses the mobs of a fresh chunk that was never touched.
