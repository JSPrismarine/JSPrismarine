---
'@jsprismarine/prismarine': patch
---

A game rule changed through `/gamerule` or `GameRuleManager.setGameRule` is now sent to every
player in the world as `GameRulesChangedPacket`. Before, a client only learned the rules once,
in `StartGamePacket`, and kept showing coordinates or running the day cycle however it had
been told at login.
