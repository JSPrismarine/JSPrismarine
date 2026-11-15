---
'@jsprismarine/block-behaviors': patch
---

Keep a stalagmite standing on the block below it. Pointed dripstone used to require support from above, so every stalagmite popped at the first neighbor update. Support now follows the tip, as Java's `PointedDripstoneBlock.canSurvive` does, and a pointed dripstone pointing the same way counts as support.
