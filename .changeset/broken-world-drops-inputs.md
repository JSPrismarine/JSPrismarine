---
"@jsprismarine/prismarine": patch
---

A world whose entity store failed to undo a unit drops the inputs it is given instead of applying them. It already stopped ticking, but players' packets and the tick functions went on writing to its half-undone state.
