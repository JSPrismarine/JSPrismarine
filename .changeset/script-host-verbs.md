---
'@jsprismarine/prismarine': patch
---

A script's `teleport`, `setRotation`, `spawnEntity`, `kill`, `onScreenDisplay.setTitle`, `playSound`, `spawnParticle`, `playAnimation`, `setSpawnPoint`, `setDefaultSpawnLocation`, `setDifficulty` and `setAbsoluteTime` work again. Each runs a command host verb, which since the host refused a verb outside a command dispatch threw `CommandWorkOutsideDispatch` in a script. The script host now collects the work the verb starts and logs a failure in it as a warning.
