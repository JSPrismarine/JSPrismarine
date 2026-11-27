---
'@jsprismarine/block-behaviors': patch
---

Placed and neighboring attached blocks follow each block's own Java survival rule, through the new optional `WorldActions.isFaceSturdy` and the existing `isSolid`. Signs and banners stand on or hang against a block Java calls solid; ladders, levers, buttons, tripwire hooks, coral fans and floor or wall bells need a sturdy face toward them; lanterns and ceiling bells and hanging signs need a sturdy center. So a sign stands on a sign, a ladder goes against the back of a ladder and a lantern hangs under a lantern, as in Java, and a coral wall fan no longer attaches to a coral fan. A grindstone survives anywhere, as Java's does, and a ceiling hanging sign no longer pops when a block beside it changes.
