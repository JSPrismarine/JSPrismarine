---
'@jsprismarine/prismarine': patch
---

A player going through a nether portal or into the End now sees the loading screen as soon as the destination world exists, instead of standing in the portal while the server generates the arrival terrain and finds or builds the exit portal. The server holds the arrival chunks back until the trip has resolved where the player lands, then moves them there and sends the chunks. `PlayerSession.changeWorld` takes a `holdArrival` option for this, and `PlayerSession.landHeldArrival` and `PlayerSession.awaitsArrival` complete it.
