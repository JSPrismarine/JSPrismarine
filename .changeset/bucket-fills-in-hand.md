---
'@jsprismarine/block-behaviors': patch
'@jsprismarine/item-behaviors': patch
'@jsprismarine/prismarine': patch
---

Fill and empty buckets in the hand. Picking up water or lava with a bucket used to drop the filled bucket on the ground, and pouring a water or lava bucket out kept the full bucket. The liquid block family no longer answers a bucket or a glass bottle, so the item's own behavior takes the click, and the server now puts a behavior's replacement item in the hand and resends the inventory. The same write-back leaves the empty bucket in the hand after drinking milk. An empty bucket only picks up a source, never a flow.
