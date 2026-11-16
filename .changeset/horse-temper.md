---
'@jsprismarine/entities': patch
'@jsprismarine/entity-goals': patch
'@jsprismarine/prismarine': patch
---

Run `minecraft:tamemount`. An untamed horse, donkey, mule, zombie horse or llama keeps a temper that starts at 0 and that Java's feeding amounts raise, and each buck with a player on its back tames it when Java's `nextInt(maxTemper)` falls below the temper, or adds 5 and throws every rider off. A buck used to dismount the horse from its own vehicle instead of throwing its rider. `GoalWorld` gains `ejectRiders` and `tameBy`.
