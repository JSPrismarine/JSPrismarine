---
'@jsprismarine/prismarine': patch
'@jsprismarine/raknet': patch
'@jsprismarine/client': patch
---

Make the server tick at a steady twenty ticks a second, and stop measuring time with a clock that can move underneath us.

The tick loop corrected the same lateness twice. `executionTime` was measured from the _end_ of the previous tick, so it already contained that tick's sleep, and `MINECRAFT_TICK_TIME_MS - executionTime` was therefore a complete drift correction on its own. The comparison of `elapsedTime` against `expectedElapsedTime` that followed applied a second one, against the accumulated total. Two corrections for one error is a loop gain of two, and the loop oscillated exactly as that predicts: it alternated a near-zero gap with a near-hundred-millisecond one, averaging a perfectly correct twenty ticks a second while never actually holding fifty milliseconds. Measured against real timers, the interval had a standard deviation of 47 ms around a 50 ms target. Everything that leaves a tick as a batch — entity movement, chunk sends — went out in pairs separated by silence, which is not what a client interpolating between updates expects to receive.

Each tick's deadline is now derived from one fixed origin, and the correction happens once. The same measurement gives a standard deviation of zero.

Lateness beyond two seconds is now written off with a `Can't keep up!` warning rather than repaid in full. A ten second stall used to be owed back as two hundred consecutive zero-delay ticks, running the world at maximum speed and starving the event loop precisely when it was already in trouble. Shorter hitches are still made up, so a brief stall does not leave the world permanently running late.

TPS is measured over a sliding one-second window instead of one that reset its own baseline whenever it crossed a second — the first reading after each reset covered a single tick and was noise reported as a rate. It is also no longer clamped to twenty: a loop making up lost time genuinely runs faster than that, and the clamp meant the one metric that should expose the fault reported perfect health throughout.

The `tick` event is awaited. A plugin's tick handler now runs inside the tick like every other piece of tick work, instead of having its continuation land in the middle of some later tick and its rejection escape as an unhandled rejection.

In RakNet, every deadline a session keeps — the retransmission timeout, the split reassembly timeout, the session timeout — and every round trip sample now comes from a monotonic clock. On `Date.now()` a forward step from an NTP correction or a suspend/resume expired all of them at once and folded a step-sized round trip into the RTT estimate; a backward step put them out of reach and stopped retransmission until real time caught up. Timestamps that travel on the wire still use `Date.now()`: they are values the peer echoes back, not durations we measure.

`Session.update()` now takes that reading itself when given no argument, because a caller mixing the two clocks does not get a slightly wrong answer, it gets epoch milliseconds compared against process-relative ones — every deadline expired at once and the session timed out on its first idle pass. An argument is still accepted, for updating several sessions against one instant and for driving time forward in a test.

The RakNet tick loop no longer stops when a session update throws. It scheduled its own next call as the last statement of the callback, so a single session raising an exception took acknowledgements, retransmissions and timeouts down permanently for every connection on the server. Each session is now isolated from the next and the loop reschedules from `finally`. It also subtracts the work it just did from the interval, so the polling rate no longer falls away as sessions are added — with three milliseconds of work per pass it had dropped from ~98 Hz to ~80 Hz.

World auto-save ran once. `currentTick / 20 === 120` is true for exactly one value of the counter, so a world was saved two minutes after startup and then never again for the life of the process; it is a remainder now. `World.save` also handed an async callback to `forEach`, which discards the returned promise, so player writes were still in flight — and their failures unobserved — after `save` had resolved. A shutdown save could report success before a single player had reached disk.
