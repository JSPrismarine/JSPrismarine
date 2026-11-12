---
'@jsprismarine/prismarine': minor
---

A trip through a portal no longer holds up the tick that starts it. The entity's update files the trip with `DimensionTravel.depart`, the destination world is built and its arrival chunks are loaded outside every tick, and the input step of a later tick lands the trip through `DimensionTravel.admit`, which runs as part of the server's input step. The traveler leaves its world and enters the other in that one input step, so a trip lands a tick later than before. `Level.readyWorld` and `Level.prepareWorld` read a built world and start a build without waiting for it.

Breaking: `DimensionTravel.resolve` is gone, and `PlayerSession.completeCredits` returns a `boolean` instead of a promise. The world change after the end credits is filed with the new `DimensionTravel.move` and runs at the next input step.
