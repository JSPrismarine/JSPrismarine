---
'@jsprismarine/block-behaviors': patch
---

Decide what keeps farmland from reverting with Java's `#minecraft:maintains_farmland`, and read the ground a crop stands and grows on through `#minecraft:supports_crops` and `#minecraft:grows_crops`. Farmland used to keep its field for anything carrying a `growth` state, which is neither what the tag holds nor what Java asks: a torchflower holds a field without growing and a sweet berry bush grows without holding one. `VoxelDimension.tag` seeds tag membership so a behavior test can state the rule it is testing instead of reaching the name fallback.
