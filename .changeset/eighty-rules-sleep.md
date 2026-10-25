---
'@jsprismarine/engine-systems': patch
---

Add the weather cycle, which is Java's `ServerLevel.advanceWeatherCycle` over `WeatherData`: three counters, two flags, and the jar's own durations. `advanceWeatherCycle` is a function from one state to the next rather than something that owns a world, so a host steps it, saves the five numbers that come back, and tells its clients when `weatherOf` changed. `weatherCommandState` is the part of `WeatherCommand` that belongs here, which is which counters each of the three forms sets and the duration it uses when the command names none.
