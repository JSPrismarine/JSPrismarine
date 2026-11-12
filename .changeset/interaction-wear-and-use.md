---
"@jsprismarine/prismarine": patch
---

An entity interaction that both wears the held item and uses one of the stack keeps the wear. The count was written back from the stack as it was before the hit, which undid the durability it had just spent.
