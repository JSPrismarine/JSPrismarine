---
'@jsprismarine/prismarine': minor
---

Give every mob a mob's melee blow lands on the half second of invulnerability Java's `LivingEntity.hurtServer` gives it, as players and other blows already had: a blow inside it lands only for what it deals past the last one. The ender dragon's head and neck now hurt what they both touch for 10 between them, not 20.

Every entity now remembers the last blow it dealt and the last one it took, Java's `getLastHurtMob` and `getLastHurtByMob`, which its goal mob answers through `lastHurt` and `lastHurtBy`; only players did before. The ender dragon's wings read it to leave a mob alone for two ticks after a mob hurt it.

Breaking: `EntityScene.playerCombat` and `EntityRuntime.playerCombat` are renamed `combatOf`, since they now answer for any entity.
