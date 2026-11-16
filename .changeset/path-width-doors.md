---
'@jsprismarine/entity-goals': patch
'@jsprismarine/prismarine': patch
---

Size path cells by the mob's width, as Java's node evaluators take `floor(width + 1)` blocks each way, so a horse, panda, spider or other mob a block wide or wider no longer paths through a one-block gap, and walks to the middle of its cells. A mob with Java navigation now routes through a closed wooden door only when its Java navigator opens doors, or when it can break them, and a zombie, husk or zombie villager can break doors by Java's spawn chance (a tenth of the local difficulty's special multiplier, none on a fresh Normal world) rather than Bedrock's one in ten. A drowned never breaks doors.
