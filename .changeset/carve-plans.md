---
'@jsprismarine/worldgen': patch
---

A source chunk's cave and canyon tunnels are walked once and replayed for every chunk they can reach: `CarverStarts.plansAt` records each started carver's ellipsoids as a `CarvePlan`, and `replayCarvePlan` carves one chunk from it, ending a tunnel where it can no longer reach the chunk. The carved blocks are the same.
