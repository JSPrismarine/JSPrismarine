---
'@jsprismarine/prismarine': patch
---

Place a seed item's crop. Java links `wheat_seeds` to `wheat`, `carrot` to `carrots`, and the rest of the plantables to their blocks in code rather than data, so the click path's item-to-block table has to carry them; a click that resolved the seed to no block planted nothing. Sweet berries, glow berries, cocoa beans, and string place their blocks the same way.
