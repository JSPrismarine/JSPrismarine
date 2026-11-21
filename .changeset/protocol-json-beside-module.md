---
'@jsprismarine/protocol': patch
---

The built `java/versions/26.3/configuration` and `java/versions/26.3/blockStates` modules export `CONFIGURATION` and `BLOCK_STATES` again. The build made each module's JSON capture an entry of the same name, which replaced the module in `dist`, so a server started from the built packages failed to import `CONFIGURATION`.
