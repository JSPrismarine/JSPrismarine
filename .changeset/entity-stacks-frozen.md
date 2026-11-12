---
"@jsprismarine/prismarine": minor
---

A mob body freezes the item stacks it stores in its equipment and container slots. A caller that changed a stack after handing it over changed the slot without a logged write, so the change log and the next save disagreed about the slot. Breaking: that change now throws a `TypeError`, so a caller that changes a stack it handed over builds a new stack and stores it through the body instead.
