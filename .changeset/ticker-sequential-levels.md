---
"@jsprismarine/prismarine": patch
---

The ticker updates levels one after another in the order the world manager loaded them, instead of all at once. A level whose update throws is logged with its name and the rest still update in the same tick, and the next tick starts only once every update of the current one has settled.
