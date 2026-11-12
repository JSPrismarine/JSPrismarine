---
"@jsprismarine/prismarine": patch
---

Two dropped stacks merge only when they are the same item with the same data, as Java's `ItemStack.isSameItemSameComponents` has it: a renamed, enchanted, damaged or filled stack no longer merges into a plain one and loses what made it different. The merged stack keeps the longer pickup delay and the younger age of the two, so a stack thrown a moment ago is not handed over at once or despawned with an old one.
