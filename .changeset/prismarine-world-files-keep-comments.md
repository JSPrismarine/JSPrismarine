---
'@jsprismarine/prismarine': patch
---

A world's `level.json` and player data files are written key by key, so a comment left in them survives the next save. They may hold `//` and `/* */` comments and trailing commas; JSON5-only syntax such as unquoted keys is no longer accepted.
