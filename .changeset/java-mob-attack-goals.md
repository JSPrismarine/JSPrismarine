---
'@jsprismarine/entity-goals': patch
'@jsprismarine/prismarine': patch
---

The blaze, the ghast and the shulker attack through their own Java goals. `jsprismarine:behavior.blaze_attack` runs `Blaze$BlazeAttackGoal`: a bite every 20 ticks inside 2 blocks, otherwise 60 ticks of charging, three fireballs 6 ticks apart and 100 ticks of rest. `jsprismarine:behavior.ghast_shoot_fireball` runs `Ghast$GhastShootFireballGoal`, a fireball every 60 ticks within 64 blocks while the ghast drifts on. `jsprismarine:behavior.shulker_attack` runs `Shulker$ShulkerAttackGoal`, a bullet every 20 to 110 ticks within 20 blocks, never on peaceful. The server swaps them in for the Bedrock ranged and melee goals these mobs carried.
