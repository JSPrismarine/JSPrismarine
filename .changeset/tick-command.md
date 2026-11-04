---
'@jsprismarine/commands': minor
'@jsprismarine/prismarine': patch
---

Add Java's `/tick` command. `/tick rate <ticks per second>` sets the target tick rate, `/tick freeze` and `/tick unfreeze` hold the world and its functions still while the server keeps serving players, `/tick step [time]` runs a frozen world forward a few ticks, `/tick sprint <time>` runs ticks back to back, and `/tick query` reports the rate and how long a tick takes. `ServerCommandHost` gains a required `ticking` group for the command to drive the tick loop.
