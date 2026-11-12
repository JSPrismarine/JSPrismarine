---
"@jsprismarine/prismarine": patch
---

A block entity whose `Items` list changes from stacks that each name a slot to a list that does not split keeps that list when the change log is read forward, as replication and a replay read it. Emptying the old slots afterwards wrote an empty `Items` over it.
