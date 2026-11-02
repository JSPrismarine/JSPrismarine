---
"@jsprismarine/prismarine": patch
---

Make monster spawners show their mob and spawn it. A generated spawner's block entity now carries the display fields the client needs to draw the mob in the cage, along with vanilla's spawn rates, and spawners in simulated chunks run Java's cycle: with a player within sixteen blocks they count down, then spawn up to four of their mob on open ground within four blocks, pausing while six already stand there.
