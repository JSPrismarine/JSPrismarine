---
"@jsprismarine/prismarine": patch
---

A mob body freezes the item stacks it stores in its equipment and container slots. A caller that changed a stack after handing it over changed the slot without a logged write, so the change log and the next save disagreed about the slot. That change now throws a `TypeError`.
