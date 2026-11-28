---
'@jsprismarine/blocks': patch
'@jsprismarine/block-behaviors': patch
'@jsprismarine/prismarine': patch
---

A cauldron swaps the bucket or bottle in the hand instead of dropping one on the ground. Pouring a water bucket into a cauldron used to drop an empty bucket and keep the full one, so every pour gave out a free bucket. An `onPlayerInteract` block hook can now answer `{ consumed: true, heldItemBecomes: '<identifier>' }`: the server turns one of the held item into that item, puts it in the hand when it was the last one, and otherwise adds it to the inventory, or drops it when the inventory is full. A creative player keeps the held item and gets the new one only when the inventory holds none. The cauldron family answers this way for buckets and bottles.
