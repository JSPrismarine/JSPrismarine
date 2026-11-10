---
"@jsprismarine/engine-systems": minor
"@jsprismarine/prismarine": minor
---

Scheduled block and fluid ticks stop on a count only. `TickList.tick` and `TickScheduler.tick` no longer take a `deadline` and never read the clock, so a call that passed one must drop the argument. The server no longer stops a world's scheduled ticks after 25 ms: each list runs up to 65536 due ticks a game tick, and a slow host ticks slower instead of running fewer of them. `SCHEDULED_TICK_TIME_BUDGET_MS` is removed.
