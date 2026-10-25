---
'@jsprismarine/prismarine': patch
---

Run the weather. `EngineWorld` hardcoded `clear` and `isRainingAt` to false, so two branches of fire spread could never be reached: rain never put a fire out and never stopped it spreading. A world now steps `@jsprismarine/engine-systems`' cycle every tick under the `doWeatherCycle` game rule, keeps the five counters in `level.json` so a shower survives a restart where it left off, and sends the four level events, repeating the current state once a second so a player who just joined sees the rain they are standing in.

`World.isRainingAt` is Java's: it has to be raining and the position has to see the sky, which the light engine already answers per block. `World.setWeather(kind, durationTicks)` is the seam `/weather` needs, with Java's own randomized default duration per kind.
