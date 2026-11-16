---
'@jsprismarine/prismarine': patch
---

Answer the `is_underground` and `weather_at_position` filter tests for an entity, so a fox naps in the day under a roof, as Java's `Fox.SleepGoal` does, and stays awake under open sky. Goals now see what a player holds, so `minecraft:behavior.tempt` and `minecraft:behavior.float_tempt` follow a player holding a tempting item; they never started outside the goal test harness.
