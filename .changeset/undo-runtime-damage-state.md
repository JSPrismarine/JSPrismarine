---
'@jsprismarine/prismarine': patch
---

A unit of work that throws now also puts back the runtime state the change log does not carry: a death in progress, the grace period after a hit, the damage record and whether a fuse has started. Before, a mob whose death threw could never be killed, a blow whose unit was undone was refused when it came again, and a fuse started in an undone update never counted.
