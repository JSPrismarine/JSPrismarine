---
"@jsprismarine/prismarine": patch
---

The ticker closes each world's change log tick when the input step, the tick functions or a tick listener throws. The tick used to stay open, so the next tick's entries landed in it under its number, and a failure that repeated stopped every world's sealed ticks.
