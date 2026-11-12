---
"@jsprismarine/prismarine": patch
---

A store player keeps a frozen copy of the spawn point it is given, so a caller that changed its own object afterwards no longer moves the respawn point without a logged write.
