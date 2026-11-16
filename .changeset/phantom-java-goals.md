---
'@jsprismarine/entity-goals': patch
'@jsprismarine/prismarine': patch
---

A phantom targets and fears as Java's does. `jsprismarine:behavior.phantom_attack_player_target` runs `Phantom$PhantomAttackPlayerTargetGoal`: ten updates after it appears and every 30 after a scan, it takes the highest player in its box inflated by 16 across and 64 up and down. A swoop breaks off and drops its target while a cat is within 16 blocks, looked for once every 20 ticks, as `PhantomSweepAttackGoal` has it; `minecraft:behavior.swoop_attack` takes `scared_of` and `scare_range` keys for it. The phantom no longer flees cats and ocelots through `avoid_mob_type`, which Java's phantom has no goal for.
