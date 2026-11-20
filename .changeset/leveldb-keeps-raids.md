---
'@jsprismarine/prismarine': patch
---

Keep running raids in the LevelDB provider's level record, so a raid going on at shutdown carries on after a restart. The provider kept the spawn, game rules, weather, world generation settings and dragon fight, and dropped the raids the level handed it.
