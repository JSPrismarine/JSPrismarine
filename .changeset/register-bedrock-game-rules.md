---
'@jsprismarine/prismarine': patch
---

Register the eleven Bedrock game rules with a Java counterpart that a world lacked, at the values the pinned Bedrock Dedicated Server sends: `doLimitedCrafting`, `maxCommandChainLength`, `doInsomnia`, `commandBlocksEnabled`, `doImmediateRespawn`, `showDeathMessages`, `spawnRadius`, `freezeDamage`, `playersSleepingPercentage`, `projectilesCanBreakBlocks` and `tntExplosionDropDecay`. `/gamerule` and the client's settings screen can now change them. The rules go out in the order BDS lists them.
