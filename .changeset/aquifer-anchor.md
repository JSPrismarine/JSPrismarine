---
'@jsprismarine/worldgen': patch
---

The noise aquifer looks up the twelve aquifer cells around a block's anchor once per anchor instead of once per block. Over 16 overworld chunks the lookups drop from 1,506,120 to 196,548, with the same blocks.
