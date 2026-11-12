---
'@jsprismarine/prismarine': patch
---

The `enable-ticking` description now says what turning it off means: a test steps the ticks with `Server.advanceTick`, and until it does nothing a tick runs happens, so a joining client receives no chunks and never spawns.
