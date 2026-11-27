---
'@jsprismarine/block-behaviors': patch
---

A new nether portal stands on any floor Java calls solid, read through `WorldActions.isSolid`: it builds on cobwebs and refuses a nether portal block as a floor, as Java's `PortalForcer` does. A host without the hook keeps the push reaction test.
