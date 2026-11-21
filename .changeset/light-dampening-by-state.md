---
'@jsprismarine/blocks': patch
---

Dampen light by each block state as Java does. The vanilla overlay wrote per-state light emission but one light dampening per block, so a full snow layer let light through, and a live sea pickle and a resin clump or sculk vein with no faces did not dampen it at all. Those states now carry their own `minecraft:light_dampening` permutation.
