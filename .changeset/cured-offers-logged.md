---
"@jsprismarine/prismarine": patch
---

A trader's offers shown to the player who cured it are logged. The first such showing draws the trader's cured discount, which changed its saved state without a change log entry, so an undo could not take it back and a replay of the log did not reach the same offers.
