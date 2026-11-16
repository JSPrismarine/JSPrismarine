---
'@jsprismarine/entity-goals': patch
'@jsprismarine/prismarine': patch
---

School cod, salmon and tropical fish as Java's `FollowFlockLeaderGoal` does. Every 100 to 110 goal updates a fish that neither leads nor follows gathers the free fish of its type within 8 blocks under a leader, up to the school's `high_flock_limit`; a follower paths to its leader every 10 ticks, swims at random no more, and leaves once the leader is more than 11 blocks away. `minecraft:flocking` now runs as a goal, `GoalWorld` and `GoalMob` gain an optional `school`, and `GoalSupport` gains `canRandomSwim`. A salmon school holds Java's 5, and a pufferfish or a dolphin no longer declares `minecraft:flocking`, since neither schools in Java.
