---
'@jsprismarine/block-behaviors': patch
'@jsprismarine/prismarine': patch
---

Drop a stalactite as falling block entities, as Java does, rather than moving it a block at a time. Each segment falls in its own state and breaks into its item where it lands, and the tip hurts what it lands on by the column's length, at least 6, for each block fallen, up to 40. A falling block's spawn data can now give the state it lands in (`states`), break it into its item wherever it lands (`breaks_on_landing`) and set its own damage (`hurts`).
