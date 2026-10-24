---
'@jsprismarine/prismarine': patch
---

`/ban` and `/pardon` change only the affected player's line in `banned-players.json`, so comments and formatting in the file survive. The file may hold `//` and `/* */` comments and trailing commas; JSON5-only syntax such as unquoted keys is no longer accepted. An entry without a `name` is skipped instead of banning `undefined`.
