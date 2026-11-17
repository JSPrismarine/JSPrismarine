---
'@jsprismarine/prismarine': patch
---

Phantoms now come only for a player who has not slept, as Java's `PhantomSpawner` sends them: every one to two minutes while the overworld sky is dark enough, over a player at or above sea level under open sky who has gone 72000 ticks or more without rest. A player's time since rest counts up every tick awake, goes back to 0 in bed or on death, and is saved as Bedrock's `TimeSinceRest`. The pack's phantom spawn rule no longer spawns them by darkness alone, and the `spawn_phantoms` game rule turns them off.
